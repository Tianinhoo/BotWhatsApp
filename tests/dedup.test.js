// [ByCodex] (BRIEF-002: regresiones del webhook y pruebas opcionales contra PostgreSQL).
// node --test tests/dedup.test.js
// PowerShell: $env:DEDUP_TEST_DATABASE='1'; node --test tests/dedup.test.js
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const vm = require("node:vm");

// Carga código real con dependencias acotadas sin iniciar servidores ni enviar WhatsApp.
function load(file, overrides, logs = []) {
  const filename = resolve(__dirname, "..", file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : nativeRequire(name),
    // [ByClaude] (BRIEF-032) process.on noop para que app.js pueda registrar SIGTERM.
    process: { env: {}, on() {} },
    console: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push(args.join(" ")),
      warn: (...args) => logs.push(args.join(" "))
    }
  }, { filename });
  return module.exports;
}

function webhook(deps, logs = []) {
  let handler;
  const app = {
    use() {}, get() {},
    // [ByClaude] (BRIEF-032) listen debe retornar server stub con .close para shutdown handler.
    listen() { return { close(done) { if (typeof done === "function") done(); } }; },
    post(route, ...handlers) {
      if (route === "/webhook") handler = handlers.at(-1);
    }
  };
  const express = Object.assign(() => app, { json: () => () => {} });
  // [ByCodex] (BRIEF-016) Verificar el aviso de arranque aparte de los logs del request.
  const startupStart = logs.length;
  load("src/app.js", {
    dotenv: { config() {} }, express,
    "./routes/dashboard": () => {},
    // [ByCodex] (Aislar la conexión del endpoint health añadido en paralelo).
    "./services/db": {},
    // [ByCodex] (BRIEF-027) Persistencia aislada para las regresiones del contrato dedup.
    "./services/inbox.service": { createInbox: () => require("./helpers/inbox-harness").memoryInbox({
      log: (...args) => logs.push(args.join(" "))
    }) },
    "./services/state.service": {},
    "./services/messages.service": {},
    ...deps
  }, logs);
  assert.deepEqual(logs.splice(startupStart), [
    "[HMAC] Modo development sin APP_SECRET — validación desactivada."
  ]);
  return async (message, expectedStatus = 200) => {
    const statuses = [];
    await handler({ body: { entry: [{ changes: [{ value: {
      messages: message ? [message] : undefined
    } }] }] } }, { sendStatus: (status) => statuses.push(status) });
    assert.deepEqual(statuses, [expectedStatus]);
  };
}

test("reserva parametrizada: primer mensaje, duplicado y error de BD", async () => {
  const calls = [];
  const failure = new Error("BD no disponible");
  let attempt = 0;
  const service = load("src/services/dedup.service.js", { "./db": {
    async query(sql, params) {
      calls.push({ sql, params: [...params] });
      if (++attempt === 3) throw failure;
      return { rowCount: attempt === 1 ? 1 : 0 };
    }
  } });
  assert.equal(await service.tryClaimMessage("wamid.test", "test-phone"), true);
  assert.equal(await service.tryClaimMessage("wamid.test", "test-phone"), false);
  await assert.rejects(service.tryClaimMessage("wamid.test", "test-phone"), failure);
  assert.deepEqual(calls[0].params, ["wamid.test", "test-phone"]);
  assert.match(calls[0].sql, /ON CONFLICT \(wamid\) DO NOTHING/);
});

test("duplicado: HTTP 200 y solo log dedup, sin invocar servicios posteriores", async () => {
  const logs = [];
  const run = webhook({ "./services/dedup.service": {
    tryClaimMessage: async () => false
  } }, logs);
  await run({ id: "wamid.duplicate", from: "test-phone" });
  assert.deepEqual(logs, ["[dedup] wamid wamid.duplicate ya procesado, ignoro."]);
});

test("error de reserva: detiene el procesamiento y conserva el HTTP 200 previo", async () => {
  const logs = [];
  const run = webhook({ "./services/dedup.service": {
    tryClaimMessage: async () => { throw new Error("BD no disponible"); }
  } }, logs);
  await run({ id: "wamid.failure", from: "test-phone" });
  assert.deepEqual(logs, ["Error procesando webhook: BD no disponible"]);
});

test("webhook de estados sin mensaje: no reserva ni produce efectos", async () => {
  const logs = [];
  const run = webhook({ "./services/dedup.service": {} }, logs);
  await run();
  assert.deepEqual(logs, []);
});

