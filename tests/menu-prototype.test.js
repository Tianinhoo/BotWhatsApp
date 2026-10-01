// ======================================================
// tests/menu-prototype.test.js — Regresión de BRIEF-023
// [ByClaude] (BRIEF-023)
// ======================================================
//
// Verifica que `resolveMenuOption` NUNCA devuelva valores heredados de
// `Object.prototype` (constructor, __proto__, toString, hasOwnProperty,
// valueOf, isPrototypeOf, propertyIsEnumerable, toLocaleString).
//
// Bug detectado por Codex durante BRIEF-021: `MENU_OPTIONS[key]` sin
// chequear `Object.hasOwn` retornaba funciones/valores heredados que
// eran truthy, y `app.js` los tomaba como opción válida. El cliente
// recibía silencio en vez de la ayuda habitual.

const test = require("node:test");
const assert = require("node:assert/strict");

const { fixture } = require("./helpers/state-harness");


// [ByClaude] (BRIEF-023) Todas las claves heredadas conocidas de Object.prototype
// que un cliente podría enviar por casualidad o adrede.
const INHERITED_KEYS = [
  "constructor",
  "__proto__",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString"
];


for (const key of INHERITED_KEYS) {
  test(`resolveMenuOption('${key}') devuelve null (no clave propia)`, () => {
    const f = fixture();
    const resolved = f.state.resolveMenuOption(key);
    assert.equal(resolved, null,
      `'${key}' es heredado de Object.prototype y NO debe matchear el menú`);
  });
}


test("resolveMenuOption normaliza y sigue rechazando 'CONSTRUCTOR' con mayúsculas y espacios", () => {
  const f = fixture();
  assert.equal(f.state.resolveMenuOption("  Constructor  "), null);
  assert.equal(f.state.resolveMenuOption("__PROTO__"), null);
});


test("processMenuOption('constructor') retorna no_match y no envía nada", async () => {
  const f = fixture();
  const result = await f.state.processMenuOption("59170000001", "constructor");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_match");
  assert.equal(f.sent.length, 0, "no debe enviar ningún mensaje");
  assert.equal(f.summaries.length, 0, "no debe generar resumen");
});


test("processMenuOption('__proto__') retorna no_match y no envía nada", async () => {
  const f = fixture();
  const result = await f.state.processMenuOption("59170000002", "__proto__");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_match");
  assert.equal(f.sent.length, 0);
  assert.equal(f.summaries.length, 0);
});


// [ByClaude] (BRIEF-023) Confirmar que las 7 opciones válidas siguen funcionando
// después del fix (regresión negativa: no rompimos nada).
const VALID_INPUTS = [
  { input: "1", expectedId: "catalogo" },
  { input: "catalogo", expectedId: "catalogo" },
  { input: "2", expectedId: "modelos" },
  { input: "modelos", expectedId: "modelos" },
  { input: "3", expectedId: "precios_tallas" },
  { input: "4", expectedId: "stock" },
  { input: "5", expectedId: "envios" },
  { input: "6", expectedId: "asesor" },
  { input: "asesor", expectedId: "asesor" },
  { input: "7", expectedId: "contacto" }
];

for (const { input, expectedId } of VALID_INPUTS) {
  test(`resolveMenuOption('${input}') sigue matcheando id '${expectedId}' tras el fix`, () => {
    const f = fixture();
    const resolved = f.state.resolveMenuOption(input);
    assert.ok(resolved, `'${input}' debe seguir siendo opción válida`);
    assert.equal(resolved.id, expectedId);
  });
}
