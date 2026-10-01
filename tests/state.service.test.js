// [ByCodex] (BRIEF-021) Contratos del árbol V1 real; transporte, persistencia y resumen simulados.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/state-harness");

const PHONE = "59170000001";
const ROUTES = [
  { id: "catalogo", action: "catalog_sent", state: "CATALOG", types: ["text", "image", "image", "image", "image", "text"] },
  { id: "modelos", action: "models_sent", state: "CATALOG", types: ["text", "image", "image", "image", "image", "text"] },
  { id: "precios_tallas", action: "prices_sent", state: "MENU", types: ["text"] },
  { id: "stock", action: "stock_sent", state: "MENU", types: ["text"] },
  { id: "envios", action: "shipping_sent", state: "MENU", types: ["text"] },
  { id: "asesor", action: "paused_human", state: "PAUSED_HUMAN", types: ["text"] },
  { id: "contacto", action: "contact_sent", state: "MENU", types: ["text"] }
];

test("STATES define los cuatro estados persistidos y no permite mutarlos", () => {
  const { state } = fixture();
  assert.deepEqual({ ...state.STATES }, {
    ORGANIC: "ORGANIC", MENU: "MENU", CATALOG: "CATALOG", PAUSED_HUMAN: "PAUSED_HUMAN"
  });
  assert.equal(Object.isFrozen(state.STATES), true);
});

test("resolveMenuOption acepta 1..7 como texto, número e ID interactivo normalizado", () => {
  const { state } = fixture();
  ROUTES.forEach(({ id }, index) => {
    for (const raw of [index + 1, String(index + 1), `  ${id.toUpperCase()}  `]) {
      const option = state.resolveMenuOption(raw);
      assert.equal(option.id, id, String(raw));
      assert.equal(option.number, index + 1);
      assert.ok(option.label.length > 0);
    }
  });
});

test("resolveMenuOption reconoce alias con tildes, palabras clave y etiquetas completas", () => {
  const { state } = fixture();
  const groups = [
    ["catálogo", "ver catalogo completo", "ver catálogo completo"],
    ["modelos nuevos"], ["precios y tallas", "precios", "tallas"],
    ["disponibilidad", "disponibilidad / stock"],
    ["envíos", "envios y entregas", "envíos y entregas"],
    ["hablar con un asesor", "humano"], ["contacto y horarios", "horarios"]
  ];
  groups.forEach((aliases, index) => {
    for (const alias of aliases) {
      assert.equal(state.resolveMenuOption(` ${alias.toUpperCase()} `).id, ROUTES[index].id, alias);
    }
  });
});

test("resolveMenuOption rechaza vacíos, texto libre y números fuera del árbol", () => {
  const { state } = fixture();
  for (const raw of [null, undefined, "", "  ", "vestido azul", "0", "8", "1 modelo", false]) {
    assert.equal(state.resolveMenuOption(raw), null, String(raw));
  }
});

test("extractSelection prioriza la lista interactiva sobre botones y texto", () => {
  const { state } = fixture();
  assert.equal(state.extractSelection({ interactive: { type: "list_reply",
    list_reply: { id: "catalogo" }, button_reply: { id: "contacto" } }, text: { body: "6" } }), "catalogo");
});

test("extractSelection toma el ID del botón cuando su tipo es button_reply", () => {
  const { state } = fixture();
  assert.equal(state.extractSelection({ interactive: { type: "button_reply",
    button_reply: { id: "asesor" }, list_reply: { id: "catalogo" } }, text: { body: "7" } }), "asesor");
});

test("extractSelection conserva el texto crudo y permite fallback desde interactivos incompletos", () => {
  const { state } = fixture();
  for (const interactive of [undefined, {}, { type: "list_reply", list_reply: {} },
    { type: "button_reply", button_reply: { id: "" } }, { type: "unknown", list_reply: { id: "catalogo" } }]) {
    assert.equal(state.extractSelection({ interactive, text: { body: "  MENÚ  " } }), "  MENÚ  ");
  }
});

test("extractSelection devuelve null para mensajes sin selección o no textuales", () => {
  const { state } = fixture();
  for (const message of [null, undefined, {}, { text: { body: "" } },
    { interactive: { type: "list_reply" } }, { image: { id: "media" } }]) {
    assert.equal(state.extractSelection(message), null);
  }
});

