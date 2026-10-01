// [ByCodex] (BRIEF-026) Webhook, cola y state.service reales; transporte/BD aislados.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { appHarness } = require("./helpers/app-harness");
const { fixture } = require("./helpers/state-harness");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function body(id, text, phone = "00000001234") {
  return Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { messages: [{
    id, from: phone, type: "text", text: { body: text }
  }] } }] }] }));
}
function integration({ beforeSend, claim = async () => true } = {}) {
  const states = new Map(), incoming = [], claims = [];
  const motor = fixture({ beforeSend, query: async (sql, params) => {
    if (/SELECT estado_conversacion/.test(sql)) {
      return { rows: [{ estado_conversacion: states.get(params[0]) || "MENU" }] };
    }
    if (/INSERT INTO clientes_whatsapp/.test(sql)) states.set(params[0], params[1]);
    return { rows: [] };
  } });
  const app = appHarness({ overrides: {
    "./services/state.service": motor.state,
    "./services/messages.service": { async saveMessage(...args) { incoming.push(args); } },
    "./services/dedup.service": { async tryClaimMessage(...args) { claims.push(args[0]); return claim(...args); } }
  } });
  return { app, motor, states, incoming, claims };
}

test("B1: catalogo en vuelo seguido de asesora termina pausado y luego guarda sin responder", async () => {
  const gate = deferred(), started = deferred();
  const h = integration({ beforeSend: async call => {
    if (call.type === "image") { started.resolve(); await gate.promise; }
  } });
  const first = h.app.webhook(body("wamid.catalog", "1"));
  await started.promise;
  const second = h.app.webhook(body("wamid.handoff", "6"));
  await tick();
  const claimsWhileBlocked = [...h.claims];
  gate.resolve();
  const responses = await Promise.all([first, second]);
  assert.equal(h.states.get("00000001234"), "PAUSED_HUMAN");
  assert.deepEqual(claimsWhileBlocked, ["wamid.catalog"]);
  assert.deepEqual(h.motor.transitions().map(row => row[1]), ["CATALOG", "PAUSED_HUMAN"]);
  assert.equal(h.motor.summaries.length, 1);
  assert.equal(h.motor.sent.filter(call => call.type === "image").length, 4);
  assert.ok(responses.every(response => response.status === 200 && response.writes === 1));
  const sent = h.motor.sent.length;
  await h.app.webhook(body("wamid.after", "hola"));
  assert.equal(h.motor.sent.length, sent);
  assert.equal(h.incoming.at(-1)[2], "hola");
  assert.equal(h.app.logs.some(log => log.level === "error"), false);
});

test("webhook: dedup lenta conserva orden antes de trafico, historial y estado", async () => {
  const gate = deferred(), started = deferred();
  const h = integration({ claim: async id => {
    if (id === "wamid.slow") { started.resolve(); await gate.promise; }
    return true;
  } });
  const first = h.app.webhook(body("wamid.slow", "3"));
  await started.promise;
  const second = h.app.webhook(body("wamid.fast", "6"));
  await tick();
  const pending = { claims: [...h.claims], incoming: h.incoming.length, queries: h.motor.queries.length };
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(pending, { claims: ["wamid.slow"], incoming: 0, queries: 0 });
  assert.deepEqual(h.incoming.map(row => row[2]), ["3", "6"]);
  assert.deepEqual(h.motor.transitions().map(row => row[1]), ["MENU", "PAUSED_HUMAN"]);
});

test("webhook: otro telefono recibe atencion mientras el catalogo esta pendiente", async () => {
  const gate = deferred(), started = deferred();
  const h = integration({ beforeSend: async call => {
    if (call.type === "image") { started.resolve(); await gate.promise; }
  } });
  const first = h.app.webhook(body("wamid.A", "1", "00000000001"));
  await started.promise;
  let second;
  try {
    second = await h.app.webhook(body("wamid.B", "6", "00000000002"));
    assert.equal(h.states.get("00000000002"), "PAUSED_HUMAN");
    assert.equal(h.states.has("00000000001"), false);
  } finally { gate.resolve(); await first; }
  assert.equal(second.status, 200);
});

test("webhook: fallo incierto conserva sucesores pendientes hasta revision", async () => {
  const gate = deferred(), started = deferred();
  const h = integration({ claim: async id => {
    if (id === "wamid.fail") { started.resolve(); await gate.promise; throw new Error("fallo simulado"); }
    return true;
  } });
  const first = h.app.webhook(body("wamid.fail", "1"));
  await started.promise;
  const second = h.app.webhook(body("wamid.next", "6"));
  gate.resolve();
  await Promise.all([first, second]);
  // [ByCodex] (BRIEF-027) No perder ni adelantar el sucesor frente a un fallo incierto.
  assert.deepEqual(h.incoming, []);
  assert.equal(h.app.inbox.records.get("wamid.fail").estado, "revision");
  assert.equal(h.app.inbox.records.get("wamid.next").estado, "recibido");
  assert.equal(h.app.logs.filter(log => log.level === "error").length, 1);
});

