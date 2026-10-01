// [ByCodex] (BRIEF-014 / BRIEF-016) Regresiones de destinatario, carga y envío con latencia.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dashboard, resolveLoad } = require("./helpers/dashboard-harness");

test("A lento no sobrescribe hilo ni resumen de B", async () => {
  const h = await dashboard();
  const a = h.context.selectConversation("A");
  const b = h.context.selectConversation("B");
  assert.equal(h.get("reply-input").disabled, true);
  resolveLoad(h, "B"); await b;
  resolveLoad(h, "A"); await a;
  assert.match(h.get("thread-header").innerHTML, />B</);
  assert.match(h.get("thread").children[0].innerHTML, /Mensaje B/);
  assert.match(h.get("handoff-card").innerHTML, /Interés B/);
  assert.equal(h.get("reply-input").disabled, false);
});

test("A → B → A descarta también la primera generación de A", async () => {
  const h = await dashboard();
  const a1 = h.context.selectConversation("A");
  const b = h.context.selectConversation("B");
  const start = h.requests.length;
  const a2 = h.context.selectConversation("A");
  resolveLoad(h, "A", start); await a2;
  const current = h.get("thread").children[0];
  resolveLoad(h, "A"); await a1;
  resolveLoad(h, "B"); await b;
  assert.equal(h.get("thread").children[0], current);
  assert.match(h.get("handoff-card").innerHTML, /Interés A/);
});

test("limpia borrador al cambiar y espera hilo MÁS resumen antes de habilitar", async () => {
  const h = await dashboard();
  h.get("reply-input").value = "Borrador de A";
  const loading = h.context.selectConversation("B");
  assert.equal(h.get("reply-input").value, "");
  h.requests[0].resolve([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.get("reply-send").disabled, true);
  h.requests[1].resolve({ telefono: "B", es_pausa_humana: false });
  await loading;
  assert.equal(h.get("reply-send").disabled, false);
});

test("payload de otro cliente o error actual deja envío bloqueado", async () => {
  for (const mismatch of [true, false]) {
    const h = await dashboard();
    const loading = h.context.selectConversation("A");
    h.requests[0].resolve([]);
    if (mismatch) h.requests[1].resolve({ telefono: "B" });
    else h.requests[1].reject(new Error("fallo de red"));
    await loading;
    assert.equal(h.get("reply-input").disabled, true);
    assert.equal(h.get("handoff-card").classList.contains("show"), false);
    h.get("reply-input").value = "No enviar";
    await h.context.sendReply();
    assert.equal(h.requests.length, 2);
  }
});

test("error tardío de A no oculta el resumen de B", async () => {
  const h = await dashboard();
  const a = h.context.selectConversation("A");
  const b = h.context.selectConversation("B");
  resolveLoad(h, "B"); await b;
  h.requests[0].reject(new Error("fallo viejo")); await a;
  assert.match(h.get("handoff-card").innerHTML, /Interés B/);
  assert.equal(h.get("reply-send").disabled, false);
});

test("envío captura destinatario al click, bloquea Enter duplicado y conserva borrador de B", async () => {
  const h = await dashboard();
  const a = h.context.selectConversation("A"); resolveLoad(h, "A"); await a;
  h.get("reply-input").value = "Para A";
  const sending = h.context.sendReply();
  await h.get("reply-input").listeners.keydown({ key: "Enter" });
  assert.equal(h.requests.filter(r => r.opts.method === "POST").length, 1);
  const post = h.requests.find(r => r.opts.method === "POST");
  assert.equal(post.url, "/dashboard/api/conversation/A/reply");
  const b = h.context.selectConversation("B"); resolveLoad(h, "B"); await b;
  h.get("reply-input").value = "Borrador de B";
  post.resolve({ ok: true }); await sending;
  assert.equal(h.get("reply-input").value, "Borrador de B");
  assert.match(h.get("thread-header").innerHTML, />B</);
  assert.equal(h.get("reply-send").disabled, false);
  const sendingB = h.context.sendReply();
  const postB = h.requests.at(-1);
  assert.equal(postB.url, "/dashboard/api/conversation/B/reply");
  h.context.showLogin(); postB.resolve({ ok: true }); await sendingB;
});

test("logout invalida las cargas pendientes", async () => {
  const h = await dashboard();
  const loading = h.context.selectConversation("A");
  h.context.showLogin();
  resolveLoad(h, "A"); await loading;
  assert.equal(h.get("thread").children.length, 0);
  assert.equal(h.get("handoff-card").innerHTML, "");
  assert.equal(h.get("reply-send").disabled, true);
});

test("refrescos SSE del mismo cliente conservan solo la carga más reciente", async () => {
  const h = await dashboard();
  const first = h.context.selectConversation("A");
  const start = h.requests.length;
  const latest = h.context.loadThread("A");
  resolveLoad(h, "A", start); await latest;
  const current = h.get("thread").children[0];
  resolveLoad(h, "A"); await first;
  assert.equal(h.get("thread").children[0], current);
});

// [ByCodex] (BRIEF-011 / BRIEF-016) El error de envío se refleja sin perder el texto a corregir.
test("rechazo de respuesta recarga el intento fallido y conserva el borrador", async () => {
  const h = await dashboard();
  const loading = h.context.selectConversation("A"); resolveLoad(h, "A"); await loading;
  h.get("reply-input").value = "Respuesta rechazada";
  const sending = h.context.sendReply();
  h.requests.at(-1).reject(new Error("WhatsApp rechazó el envío"));
  await new Promise(resolve => setImmediate(resolve));
  h.requests.at(-2).resolve([{ telefono: "A", origen: "bot", contenido: "Respuesta rechazada", estado_envio: "fallido" }]);
  h.requests.at(-1).resolve({ telefono: "A", es_pausa_humana: false });
  await sending;
  assert.match(h.get("thread").children[0].className, /failed/);
  assert.equal(h.get("reply-input").value, "Respuesta rechazada");
  assert.equal(h.get("reply-send").disabled, false);
  assert.equal(h.alerts.length, 1);
});

// [ByCodex] (BRIEF-014 / BRIEF-016) La reanudación tampoco puede actualizar otro panel.
test("reanudar A y cambiar a B no recarga ni modifica B al terminar", async () => {
  const h = await dashboard();
  const a = h.context.selectConversation("A"); resolveLoad(h, "A"); await a;
  const resuming = h.context.resumeBot("A");
  const post = h.requests.at(-1);
  const b = h.context.selectConversation("B"); resolveLoad(h, "B"); await b;
  const count = h.requests.length;
  post.resolve({ ok: true }); await resuming;
  assert.equal(h.requests.length, count);
  assert.match(h.get("handoff-card").innerHTML, /Interés B/);
});