test("sin wamid rechaza sin efectos para no perder deduplicacion", async () => {
  const calls = [];
  const run = webhook({
    "./services/dedup.service": {},
    "./services/messages.service": { saveMessage: async () => calls.push("mensaje") },
    "./services/state.service": {
      registerTraffic: async () => calls.push("trafico"),
      getUserState: async () => "PAUSED_HUMAN",
      STATES: { PAUSED_HUMAN: "PAUSED_HUMAN" }
    }
  });
  await run({ from: "test-phone", type: "text", text: { body: "hola" } }, 400);
  assert.deepEqual(calls, []);
});

test("PostgreSQL: concurrencia, menú y handoff sin duplicar filas ni estado", {
  skip: process.env.DEDUP_TEST_DATABASE !== "1", timeout: 60000
}, async () => {
  require("dotenv").config({ quiet: true });
  const pool = require("../src/services/db");
  const raceId = `wamid.codex-test.${randomUUID()}`;
  let client;
  try {
    // Distintas conexiones compiten por la misma PK en la base migrada.
    const dedup = require("../src/services/dedup.service");
    const claims = await Promise.all(Array.from({ length: 8 }, () =>
      dedup.tryClaimMessage(raceId, "codex-dedup-test")
    ));
    assert.equal(claims.filter(Boolean).length, 1);
    const columns = await pool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'mensajes_procesados' AND column_name = 'wamid'
    `);
    assert.equal(columns.rows[0].data_type, "text");

    // Los efectos del árbol real viven en una transacción que siempre revierte.
    client = await pool.connect();
    await client.query("BEGIN");
    const logs = [];
    const sent = [];
    const messages = load("src/services/messages.service.js", { "./db": client }, logs);
    // [ByCodex] (BRIEF-011 / BRIEF-016) El registrador de salidas usa la misma transacción aislada.
    const outbound = load("src/services/outbound.service.js", { "./messages.service": messages }, logs);
    const state = load("src/services/state.service.js", {
      "./db": client,
      "./messages.service": messages,
      "./outbound.service": outbound,
      "./whatsapp.service": Object.fromEntries(
        ["sendTextMessage", "sendImageMessage", "sendMainMenu"].map((name) =>
          [name, async (...args) => sent.push({ name, args })])
      ),
      "./catalog-state.service": {}
    }, logs);
    const run = webhook({
      "./services/state.service": state,
      "./services/messages.service": messages,
      "./services/dedup.service": load("src/services/dedup.service.js", { "./db": client })
    }, logs);
    async function snapshot(phone) {
      const result = {};
      for (const table of ["mensajes_procesados", "clientes_whatsapp", "mensajes",
        "resumenes_atencion", "trafico_clientes"]) {
        result[table] = (await client.query(
          `SELECT * FROM ${table} WHERE telefono = $1`, [phone]
        )).rows;
      }
      return result;
    }
    for (const [text, expectedState, summaries, responses] of [
      ["hola", "MENU", 0, 2], ["6", "PAUSED_HUMAN", 1, 1]
    ]) {
      // [ByCodex] (Teléfono sintético corto compatible con columnas VARCHAR heredadas).
      const phone = `0${BigInt(`0x${randomUUID().replaceAll("-", "")}`).toString().slice(0, 14)}`;
      assert.equal((await client.query(
        "SELECT 1 FROM clientes_whatsapp WHERE telefono = $1", [phone]
      )).rowCount, 0);
      const message = { id: `wamid.${randomUUID()}`, from: phone,
        type: "text", text: { body: text } };
      const initialSent = sent.length;
      await run(message);
      assert.equal(logs.some((line) => /Error|error/i.test(line)), false, logs.join("\n"));
      const before = await snapshot(phone);
      assert.equal(before.mensajes_procesados.length, 1);
      assert.equal(before.clientes_whatsapp[0].estado_conversacion, expectedState);
      assert.equal(before.resumenes_atencion.length, summaries);
      assert.equal(before.mensajes.length, responses + 1);
      assert.equal(sent.length - initialSent, responses);
      const logCount = logs.length;
      await Promise.all([run(message), run(message)]);
      assert.deepEqual(await snapshot(phone), before);
      assert.equal(sent.length - initialSent, responses);
      // [ByCodex] (BRIEF-027) Inbox descarta antes de la reserva legacy.
      assert.deepEqual(logs.slice(logCount), []);
    }
    assert.equal(logs.some((line) => /Error|error/i.test(line)), false);
  } finally {
    try {
      if (client) {
        try { await client.query("ROLLBACK"); } finally { client.release(); }
      }
      // Solo se borra la reserva sintética de esta ejecución, identificada por UUID.
      await pool.query("DELETE FROM mensajes_procesados WHERE wamid = $1", [raceId]);
    } finally {
      await pool.end();
    }
  }
});