test("requestedMenu acepta saludos y pedidos explícitos con espacios y mayúsculas", () => {
  const { state } = fixture();
  for (const word of ["menu", "menú", "volver", "inicio", "opciones", "hola", "buenas",
    "buenos dias", "buenos días", "buenas tardes", "buenas noches"]) {
    assert.equal(state.requestedMenu(`  ${word.toUpperCase()}  `), true, word);
  }
});

test("requestedMenu no interpreta una frase libre o una opción como pedido de menú", () => {
  const { state } = fixture();
  for (const word of [null, undefined, "", "  ", "6", "asesor", "hola quiero un vestido", "menús", 0]) {
    assert.equal(state.requestedMenu(word), false, String(word));
  }
});

for (const [index, route] of ROUTES.entries()) {
  test(`ruta ${index + 1} (${route.id}): envíos, registro, transición y efectos correctos`, async () => {
    const traffic = { telefono: PHONE, origen: "anuncio", source_id: "ad-test" };
    const f = fixture({ query: async sql => ({ rows: /FROM trafico_clientes/.test(sql) ? [traffic] : [] }) });
    const result = await f.state.processMenuOption(PHONE, String(index + 1));
    assert.equal(result.ok, true);
    assert.equal(result.action, route.action);
    assert.equal(result.option.id, route.id);
    assert.equal(result.option.number, index + 1);
    assert.deepEqual(f.sent.map(call => call.type), route.types);
    assert.ok(f.sent.every(call => call.phone === PHONE));
    assert.deepEqual(f.transitions(), [[PHONE, route.state]]);
    assert.deepEqual(f.recorded, f.sent.map(call => ({ phone: PHONE,
      content: call.type === "image" ? `[Imagen: ${call.caption}]` : call.text })));
    const transitionIndex = f.events.findIndex(event => event.type === "query");
    assert.ok(transitionIndex > f.events.findLastIndex(event => ["text", "image"].includes(event.type)));
    if (index < 2) {
      assert.deepEqual(f.sent.filter(call => call.type === "image").map(call => [call.imageId, call.caption]), [
        ["image-1", "Modelo 1 ✨"], ["image-2", "Modelo 2 ✨"],
        ["image-3", "Modelo 3 ✨"], ["image-offer", "🔥 Oferta del día"]
      ]);
      assert.deepEqual(f.catalogMarks, [PHONE]);
      assert.deepEqual(f.messages, [[PHONE, "bot", "[Catálogo enviado]"]]);
      assert.ok(f.events.findIndex(event => event.type === "mark-catalog") < transitionIndex);
    } else {
      assert.deepEqual(f.catalogMarks, []);
      assert.deepEqual(f.messages, []);
    }
    assert.deepEqual(f.catalogChecks, index === 0 ? [PHONE] : []);
    if (route.id === "asesor") {
      assert.deepEqual(f.summaryCalls, [[PHONE, traffic, "El cliente pidió hablar con un asesor (Opción 6 del menú)"]]);
      assert.deepEqual(f.summaries, [f.summary]);
      assert.ok(f.events.findIndex(event => event.type === "build-summary") > transitionIndex);
    } else {
      assert.deepEqual(f.summaryCalls, []);
      assert.deepEqual(f.summaries, []);
    }
  });
}

test("catálogo distingue la primera entrega de una solicitud repetida", async () => {
  for (const received of [false, true]) {
    const f = fixture({ catalogReceived: received });
    await f.state.processMenuOption(PHONE, "catálogo");
    assert.match(f.sent[0].text, received ? /de nuevo/ : /¡Hola!/);
    assert.equal(f.sent.filter(call => call.type === "image").length, 4);
    assert.deepEqual(f.catalogMarks, [PHONE]);
  }
});

test("dispatcher acepta ID interactivo y alias sin perder la ruta correspondiente", async () => {
  for (const selection of ["asesor", " HUMANO "]) {
    const f = fixture();
    const result = await f.state.processMenuOption(PHONE, selection);
    assert.equal(result.action, "paused_human");
    assert.deepEqual(f.transitions(), [[PHONE, "PAUSED_HUMAN"]]);
  }
});

test("dispatcher devuelve no_match sin efectos para selecciones desconocidas", async () => {
  const f = fixture();
  for (const selection of [null, undefined, "", "8", "vestido rojo"]) {
    const result = await f.state.processMenuOption(PHONE, selection);
    assert.deepEqual({ ...result }, { ok: false, reason: "no_match" });
  }
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.recorded, []);
  assert.deepEqual(f.catalogChecks, []);
  assert.deepEqual(f.messages, []);
});

