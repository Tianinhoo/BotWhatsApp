// [ByCodex] (BRIEF-016) Contrato de producto: una selección de menú nunca es interés del cliente.
// Archivo separado de los tests de Claude para no interferir con BRIEF-015/017.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildFromContext } = require("../src/services/summary.service");
const { dashboard } = require("./helpers/dashboard-harness");

test("resumen: '6' sin modelo ni color no puede convertirse en interés", () => {
  const summary = buildFromContext({ phone: "test", clientMessages: [{ contenido: "6" }] });
  assert.notEqual(summary.interes_color, "6");
});

test("resumen: comandos 1–7 no producen necesidad y no se descarta texto con talla", () => {
  for (const command of ["1", "2", "3", "4", "5", "6", "7"]) {
    const summary = buildFromContext({ phone: "test", clientMessages: [{ contenido: ` ${command} ` }] });
    assert.notEqual(summary.interes_color, command);
    assert.equal(summary.necesidad, "Por confirmar");
  }
  const summary = buildFromContext({ phone: "test", clientMessages: [{ contenido: "Talla 6 para mi hija" }] });
  assert.match(summary.necesidad, /Talla 6/);
});

test("resumen: texto de necesidad seguido de '6' conserva el contexto sin usar el comando", () => {
  const summary = buildFromContext({ phone: "test", clientMessages: [
    { contenido: "Necesito un vestido para una boda" }, { contenido: "6" }
  ] });
  assert.notEqual(summary.interes_color, "6");
  assert.match(`${summary.interes_color || ""} ${summary.necesidad || ""}`, /boda/);
});

test("resumen: el caso original Modelo 2 + '6' no muestra una opción como interés", () => {
  const summary = buildFromContext({ phone: "test", clientMessages: [
    { contenido: "Quiero el Modelo 2 en talla M" }, { contenido: "6" }
  ] });
  assert.equal(summary.modelo_seleccionado, "Modelo 2");
  assert.notEqual(summary.interes_color, "6");
});

test("dashboard muestra Necesidad escapada y fallback cuando falta el dato", async () => {
  for (const necesidad of ["Para <evento> el sábado", undefined]) {
    const h = await dashboard();
    const loading = h.context.selectConversation("A");
    h.requests[0].resolve([]);
    h.requests[1].resolve({ telefono: "A", es_pausa_humana: true, necesidad });
    await loading;
    const card = h.get("handoff-card").innerHTML;
    assert.match(card, />Origen</);
    assert.match(card, />Modelo</);
    assert.match(card, />Interés</);
    assert.match(card, />Necesidad</);
    assert.match(card, necesidad ? /Para &lt;evento&gt; el sábado/ : /Por confirmar/);
  }
});
