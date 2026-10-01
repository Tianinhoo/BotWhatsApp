// [ByCodex] (BRIEF-022) /health real con BD simulada y timeout determinista sin espera de pared.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { appHarness } = require("./helpers/app-harness");

test("health BD up: 200, db up y uptime entero calculado desde el arranque", async () => {
  const fixture = appHarness({ query: async () => ({ rows: [{ "?column?": 1 }] }) });
  await fixture.advance(4250);
  const response = await fixture.health();
  assert.deepEqual(response, { status: 200, writes: 1,
    body: { ok: true, db: "up", uptime_s: 4 } });
  assert.equal(Number.isInteger(response.body.uptime_s), true);
  assert.deepEqual(fixture.queries, ["SELECT 1"]);
  assert.deepEqual(fixture.calls, []);
});

test("health BD down: un rechazo de pool.query responde 503 con el error", async () => {
  const fixture = appHarness({ query: async () => { throw new Error("conexion_bd_rechazada"); } });
  assert.deepEqual(await fixture.health(), { status: 503, writes: 1,
    body: { ok: false, db: "down", error: "conexion_bd_rechazada" } });
  assert.deepEqual(fixture.queries, ["SELECT 1"]);
  assert.deepEqual(fixture.calls, []);
});

test("health timeout: query pendiente no responde antes de 2 s y luego devuelve 503", async () => {
  const fixture = appHarness({ query: () => new Promise(() => {}) });
  let completed = false;
  const pending = fixture.health().then(response => { completed = true; return response; });
  assert.deepEqual(fixture.queries, ["SELECT 1"]);
  assert.equal(fixture.timers.length, 1);
  assert.equal(fixture.timers[0].delay, 2000);
  await fixture.advance(1999);
  assert.equal(completed, false);
  await fixture.advance(1);
  assert.deepEqual(await pending, { status: 503, writes: 1,
    body: { ok: false, db: "down", error: "db_timeout" } });
  assert.deepEqual(fixture.calls, []);
});

test("health captura también un throw síncrono de pool.query", async () => {
  const fixture = appHarness({ query: () => { throw new Error("pool_cerrado"); } });
  assert.deepEqual(await fixture.health(), { status: 503, writes: 1,
    body: { ok: false, db: "down", error: "pool_cerrado" } });
  assert.deepEqual(fixture.queries, ["SELECT 1"]);
});