test("rutas 3, 4, 5 y 7 omiten datos no confirmados y permiten continuar por el menú", async () => {
  for (const selection of ["3", "4", "5", "7"]) {
    const f = fixture();
    await f.state.processMenuOption(PHONE, selection);
    const text = f.sent[0].text;
    assert.match(text, /menú/);
    assert.doesNotMatch(text, /undefined|null|Bs 150|350|@ceciliatedin|Lun-Sáb/);
    if (selection !== "7") assert.match(text, /opción 6/);
    if (["5", "7"].includes(selection)) assert.match(text, /Por confirmar/);
    if (selection === "3") assert.match(text, /dependen del modelo/);
    if (selection === "5") assert.doesNotMatch(text, /Pago contra entrega/);
    if (selection === "7") assert.doesNotMatch(text, /Instagram|Dirección/);
  }
});

test("precios y tallas incorporan únicamente la configuración confirmada", async () => {
  const f = fixture({ business: { precios: { desde: "Bs 200", hasta: "Bs 400" }, tallas: ["M", "L"] } });
  await f.state.processMenuOption(PHONE, "3");
  assert.match(f.sent[0].text, /Bs 200/);
  assert.match(f.sent[0].text, /Bs 400/);
  assert.match(f.sent[0].text, /M, L/);
  assert.doesNotMatch(f.sent[0].text, /dependen del modelo/);
});

test("precios incompletos y tallas inválidas no se anuncian como datos confirmados", async () => {
  const f = fixture({ business: { precios: { desde: "Bs 200" }, tallas: "S/M/L" } });
  await f.state.processMenuOption(PHONE, "3");
  assert.doesNotMatch(f.sent[0].text, /Bs 200|S\/M\/L|undefined/);
  assert.match(f.sent[0].text, /dependen del modelo/);
});

test("envíos muestra cobertura y plazo confirmados, y distingue contra entrega sí/no", async () => {
  for (const enabled of [true, false]) {
    const f = fixture({ business: { envios: { cobertura: "Ciudad de prueba", plazo: "48 horas",
      pago_contra_entrega: enabled } } });
    await f.state.processMenuOption(PHONE, "5");
    assert.match(f.sent[0].text, /Ciudad de prueba/);
    assert.match(f.sent[0].text, /48 horas/);
    assert.match(f.sent[0].text, enabled ? /Pago contra entrega disponible/ : /no disponible por el momento/);
    assert.doesNotMatch(f.sent[0].text, /Por confirmar/);
  }
});

test("contacto incluye horario, Instagram y dirección cuando están confirmados", async () => {
  const f = fixture({ business: { horario_atencion: "Martes 10-12", instagram: "@tienda_test",
    direccion_fisica: "Calle de prueba 123" } });
  await f.state.processMenuOption(PHONE, "7");
  for (const expected of ["Martes 10-12", "@tienda_test", "Calle de prueba 123"]) {
    assert.ok(f.sent[0].text.includes(expected));
  }
  assert.doesNotMatch(f.sent[0].text, /Por confirmar/);
});

test("derivación genera y guarda resumen aun cuando no hay tráfico previo", async () => {
  const f = fixture();
  await f.state.processMenuOption(PHONE, "6");
  assert.equal(f.summaryCalls[0][1], null);
  assert.equal(f.summaries[0], f.summary);
});

for (const stage of ["traffic", "build", "save"]) {
  test(`fallo de ${stage} del resumen conserva PAUSED_HUMAN y reporta el error`, async () => {
    const error = new Error(`Fallo de prueba: ${stage}`);
    const f = fixture({
      query: async sql => { if (stage === "traffic" && /FROM trafico_clientes/.test(sql)) throw error; return { rows: [] }; },
      summaryFailure: stage === "build" ? error : null,
      saveSummaryFailure: stage === "save" ? error : null
    });
    const result = await f.state.processMenuOption(PHONE, "6");
    assert.equal(result.action, "paused_human");
    assert.deepEqual(f.transitions(), [[PHONE, "PAUSED_HUMAN"]]);
    assert.equal(f.sent.length, 1);
    assert.equal(f.summaryCalls.length, stage === "traffic" ? 0 : 1);
    assert.equal(f.summaries.length, stage === "save" ? 1 : 0);
    assert.ok(f.logs.some(log => log.level === "error" && log.text.includes(error.message)));
  });
}

