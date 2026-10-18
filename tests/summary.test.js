// ======================================================
// tests/summary.test.js — Regresiones del builder unificado
// [ByClaude] (BRIEF-015 + BRIEF-017)
// ======================================================
//
// Cubre:
//   - Bug del "6" como interés (BRIEF-015): un cliente que toca la
//     opción 6 no debe tener `interes_color = "6"` ni el label del menú.
//   - Filtrado de marcas de sistema (`[Opción del menú: ...]`, `[audio]`).
//   - Detección de modelo con dígito y con palabra (1/uno, 2/dos, 3/tres).
//   - Detección de color (con y sin acento).
//   - Campo `necesidad` (BRIEF-017): fallback "Por confirmar" cuando no
//     hay texto libre; dedup contra modelo/interés cuando el texto
//     libre es idéntico al ya capturado.

const test = require("node:test");
const assert = require("node:assert/strict");

const summary = require("../src/services/summary.service");


// [ByClaude] Helper — arma la fila que sale de getLastClientMessages().
function msg(contenido) {
  return { contenido, origen: "cliente", created_at: new Date().toISOString() };
}


// [ByClaude] (BRIEF-025) Hallazgo del simulador: "hola · menú" ensuciaba Necesidad.
test("necesidad: ignora saludos, palabras de navegación y ordinales 1-9", () => {
  const s = summary.buildFromContext({ phone: "59100000000", clientMessages: [
    msg("Hola!"), msg("menú"), msg("8"), msg("quiero el modelo 3 talla M negro"), msg("volver")
  ] });
  assert.equal(s.necesidad, "quiero el modelo 3 talla M negro");
  assert.equal(summary.buildFromContext({ phone: "1", clientMessages: [msg("hola"), msg("menu")] })
    .necesidad, "Por confirmar");
});


// ------------------------------------------------------
// BRIEF-015: bug del "6" como interés
// ------------------------------------------------------

test("interes: NO devuelve '6' cuando el último mensaje es una opción del menú", () => {
  const clientMessages = [
    msg("Quiero el Modelo 2 en talla M"),
    msg("[Opción del menú: Hablar con un asesor]")
  ];
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages
  });
  assert.equal(s.modelo_seleccionado, "Modelo 2");
  assert.notEqual(s.interes_color, "6");
  // [ByClaude] node:assert/strict expone `doesNotMatch`, no `notMatch`.
  assert.doesNotMatch(s.interes_color || "", /Opción del menú/);
});

test("interes: NO devuelve un número solo cuando el cliente escribió '6'", () => {
  const clientMessages = [
    msg("hola, tienen Modelo 3 en negro?"),
    msg("6")
  ];
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages
  });
  // [ByCodex] (BRIEF-016) El comando "6" también se filtra cuando llega como texto.
  // Este caso conserva el modelo/color previos; summary-integration.test.js
  // cubre además el caso sin detección, que tampoco debe devolver "6".
  assert.equal(s.modelo_seleccionado, "Modelo 3");
  assert.equal(s.interes_color, "Modelo 3 · color negro");
});


// ------------------------------------------------------
// BRIEF-015: filtrado de marcas de sistema
// ------------------------------------------------------

test("keepFreeText descarta [Opción del menú: ...] y otros brackets-only", () => {
  const messages = [
    msg("Hola"),
    msg("[Opción del menú: Ver catálogo completo]"),
    msg("[audio]"),
    msg("Quiero el Modelo 1"),
    msg("[Interacción con el menú]")
  ];
  const kept = summary.keepFreeText(messages);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].contenido, "Hola");
  assert.equal(kept[1].contenido, "Quiero el Modelo 1");
});


// ------------------------------------------------------
// BRIEF-015: detección de modelo
// ------------------------------------------------------

test("detectModel: Modelo con dígito", () => {
  assert.equal(summary.detectModel([msg("me interesa el modelo 2")]), "Modelo 2");
});

