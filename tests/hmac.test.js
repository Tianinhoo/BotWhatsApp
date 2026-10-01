// [ByCodex] (BRIEF-022) Regresiones HMAC y guard de arranque con app.js real aislado.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { appHarness, incomingBody, sign } = require("./helpers/app-harness");

const SECRET = "hmac-secret-exclusivo-para-tests";
const signatureHeader = signature => ({ "x-hub-signature-256": signature });

function assertProcessed(fixture) {
  assert.deepEqual(fixture.calls, [
    { name: "tryClaimMessage", args: ["wamid.hmac.test", "00000001234"] },
    { name: "registerTraffic", args: ["00000001234", "organico", null] },
    { name: "saveMessage", args: ["00000001234", "cliente", "hola"] },
    { name: "getUserState", args: ["00000001234"] },
    { name: "greetAndShowMenu", args: ["00000001234"] }
  ]);
  assert.equal(fixture.logs.some(log => log.level === "error"), false);
}

test("HMAC válido en production: responde 200 y procesa el mensaje después de validar", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "production", APP_SECRET: SECRET } });
  const body = incomingBody();
  assert.deepEqual(await fixture.webhook(body, signatureHeader(sign(body, SECRET))),
    { status: 200, writes: 1 });
  assertProcessed(fixture);
  assert.deepEqual(fixture.listenCalls, [3000]);
  assert.equal(fixture.logs.some(log => log.level === "warn"), false);
});

test("HMAC inválido de igual longitud: 403 sin reservar ni procesar el mensaje", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "staging", APP_SECRET: SECRET } });
  const body = incomingBody();
  const response = await fixture.webhook(body, signatureHeader(sign(body, "otro-secreto")));
  assert.deepEqual(response, { status: 403, writes: 1 });
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.logs, [
    { level: "warn", message: "❌ Firma HMAC del webhook inválida." }
  ]);
});

test("HMAC sin firma con APP_SECRET configurado en test: 403 sin efectos", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "test", APP_SECRET: SECRET } });
  assert.deepEqual(await fixture.webhook(incomingBody()), { status: 403, writes: 1 });
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.logs, [
    { level: "warn", message: "❌ Falta firma X-Hub-Signature-256 en el webhook." }
  ]);
});

for (const environment of ["development", "test"]) {
  test(`HMAC ${environment} sin APP_SECRET: permite procesar y advierte una vez al arrancar`, async () => {
    const fixture = appHarness({ env: { NODE_ENV: environment } });
    const warning = { level: "warn",
      message: `[HMAC] Modo ${environment} sin APP_SECRET — validación desactivada.` };
    assert.deepEqual(fixture.logs, [warning]);
    assert.deepEqual(await fixture.webhook(incomingBody()), { status: 200, writes: 1 });
    assertProcessed(fixture);
    fixture.calls.length = 0;
    await fixture.webhook(incomingBody());
    assertProcessed(fixture);
    assert.deepEqual(fixture.logs.filter(log => log.level === "warn"), [warning]);
  });
}

test("HMAC staging sin APP_SECRET: 500 con log de rechazo y sin efectos", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "staging" } });
  assert.deepEqual(fixture.logs, []);
  assert.deepEqual(await fixture.webhook(incomingBody()), { status: 500, writes: 1 });
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.logs, [{ level: "warn",
    message: "[HMAC] APP_SECRET faltante en NODE_ENV=staging — rechazo." }]);
});

test("HMAC production sin APP_SECRET: aborta el arranque antes de app.listen", () => {
  const listenCalls = [];
  assert.throws(() => appHarness({ env: { NODE_ENV: "production" }, listenCalls }),
    /APP_SECRET obligatorio en producción para validar webhooks de Meta\./);
  assert.deepEqual(listenCalls, []);
});

for (const [label, signature] of [
  ["corta", "sha256=abc"],
  ["larga", `sha256=${"a".repeat(80)}`],
  ["prefijo incorrecto", `sha512=${"a".repeat(64)}`]
]) {
  test(`HMAC firma ${label}: rechaza con 403 sin excepción de timingSafeEqual`, async () => {
    const fixture = appHarness({ env: { NODE_ENV: "development", APP_SECRET: SECRET } });
    assert.deepEqual(await fixture.webhook(incomingBody(), signatureHeader(signature)),
      { status: 403, writes: 1 });
    assert.deepEqual(fixture.calls, []);
    assert.equal(fixture.logs.some(log => log.message.includes("inválida")), true);
  });
}

test("HMAC no acepta un cuerpo modificado después de firmarlo", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "production", APP_SECRET: SECRET } });
  const original = incomingBody();
  const modified = Buffer.from(original.toString().replace("hola", "chau"));
  assert.deepEqual(await fixture.webhook(modified, signatureHeader(sign(original, SECRET))),
    { status: 403, writes: 1 });
  assert.deepEqual(fixture.calls, []);
});

test("HMAC usa bytes originales del JSON con espacios, no una reserialización", async () => {
  const fixture = appHarness({ env: { NODE_ENV: "production", APP_SECRET: SECRET } });
  const body = Buffer.from(JSON.stringify(JSON.parse(incomingBody().toString()), null, 2));
  assert.deepEqual(await fixture.webhook(body, signatureHeader(sign(body, SECRET))),
    { status: 200, writes: 1 });
  assertProcessed(fixture);
});