test("webhook: duplicado concurrente reserva una vez y solo genera un handoff", async () => {
  const claimed = new Set();
  const h = integration({ claim: async id => {
    if (claimed.has(id)) return false;
    claimed.add(id); return true;
  } });
  await Promise.all([h.app.webhook(body("wamid.same", "6")), h.app.webhook(body("wamid.same", "6"))]);
  assert.equal(h.incoming.length, 1);
  assert.equal(h.motor.sent.length, 1);
  assert.equal(h.motor.summaries.length, 1);
});

// [ByCodex] (BRIEF-029) Motor real: BD no disponible no despierta una pausa humana.
test("lectura de estado fallida no envia ni modifica estado o resumen", async () => {
  const motor = fixture({ query: async (sql) => {
    if (/SELECT estado_conversacion/.test(sql)) throw new Error("read unavailable");
    return { rows: [] };
  } });
  const app = appHarness({ overrides: { "./services/state.service": motor.state } });
  await app.webhook(body("wamid.state-fail", "1"));
  assert.equal(motor.sent.length, 0);
  assert.equal(motor.transitions().length, 0);
  assert.equal(motor.summaries.length, 0);
  assert.ok(app.logs.some(log => log.level === "error"));
});

// [ByCodex] (BRIEF-028) Lotes reales con todos los niveles y contactos por telefono.
test("webhook recorre entries/changes/messages y conserva cada contacto", async () => {
  const h = integration();
  const message = (id, from) => ({ id, from, type: "text", text: { body: "6" } });
  const payload = { entry: [
    { changes: [{ value: {
      contacts: [{ wa_id: "00000000002", referral: { source_id: "ad-B" } },
                 { wa_id: "00000000001", referral: { source_id: "ad-A" } }],
      messages: [message("batch-a", "00000000001"), message("batch-b", "00000000002")]
    } }, { value: { messages: [message("batch-c", "00000000003")] } }] },
    { changes: [{ value: { statuses: [{ id: "delivery" }] } },
                { value: { messages: [message("batch-d", "00000000004")] } }] }
  ] };
  const response = await h.app.webhook(Buffer.from(JSON.stringify(payload)));
  assert.deepEqual(h.claims, ["batch-a", "batch-b", "batch-c", "batch-d"]);
  assert.equal(h.incoming.length, 4);
  assert.equal(h.motor.summaries.length, 4);
  assert.equal(response.writes, 1);
  const traffic = h.motor.queries.filter(q => /INSERT INTO trafico_clientes/.test(q.sql));
  assert.ok(JSON.stringify(traffic.find(q => q.params[0] === "00000000001").params).includes("ad-A"));
  assert.ok(JSON.stringify(traffic.find(q => q.params[0] === "00000000002").params).includes("ad-B"));
});

test("lote: fallo de un mensaje no descarta el siguiente del mismo telefono", async () => {
  const h = integration({ claim: async id => { if (id === "bad") throw new Error("db fail"); return true; } });
  const payload = JSON.parse(body("bad", "1").toString());
  payload.entry[0].changes[0].value.messages.push({ id: "good", from: "00000001234", type: "text", text: { body: "6" } });
  await h.app.webhook(Buffer.from(JSON.stringify(payload)));
  // [ByCodex] (BRIEF-027) Guardado durable, sin saltar un resultado incierto.
  assert.deepEqual(h.claims, ["bad"]);
  assert.equal(h.app.inbox.records.get("bad").estado, "revision");
  assert.equal(h.app.inbox.records.get("good").estado, "recibido");
  assert.equal(h.motor.summaries.length, 0);
});

test("lote: telefono distinto avanza mientras el primero espera", async () => {
  const gate = deferred(), entered = deferred(), other = deferred();
  const h = integration({ claim: async (id) => {
    if (id === "slow") { entered.resolve(); await gate.promise; }
    if (id === "other") other.resolve();
    return true;
  } });
  const payload = JSON.parse(body("slow", "1", "00000000001").toString());
  payload.entry[0].changes[0].value.messages.push({ id: "other", from: "00000000002", type: "text", text: { body: "6" } });
  const running = h.app.webhook(Buffer.from(JSON.stringify(payload)));
  try {
    await entered.promise; await other.promise; await tick();
    assert.equal(h.states.get("00000000002"), "PAUSED_HUMAN");
    assert.equal(h.states.has("00000000001"), false);
  } finally { gate.resolve(); await running; }
});

test("webhook de estados o estructura incompleta no genera respuestas", async () => {
  const h = integration();
  for (const payload of [null, {}, { entry: {} }, { entry: [null, { changes: [null, { value: { messages: {}, statuses: [{}] } }] }] }]) {
    const r = await h.app.webhook(Buffer.from(JSON.stringify(payload)));
    assert.equal(r.status, 200);
  }
  assert.equal(h.claims.length, 0);
  assert.equal(h.motor.sent.length, 0);
});