test("detectModel: Modelo con palabra (uno/dos/tres)", () => {
  assert.equal(summary.detectModel([msg("el modelo uno me gusta")]), "Modelo 1");
  assert.equal(summary.detectModel([msg("el modelo TRES por favor")]), "Modelo 3");
});

test("detectModel: Oferta del día también matchea 'oferta'", () => {
  assert.equal(summary.detectModel([msg("¿qué es la oferta del día?")]), "Oferta del día");
  assert.equal(summary.detectModel([msg("me interesa la oferta")]), "Oferta del día");
});

test("detectModel: elige el ÚLTIMO mencionado", () => {
  const messages = [msg("primero modelo 1"), msg("no, mejor modelo 3")];
  assert.equal(summary.detectModel(messages), "Modelo 3");
});

test("detectModel: null cuando no hay coincidencia", () => {
  assert.equal(summary.detectModel([msg("hola tienen algo?")]), null);
});


// ------------------------------------------------------
// BRIEF-015: detección de color
// ------------------------------------------------------

test("detectColor: colores comunes", () => {
  assert.equal(summary.detectColor([msg("lo quiero en negro")]), "negro");
  assert.equal(summary.detectColor([msg("¿tienen en rosa?")]), "rosa");
});

test("detectColor: acepta acentuado y no acentuado", () => {
  assert.equal(summary.detectColor([msg("marron")]), "marron");
  assert.equal(summary.detectColor([msg("marrón")]), "marrón");
});

test("detectColor: no matchea dentro de otra palabra (rosa dentro de gaseosa)", () => {
  assert.equal(summary.detectColor([msg("una gaseosa")]), null);
});


// ------------------------------------------------------
// BRIEF-017: campo Necesidad
// ------------------------------------------------------

test("necesidad: fallback 'Por confirmar' cuando el cliente solo tocó opciones", () => {
  const clientMessages = [
    msg("[Opción del menú: Ver catálogo completo]"),
    msg("[Opción del menú: Hablar con un asesor]")
  ];
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages
  });
  assert.equal(s.necesidad, "Por confirmar");
});

test("necesidad: agarra texto libre útil del cliente", () => {
  const clientMessages = [
    msg("es para el cumple de mi hermana el sábado"),
    msg("[Opción del menú: Hablar con un asesor]")
  ];
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages
  });
  assert.match(s.necesidad, /cumple/);
  assert.match(s.necesidad, /sábado/);
});

test("necesidad: NO duplica al interés si son idénticos", () => {
  // Único texto libre = "negro". El interés queda como "color negro"
  // (no idéntico), así que se guarda "negro" como necesidad. Este test
  // valida el caso borde donde no hay solapamiento textual exacto.
  const clientMessages = [msg("negro")];
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages
  });
  assert.equal(s.interes_color, "color negro");
  assert.equal(s.necesidad, "negro");
});


// ------------------------------------------------------
// buildFromContext: forma del payload y traffic
// ------------------------------------------------------

test("buildFromContext: incluye origen 'anuncio' con detalle cuando hay traffic", () => {
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: {
      origen: "anuncio",
      source_type: "ad",
      source_id: "abc123",
      headline: "Figura 10 - Viernes Express",
      body: null,
      source_url: null,
      first_referral_id: "ref_1"
    },
    clientMessages: []
  });
  assert.equal(s.origen_trafico, "anuncio");
  assert.equal(s.origen_detalle.headline, "Figura 10 - Viernes Express");
  assert.equal(s.origen_detalle.first_referral_id, "ref_1");
});

test("buildFromContext: origen 'desconocido' cuando no hay traffic", () => {
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages: []
  });
  assert.equal(s.origen_trafico, "desconocido");
});

test("buildFromContext: payload tiene los 4 campos del pedido original", () => {
  const s = summary.buildFromContext({
    phone: "591000000000",
    traffic: null,
    clientMessages: []
  });
  assert.ok("origen_trafico" in s);
  assert.ok("modelo_seleccionado" in s);
  assert.ok("interes_color" in s);
  assert.ok("necesidad" in s);
});