test("las siete rutas propagan un envío rechazado sin estado, catálogo ni resumen nuevos", async () => {
  for (let option = 1; option <= 7; option++) {
    const f = fixture({ rejectAt: 1 });
    await assert.rejects(f.state.processMenuOption(PHONE, option), error => error === f.sendFailure);
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.transitions(), []);
    assert.deepEqual(f.catalogMarks, []);
    assert.deepEqual(f.summaryCalls, []);
    assert.deepEqual(f.messages, []);
  }
});

test("catálogo y modelos se detienen ante una imagen rechazada sin marcar entrega completa", async () => {
  for (const selection of ["1", "2"]) {
    const f = fixture({ rejectAt: 3 });
    await assert.rejects(f.state.processMenuOption(PHONE, selection), error => error === f.sendFailure);
    assert.deepEqual(f.sent.map(call => call.type), ["text", "image", "image"]);
    assert.deepEqual(f.catalogMarks, []);
    assert.deepEqual(f.transitions(), []);
    assert.deepEqual(f.messages, []);
  }
});

test("greetAndShowMenu envía saludo seguido de menú y después persiste MENU", async () => {
  const f = fixture();
  await f.state.greetAndShowMenu(PHONE);
  assert.deepEqual(f.sent.map(call => [call.type, call.phone]), [["text", PHONE], ["menu", PHONE]]);
  assert.match(f.sent[0].text, /¡Hola!.*Cecilia Tedin/);
  assert.deepEqual(f.recorded, [{ phone: PHONE, content: f.sent[0].text }, { phone: PHONE, content: "[Menú principal]" }]);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
  assert.deepEqual(f.events.map(event => event.type), ["text", "menu", "query"]);
});

test("showMenu sin hint solo envía el menú principal y persiste MENU", async () => {
  for (const options of [undefined, {}, { hint: null }, { hint: "" }]) {
    const f = fixture();
    await f.state.showMenu(PHONE, options);
    assert.deepEqual(f.sent, [{ type: "menu", phone: PHONE }]);
    assert.deepEqual(f.recorded, [{ phone: PHONE, content: "[Menú principal]" }]);
    assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
  }
});

test("showMenu con hint envía y registra la explicación antes del menú", async () => {
  const f = fixture();
  const hint = "Elegí una opción del 1 al 7";
  await f.state.showMenu(PHONE, { hint });
  assert.deepEqual(f.sent, [{ type: "text", phone: PHONE, text: hint }, { type: "menu", phone: PHONE }]);
  assert.deepEqual(f.recorded, [{ phone: PHONE, content: hint }, { phone: PHONE, content: "[Menú principal]" }]);
  assert.deepEqual(f.events.map(event => event.type), ["text", "menu", "query"]);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
});

test("fallar saludo, hint o menú no permite avanzar a MENU", async () => {
  for (const flow of ["greet", "hint", "menu"]) {
    for (const rejectAt of (flow === "menu" ? [1] : [1, 2])) {
      const f = fixture({ rejectAt });
      const promise = flow === "greet" ? f.state.greetAndShowMenu(PHONE)
        : f.state.showMenu(PHONE, flow === "hint" ? { hint: "Intentá de nuevo" } : {});
      await assert.rejects(promise, error => error === f.sendFailure);
      assert.equal(f.sent.length, rejectAt);
      assert.deepEqual(f.transitions(), []);
    }
  }
});

test("getUserState recupera cada estado usando teléfono normalizado y consulta parametrizada", async () => {
  for (const current of ["ORGANIC", "MENU", "CATALOG", "PAUSED_HUMAN"]) {
    const f = fixture({ query: async () => ({ rows: [{ estado_conversacion: current }] }) });
    assert.equal(await f.state.getUserState(Number(PHONE)), current);
    assert.deepEqual(f.queries[0].params, [PHONE]);
    assert.match(f.queries[0].sql, /FROM clientes_whatsapp/);
    assert.match(f.queries[0].sql, /WHERE telefono = \$1/);
  }
});

test("getUserState usa ORGANIC para cliente nuevo o estado vacío", async () => {
  for (const rows of [[], [{ estado_conversacion: null }], [{ estado_conversacion: "" }]]) {
    const f = fixture({ query: async () => ({ rows }) });
    assert.equal(await f.state.getUserState(PHONE), "ORGANIC");
  }
});

