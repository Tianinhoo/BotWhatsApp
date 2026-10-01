// [ByCodex] (BRIEF-011 / BRIEF-016) Rechazos reales del contrato axios y persistencia de resultados.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { fixture } = require("./helpers/outbound-harness");
const { dashboard } = require("./helpers/dashboard-harness");

for (const option of ["3", "4", "5", "6", "7"]) {
  test(`rechazo de opción ${option}: fila fallida y ninguna transición ni resumen`, async () => {
    const h = fixture();
    await assert.rejects(h.state.processMenuOption("test-phone", option), { code: "WHATSAPP_SEND_FAILED" });
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].estado_envio, "fallido");
    assert.equal(h.events[0].estado_envio, "fallido");
    assert.equal(h.writes.length, 0);
  });
}

test("menú rechazado tras saludo: registra aceptación parcial y no cambia a MENU", async () => {
  const h = fixture({ rejectAt: 2 });
  await assert.rejects(h.state.greetAndShowMenu("test-phone"), { code: "WHATSAPP_SEND_FAILED" });
  assert.deepEqual(h.rows.map(row => row.estado_envio), ["enviado", "fallido"]);
  assert.equal(h.calls[1].type, "interactive");
  assert.equal(h.writes.length, 0);
});

test("rechazo del saludo o del reenvío de menú no produce transición", async () => {
  for (const method of ["greetAndShowMenu", "showMenu"]) {
    const h = fixture();
    await assert.rejects(h.state[method]("test-phone"), { code: "WHATSAPP_SEND_FAILED" });
    assert.equal(h.rows[0].estado_envio, "fallido");
    assert.equal(h.writes.length, 0);
  }
});

test("rechazo de cada imagen corta el catálogo sin marcarlo enviado", async () => {
  for (const option of ["1", "2"]) {
    for (const rejectAt of [2, 3, 4, 5]) {
      const h = fixture({ rejectAt });
      await assert.rejects(h.state.processMenuOption("test-phone", option), { code: "WHATSAPP_SEND_FAILED" });
      assert.equal(h.calls.length, rejectAt);
      assert.equal(h.calls.at(-1).type, "image");
      assert.equal(h.rows.at(-1).estado_envio, "fallido");
      assert.equal(h.catalogMarked(), 0);
      assert.equal(h.writes.length, 0);
      assert.equal(h.rows.some(row => row.contenido === "[Catálogo enviado]"), false);
    }
  }
});

test("botones también propagan errores del transporte", async () => {
  const h = fixture();
  await assert.rejects(h.wa.sendButtonMessage({ to: "test-phone", body: "Prueba", buttons: [] }), /Transporte simulado/);
});

test("sin respuesta de Meta registra pendiente, aborta y no reintenta", async () => {
  const h = fixture({ noResponse: true });
  const result = await h.reply();
  assert.equal(result.status, 502);
  assert.equal(result.body.estado_envio, "pendiente");
  assert.match(result.body.error, /antes de reenviar/);
  assert.equal(h.rows[0].estado_envio, "pendiente");
  assert.equal(h.calls.length, 1);
});

test("dashboard retorna 502 con detalle de rechazo y registra intento fallido", async () => {
  const h = fixture();
  const result = await h.reply();
  assert.equal(result.status, 502);
  assert.match(result.body.error, /código 190/);
  assert.equal(result.body.ok, undefined);
  assert.equal(result.body.estado_envio, "fallido");
  assert.equal(h.rows[0].estado_envio, "fallido");
});

test("éxito conserva wamid del transporte, guarda aceptado y habilita transición", async () => {
  const h = fixture({ rejectAt: 0 });
  await h.state.greetAndShowMenu("test-phone");
  assert.deepEqual(h.rows.map(row => row.estado_envio), ["enviado", "enviado"]);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].params[1], "MENU");
  const reply = await h.reply();
  assert.equal(reply.status, 200);
  assert.equal(reply.body.estado_envio, "enviado");
  assert.equal(reply.body.ok, true);
});

test("error de historial tras aceptación no se registra como rechazo ni reenvía", async () => {
  const h = fixture({ rejectAt: 0, historyFailure: true });
  const reply = await h.reply();
  assert.equal(reply.status, 500);
  assert.match(reply.body.error, /aceptó el mensaje/);
  assert.equal(h.rows.length, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, 0);
});

test("rechazo más error de historial conserva 502 y bloquea la transición", async () => {
  const h = fixture({ historyFailure: true });
  const reply = await h.reply();
  assert.equal(reply.status, 502);
  assert.match(reply.body.error, /Tampoco se pudo guardar/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, 0);
});

test("dashboard distingue fallido, incierto, aceptado e histórico sin afirmar entrega", async () => {
  const h = await dashboard();
  const loading = h.context.selectConversation("A");
  h.requests[0].resolve(["fallido", "pendiente", "enviado", null].map(estado_envio => ({
    telefono: "A", origen: "bot", contenido: "<texto>", estado_envio
  })));
  h.requests[1].resolve({ telefono: "A", es_pausa_humana: false });
  await loading;
  const bubbles = h.get("thread").children;
  assert.match(bubbles[0].className, /failed/);
  assert.match(bubbles[0].innerHTML, /Fallido/);
  assert.match(bubbles[1].innerHTML, /Resultado por confirmar/);
  assert.match(bubbles[2].innerHTML, /Aceptado por WhatsApp · entrega sin confirmar/);
  assert.match(bubbles[3].innerHTML, /Sin estado/);
  assert.match(bubbles[0].innerHTML, /&lt;texto&gt;/);
});

test("PostgreSQL: fallo persistido, estado conservado y respuesta aceptada sin envío real", {
  skip: process.env.DEDUP_TEST_DATABASE !== "1", timeout: 60000
}, async () => {
  require("dotenv").config({ quiet: true });
  const pool = require("../src/services/db");
  let client;
  const phone = `0${BigInt(`0x${randomUUID().replaceAll("-", "")}`).toString().slice(0, 14)}`;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    assert.equal((await client.query("SELECT 1 FROM clientes_whatsapp WHERE telefono=$1", [phone])).rowCount, 0);
    const h = fixture({ db: client });
    await h.state.setUserState(phone, "MENU");
    await assert.rejects(h.state.processMenuOption(phone, "6"), { code: "WHATSAPP_SEND_FAILED" });
    assert.equal(await h.state.getUserState(phone), "MENU");
    assert.equal((await client.query("SELECT * FROM resumenes_atencion WHERE telefono=$1", [phone])).rowCount, 0);
    const rejected = (await client.query("SELECT estado_envio FROM mensajes WHERE telefono=$1", [phone])).rows;
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].estado_envio, "fallido");
    const reply = await fixture({ db: client }).reply(phone);
    assert.equal(reply.status, 502);
    const accepted = await fixture({ db: client, rejectAt: 0 }).reply(phone);
    assert.equal(accepted.status, 200);
    const rows = (await client.query("SELECT estado_envio FROM mensajes WHERE telefono=$1 ORDER BY id", [phone])).rows;
    assert.deepEqual(rows.map(row => row.estado_envio), ["fallido", "fallido", "enviado"]);
    assert.equal(await h.state.getUserState(phone), "MENU");
  } finally {
    try {
      if (client) {
        try { await client.query("ROLLBACK"); } finally { client.release(); }
      }
    } finally { await pool.end(); }
  }
});
