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

test("webhook: fallo de dedup no salta los mensajes siguientes ya encolados", async () => {
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
  assert.deepEqual(h.incoming.map(row => row[2]), ["6"]);
  assert.equal(h.states.get("00000001234"), "PAUSED_HUMAN");
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