// [ByCodex] (BRIEF-029) El error original debe detener al llamador.
test("getUserState propaga el error de lectura sin asumir ORGANIC", async () => {
  const error = new Error("Lectura fallida");
  const f = fixture({ query: async () => { throw error; } });
  await assert.rejects(f.state.getUserState(PHONE), failure => failure === error);
  assert.ok(f.logs.some(log => log.level === "error" && /Lectura fallida/.test(log.text)));
});

test("setUserState persiste los cuatro estados por UPSERT con parámetros", async () => {
  const f = fixture();
  for (const current of ["ORGANIC", "MENU", "CATALOG", "PAUSED_HUMAN"]) {
    await f.state.setUserState(Number(PHONE), current);
  }
  assert.deepEqual(f.transitions(), ["ORGANIC", "MENU", "CATALOG", "PAUSED_HUMAN"].map(current => [PHONE, current]));
  assert.ok(f.queries.every(call => /ON CONFLICT \(telefono\) DO UPDATE/.test(call.sql)));
});

test("setUserState rechaza estados inválidos antes de consultar la BD", async () => {
  const f = fixture();
  for (const invalid of [null, undefined, "", "menu", "UNKNOWN"]) {
    await assert.rejects(f.state.setUserState(PHONE, invalid), /Estado inválido/);
  }
  assert.deepEqual(f.queries, []);
});

test("setUserState propaga fallos de persistencia sin anunciar éxito", async () => {
  const error = new Error("Escritura fallida");
  const f = fixture({ query: async () => { throw error; } });
  await assert.rejects(f.state.setUserState(PHONE, "MENU"), caught => caught === error);
  assert.deepEqual(f.logs, []);
});

test("resumeBotForClient vuelve a MENU y propaga un fallo al persistir", async () => {
  const f = fixture();
  await f.state.resumeBotForClient(PHONE);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
  const error = new Error("No se pudo reactivar");
  const broken = fixture({ query: async () => { throw error; } });
  await assert.rejects(broken.state.resumeBotForClient(PHONE), caught => caught === error);
});

test("registerTraffic parametriza referral completo y normaliza teléfono", async () => {
  const f = fixture();
  await f.state.registerTraffic(Number(PHONE), "anuncio", { source_type: "ad", source_id: "source-test",
    source_url: "https://example.invalid/ad", headline: "Prenda ' especial", body: "Color azul", id: "ref-test" });
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /INSERT INTO trafico_clientes/);
  assert.doesNotMatch(f.queries[0].sql, /Prenda ' especial/);
  assert.deepEqual(f.queries[0].params, [PHONE, "anuncio", "ad", "source-test",
    "https://example.invalid/ad", "Prenda ' especial", "Color azul", "ref-test"]);
});

test("registerTraffic permite tráfico orgánico y referral parcial sin campos inventados", async () => {
  for (const referral of [undefined, null, {}, { source_type: "ad" }]) {
    const f = fixture();
    await f.state.registerTraffic(PHONE, "organico", referral);
    assert.deepEqual(f.queries[0].params, [PHONE, "organico", referral?.source_type || null, null, null, null, null, null]);
  }
});

test("registerTraffic registra el error sin interrumpir la conversación", async () => {
  const f = fixture({ query: async () => { throw new Error("Tráfico no disponible"); } });
  await assert.doesNotReject(f.state.registerTraffic(PHONE, "organico"));
  assert.ok(f.logs.some(log => log.level === "error" && /Tráfico no disponible/.test(log.text)));
});

test("getTraffic devuelve la primera fila o null, y propaga errores de BD", async () => {
  const traffic = { telefono: PHONE, origen: "anuncio", source_id: "ad-test" };
  for (const rows of [[], [traffic]]) {
    const f = fixture({ query: async () => ({ rows }) });
    assert.equal(await f.state.getTraffic(Number(PHONE)), rows[0] || null);
    assert.deepEqual(f.queries[0].params, [PHONE]);
    assert.match(f.queries[0].sql, /FROM trafico_clientes/);
    assert.match(f.queries[0].sql, /WHERE telefono = \$1/);
  }
  const error = new Error("Tráfico ilegible");
  const broken = fixture({ query: async () => { throw error; } });
  await assert.rejects(broken.state.getTraffic(PHONE), caught => caught === error);
});
