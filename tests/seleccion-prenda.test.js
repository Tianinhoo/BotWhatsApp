// [ByCodex] (BRIEF-025) Selección persistente de la prenda mostrada.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { fixture } = require("./helpers/state-harness");
const { appHarness } = require("./helpers/app-harness");
const { buildFromContext } = require("../src/services/summary.service");

const PHONE = "59170000025";
const PRODUCTS = [
  { id: 11, nombre: "Modelo Uno" },
  { id: 12, nombre: "Modelo Dos" },
  { id: 13, nombre: "Modelo Tres" },
  { id: 14, nombre: "Oferta del día" }
];

function catalogQuery(sql, params) {
  if (/WHERE imagen_key = ANY/.test(sql)) return { rows: PRODUCTS };
  if (/SELECT id, nombre FROM productos WHERE id/.test(sql)) {
    return { rows: PRODUCTS.filter(product => product.id === Number(params[0])) };
  }
  if (/SELECT id FROM productos WHERE imagen_key/.test(sql)) {
    const index = Number(String(params[0]).slice(-1)) - 1;
    return { rows: PRODUCTS[index] ? [{ id: PRODUCTS[index].id }] : [] };
  }
  return { rows: [] };
}

function selectionWrites(f) {
  return f.queries.filter(call => /prenda_seleccionada_id\s*=/.test(call.sql));
}

test("catálogo con productos envía producto:11..14 + asesor y persiste WAITING en orden", async () => {
  const f = fixture({ query: catalogQuery });
  await f.state.processMenuOption(PHONE, "1");

  assert.deepEqual(f.sent.map(call => call.type), ["text", "image", "image", "image", "image", "list"]);
  const list = f.sent.at(-1);
  assert.ok(list.header.length <= 60);
  assert.equal(list.buttonText, "Ver prendas");
  assert.deepEqual(list.sections[0].rows.map(row => row.id),
    ["producto:11", "producto:12", "producto:13", "producto:14", "asesor"]);
  assert.ok(list.sections[0].rows.every(row => row.title.length <= 24));
  assert.deepEqual(f.catalogMarks, [PHONE]);
  const write = f.queries.find(call => /last_shown_products = EXCLUDED/.test(call.sql));
  assert.deepEqual(write.params, [PHONE, "WAITING_PRODUCT_SELECTION", [11, 12, 13, 14]]);
});

test("catálogo sin productos conserva outro y estado CATALOG", async () => {
  const f = fixture();
  await f.state.processMenuOption(PHONE, "1");
  assert.deepEqual(f.sent.map(call => call.type), ["text", "image", "image", "image", "image", "text"]);
  assert.match(f.sent.at(-1).text, /opción 6/);
  assert.deepEqual(f.transitions(), [[PHONE, "CATALOG"]]);
});

test("getSelectionContext normaliza fila, usa vacío sin fila y propaga errores", async () => {
  const loaded = fixture({ query: async () => ({ rows: [{
    prenda_seleccionada_id: "12", last_shown_products: ["11", "12", "13"]
  }] }) });
  assert.deepEqual(JSON.parse(JSON.stringify(await loaded.state.getSelectionContext(Number(PHONE)))),
    { prendaId: 12, lastShown: [11, 12, 13] });
  assert.deepEqual(loaded.queries[0].params, [PHONE]);

  const empty = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(await empty.state.getSelectionContext(PHONE))),
    { prendaId: null, lastShown: [] });

  const error = new Error("contexto ilegible");
  const broken = fixture({ query: async () => { throw error; } });
  await assert.rejects(broken.state.getSelectionContext(PHONE), caught => caught === error);
});

test("loadCatalogProducts consulta las cuatro image_key en orden, sin filtro disponible y limita a 9", async () => {
  const f = fixture({ query: async () => ({ rows: [{ id: "11", nombre: "Modelo Uno" }] }) });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.state.loadCatalogProducts())),
    [{ id: 11, nombre: "Modelo Uno" }]);
  assert.deepEqual(Array.from(f.queries[0].params[0]), [
    "IMAGE_MODELO_1", "IMAGE_MODELO_2", "IMAGE_MODELO_3", "IMAGE_OFERTA_DIA"
  ]);
  assert.match(f.queries[0].sql, /WHERE imagen_key = ANY\(\$1\)/);
  assert.match(f.queries[0].sql, /array_position\(\$1::text\[\], imagen_key\)/);
  assert.match(f.queries[0].sql, /LIMIT 9/);
  assert.doesNotMatch(f.queries[0].sql, /disponible/);
});

test("parser puro resuelve ID, ordinal y modelo; vacío desactiva todo", () => {
  const { state } = fixture();
  const ctx = { prendaId: null, lastShown: [11, 12, 13] };
  assert.deepEqual({ ...state.resolveProductSelection({ interactive: { type: "list_reply",
    list_reply: { id: "producto:12" } } }, state.STATES.WAITING_PRODUCT_SELECTION, ctx) },
  { kind: "product", productId: 12 });
  assert.deepEqual({ ...state.resolveProductSelection({ interactive: { type: "button_reply",
    button_reply: { id: "producto:99" } } }, state.STATES.MENU, ctx) }, { kind: "invalid" });
  assert.deepEqual({ ...state.resolveProductSelection({ text: { body: " 3 " } },
    state.STATES.WAITING_PRODUCT_SELECTION, ctx) }, { kind: "ordinal", index: 2 });
  assert.deepEqual({ ...state.resolveProductSelection({ text: { body: "quiero el modelo 2 talla M negro" } },
    state.STATES.MENU, ctx) }, { kind: "model_key", imageKey: "IMAGE_MODELO_2" });
  assert.equal(state.resolveProductSelection({ text: { body: "modelo 2" } }, state.STATES.MENU,
    { prendaId: null, lastShown: [] }), null);
});

test("ordinal 2 elige el ID real 12 y conserva last_shown_products", async () => {
  const f = fixture({ query: catalogQuery });
  const ctx = { prendaId: null, lastShown: [11, 12, 13] };
  await f.state.handleProductPick(PHONE, { kind: "ordinal", index: 1 }, ctx);
  assert.equal(f.sent[0].type, "buttons");
  assert.match(f.sent[0].body, /Elegiste \*Modelo Dos\*/);
  assert.deepEqual(selectionWrites(f)[0].params, [PHONE, 12, "MENU"]);
  assert.doesNotMatch(selectionWrites(f)[0].sql, /last_shown_products\s*=/);
});

test("ordinal fuera de rango e ID inyectado reenvían lista sin escribir prenda", async () => {
  for (const pick of [{ kind: "ordinal", index: 6 }, { kind: "invalid" }]) {
    const f = fixture({ query: catalogQuery });
    await f.state.handleProductPick(PHONE, pick, { prendaId: 11, lastShown: [11, 12, 13] });
    assert.deepEqual(f.sent.map(call => call.type), ["text", "list"]);
    assert.equal(selectionWrites(f).length, 0);
    assert.ok(f.queries.some(call => /last_shown_products = EXCLUDED/.test(call.sql)));
  }
});

test("modelo 2 desde MENU se resuelve por imagen_key y queda seleccionado", async () => {
  const f = fixture({ query: catalogQuery });
  const ctx = { prendaId: null, lastShown: [11, 12, 13, 14] };
  const pick = f.state.resolveProductSelection(
    { text: { body: "quiero el modelo 2 talla M negro" } }, f.state.STATES.MENU, ctx);
  await f.state.handleProductPick(PHONE, pick, ctx);
  assert.deepEqual(f.queries.find(call => /WHERE imagen_key = \$1/.test(call.sql)).params,
    ["IMAGE_MODELO_2"]);
  assert.deepEqual(selectionWrites(f)[0].params, [PHONE, 12, "MENU"]);
});

test("elegir 11 y luego 12 deja 12 y la segunda confirmación dice Cambié a", async () => {
  const first = fixture({ query: catalogQuery });
  await first.state.handleProductPick(PHONE, { kind: "product", productId: 11 },
    { prendaId: null, lastShown: [11, 12] });
  assert.match(first.sent[0].body, /Elegiste/);

  const second = fixture({ query: catalogQuery });
  await second.state.handleProductPick(PHONE, { kind: "product", productId: 12 },
    { prendaId: 11, lastShown: [11, 12] });
  assert.match(second.sent[0].body, /Cambié a \*Modelo Dos\*/);
  assert.deepEqual(selectionWrites(second)[0].params, [PHONE, 12, "MENU"]);
});

test("si falla el envío de botones no se inserta ni actualiza clientes_whatsapp", async () => {
  const f = fixture({ query: catalogQuery, rejectAt: 1 });
  await assert.rejects(f.state.handleProductPick(PHONE, { kind: "product", productId: 11 },
    { prendaId: null, lastShown: [11, 12] }), error => error === f.sendFailure);
  assert.equal(f.queries.filter(call => /clientes_whatsapp/.test(call.sql)).length, 0);
});

test("app prioriza el ordinal 3 en WAITING y no llama processMenuOption", async () => {
  const calls = [];
  const stateService = {
    STATES: { ORGANIC: "ORGANIC", PAUSED_HUMAN: "PAUSED_HUMAN",
      WAITING_PRODUCT_SELECTION: "WAITING_PRODUCT_SELECTION" },
    registerTraffic: async () => {},
    getUserState: async () => "WAITING_PRODUCT_SELECTION",
    getSelectionContext: async () => ({ prendaId: null, lastShown: [11, 12, 13] }),
    extractSelection: message => message.text?.body || null,
    resolveProductSelection: () => ({ kind: "ordinal", index: 2 }),
    resolveMenuOption: () => ({ id: "precios_tallas" }),
    requestedMenu: () => false,
    processMenuOption: async () => { calls.push("menu"); },
    handleProductPick: async () => { calls.push("product"); },
    greetAndShowMenu: async () => {}, showMenu: async () => {}, showProductList: async () => {}
  };
  const f = appHarness({ overrides: { "./services/state.service": stateService } });
  const body = Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { messages: [{
    id: "wamid.product.3", from: PHONE, type: "text", text: { body: "3" }
  }] } }] }] }));
  await f.webhook(body);
  assert.deepEqual(calls, ["product"]);
});

test("menú desde WAITING muestra menú y no escribe prenda_seleccionada_id", async () => {
  const f = fixture();
  await f.state.showMenu(PHONE);
  assert.deepEqual(f.sent, [{ type: "menu", phone: PHONE }]);
  assert.equal(selectionWrites(f).length, 0);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
});

test("PostgreSQL: 010 corre dos veces y WAITING_PRODUCT_SELECTION se persiste", {
  skip: process.env.DEDUP_TEST_DATABASE !== "1" ? "requiere DEDUP_TEST_DATABASE=1" : false,
  timeout: 60000
}, async () => {
  require("dotenv").config({ quiet: true });
  const pool = require("../src/services/db");
  const { setUserState } = require("../src/services/state.service");
  const sql = fs.readFileSync(path.join(__dirname, "../sql/migrations/010_seleccion_prenda.sql"), "utf8");
  try {
    await pool.query(sql);
    await pool.query(sql);
    await setUserState(PHONE, "WAITING_PRODUCT_SELECTION");
    const result = await pool.query(
      "SELECT estado_conversacion FROM clientes_whatsapp WHERE telefono = $1",
      [PHONE]
    );
    assert.equal(result.rows[0].estado_conversacion, "WAITING_PRODUCT_SELECTION");
  } finally {
    await pool.query("DELETE FROM clientes_whatsapp WHERE telefono = $1", [PHONE]);
    await pool.end();
  }
});

// [ByCodex] (BRIEF-025) Rutas, resumen y limpieza de la selección (025-B).
function selectedFixture(product, extras = {}) {
  return fixture({
    ...extras,
    query: async sql => ({ rows: /JOIN productos p/.test(sql) && product ? [product] : [] })
  });
}

const SELECTED_PRODUCT = {
  id: 12, nombre: "Modelo 2", precio: "150.00", disponible: true,
  tallas: ["S", "M"], colores: ["Negro"]
};

test("loadSelectedProduct carga producto y variaciones en una query y convierte precio NUMERIC", async () => {
  const f = selectedFixture(SELECTED_PRODUCT);
  const product = await f.state.loadSelectedProduct(Number(PHONE));
  assert.deepEqual(JSON.parse(JSON.stringify(product)), { ...SELECTED_PRODUCT, precio: 150 });
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.queries[0].params, [PHONE]);
  assert.match(f.queries[0].sql, /FROM clientes_whatsapp c/);
  assert.match(f.queries[0].sql, /JOIN productos p ON p.id = c.prenda_seleccionada_id/);
  assert.match(f.queries[0].sql, /LEFT JOIN producto_variaciones v/);
  assert.doesNotMatch(f.queries[0].sql, /v\.stock/);

  const nullable = selectedFixture({ ...SELECTED_PRODUCT, precio: null, tallas: [], colores: [] });
  assert.equal((await nullable.state.loadSelectedProduct(PHONE)).precio, null);
});

test("loadSelectedProduct devuelve null sin selección y propaga el error original de BD", async () => {
  assert.equal(await fixture().state.loadSelectedProduct(PHONE), null);
  const error = new Error("prenda ilegible");
  const f = fixture({ query: async () => { throw error; } });
  await assert.rejects(f.state.loadSelectedProduct(PHONE), caught => caught === error);
});

test("ruta 3 con precio cero, null o negativo y sin variaciones muestra Por confirmar", async () => {
  for (const precio of ["0.00", null, "-10.00"]) {
    const f = selectedFixture({ ...SELECTED_PRODUCT, precio, tallas: [], colores: [] }, {
      business: { precios: { desde: "Bs 200", hasta: "Bs 400" }, tallas: ["L"] }
    });
    await f.state.processMenuOption(PHONE, "3");
    const text = f.sent[0].text;
    assert.match(text, /^📏 \*Precio y tallas — Modelo 2\*/);
    assert.match(text, /Precio: \*Por confirmar\*/);
    assert.match(text, /Tallas: \*Por confirmar\*/);
    assert.match(text, /Colores: \*Por confirmar\*/);
    assert.doesNotMatch(text, /Bs 0|Bs -|Bs 200|Bs 400/);
    assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
  }
});

test("ruta 3 con prenda muestra Bs 150.00, S, M y Negro y conserva el cierre actual", async () => {
  const f = selectedFixture(SELECTED_PRODUCT);
  await f.state.processMenuOption(PHONE, "precios_tallas");
  const text = f.sent[0].text;
  assert.match(text, /Precio: \*Bs 150\.00\*/);
  assert.match(text, /Tallas: \*S, M\*/);
  assert.match(text, /Colores: \*Negro\*/);
  assert.ok(text.endsWith(
    "Para ver precio y talla exactos de un modelo, tocá la *opción 6* del menú y te derivamos con una asesora que puede confirmártelos 💖\n\n" +
    "Escribí *menú* para volver al menú principal."
  ));
  assert.doesNotMatch(text, /no está disponible/);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
  const write = f.queries.find(call => /INSERT INTO clientes_whatsapp/.test(call.sql));
  assert.doesNotMatch(write.sql, /prenda_seleccionada_id\s*=/);
});

test("ruta 3 agrega la línea de no disponible cuando disponible es false", async () => {
  const f = selectedFixture({ ...SELECTED_PRODUCT, disponible: false });
  await f.state.processMenuOption(PHONE, "3");
  assert.match(f.sent[0].text, /Esta prenda no está disponible por ahora\./);
});

test("rutas 3 y 4 sin prenda conservan exactamente los textos genéricos", async () => {
  const prices = fixture();
  await prices.state.processMenuOption(PHONE, "3");
  assert.equal(prices.sent[0].text,
    "📏 *Precios y tallas*\n\n" +
    "Nuestros precios y tallas dependen del modelo específico.\n\n" +
    "Para ver precio y talla exactos de un modelo, tocá la *opción 6* del menú y te derivamos con una asesora que puede confirmártelos 💖\n\n" +
    "Escribí *menú* para volver al menú principal.");

  const stock = fixture();
  await stock.state.processMenuOption(PHONE, "4");
  assert.equal(stock.sent[0].text,
    "🔎 *Disponibilidad / stock*\n\n" +
    "Para consultar stock de un modelo específico en tu talla y color, tocá la " +
    "*opción 6* del menú y una asesora te confirma en el momento ✨\n\n" +
    "Escribí *menú* para volver al menú principal.");
});

test("ruta 4 nombra la prenda elegida y nunca publica precio ni cantidades de stock", async () => {
  const f = selectedFixture({ ...SELECTED_PRODUCT, stock: 123 });
  await f.state.processMenuOption(PHONE, "stock");
  const text = f.sent[0].text;
  assert.match(text, /stock de \*Modelo 2\* en tu talla y color/);
  assert.doesNotMatch(text, /123|150|Bs|unidades/);
  assert.doesNotMatch(text.replace("Modelo 2", "Prenda").replace("opción 6", "opción"), /\d/);
  assert.deepEqual(f.transitions(), [[PHONE, "MENU"]]);
});

test("derivación guarda la prenda 12 Modelo 2 aunque el historial detecte modelo 1", async () => {
  const f = selectedFixture(SELECTED_PRODUCT);
  const detected = buildFromContext({ phone: PHONE, clientMessages: [
    { origen: "cliente", contenido: "Quiero el modelo 1 en negro para una boda" }
  ] });
  assert.equal(detected.modelo_seleccionado, "Modelo 1");
  Object.assign(f.summary, detected);
  await f.state.processMenuOption(PHONE, "6");
  assert.equal(f.summaries.length, 1);
  assert.equal(f.summaries[0].modelo_seleccionado, "Modelo 2");
  assert.equal(f.summaries[0].prenda_seleccionada_id, 12);
  assert.equal(f.summaries[0].interes_color, detected.interes_color);
  assert.equal(f.summaries[0].necesidad, detected.necesidad);
  assert.deepEqual(f.transitions(), [[PHONE, "PAUSED_HUMAN"]]);
  const readIndex = f.events.findIndex(event => event.type === "query" && /JOIN productos p/.test(event.sql));
  assert.ok(readIndex > f.events.findIndex(event => event.type === "build-summary"));
  assert.ok(readIndex < f.events.findIndex(event => event.type === "save-summary"));
});

test("derivación sin prenda mantiene la detección por regex y guarda ID null", async () => {
  const f = fixture();
  Object.assign(f.summary, buildFromContext({ phone: PHONE, clientMessages: [
    { contenido: "Quiero el modelo 1" }
  ] }));
  await f.state.processMenuOption(PHONE, "asesor");
  assert.equal(f.summaries[0].modelo_seleccionado, "Modelo 1");
  assert.equal(f.summaries[0].prenda_seleccionada_id, null);
});

test("fallo al leer la prenda durante derivación conserva mensaje enviado y PAUSED_HUMAN", async () => {
  const error = new Error("selección no disponible");
  const f = fixture({ query: async sql => {
    if (/JOIN productos p/.test(sql)) throw error;
    return { rows: [] };
  } });
  const result = await f.state.processMenuOption(PHONE, "6");
  assert.equal(result.action, "paused_human");
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].text, /asesora humana/);
  assert.deepEqual(f.transitions(), [[PHONE, "PAUSED_HUMAN"]]);
  assert.equal(f.summaryCalls.length, 1);
  // [ByClaude] (BRIEF-025) Revisión: el resumen se guarda igual, sin prenda.
  assert.equal(f.summaries.length, 1);
  assert.equal(f.summaries[0].prenda_seleccionada_id, null);
  assert.ok(f.logs.some(log => log.level === "error" && log.text.includes(error.message)));
});

test("fallo de lectura de prenda en rutas 3 y 4 se propaga sin envíos ni transición", async () => {
  for (const route of ["3", "4"]) {
    const error = new Error("lectura rechazada");
    const f = fixture({ query: async () => { throw error; } });
    await assert.rejects(f.state.processMenuOption(PHONE, route), caught => caught === error);
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.transitions(), []);
  }
});

test("resumeBotForClient hace un único UPSERT con MENU, prenda NULL y lista vacía", async () => {
  const f = fixture();
  await f.state.resumeBotForClient(Number(PHONE));
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.queries[0].params, [PHONE, "MENU"]);
  assert.match(f.queries[0].sql, /ON CONFLICT \(telefono\) DO UPDATE/);
  assert.match(f.queries[0].sql, /VALUES \(\$1, \$2, NULL, '\{\}', now\(\), now\(\)\)/);
  assert.match(f.queries[0].sql, /estado_conversacion = EXCLUDED.estado_conversacion/);
  assert.match(f.queries[0].sql, /prenda_seleccionada_id = NULL/);
  assert.match(f.queries[0].sql, /last_shown_products = '\{\}'/);
});

test("PostgreSQL: variaciones únicas y ordenadas, resume limpia selección y borrar prenda restaura ruta 3", {
  skip: process.env.DEDUP_TEST_DATABASE !== "1" ? "requiere DEDUP_TEST_DATABASE=1" : false,
  timeout: 60000
}, async () => {
  require("dotenv").config({ quiet: true });
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } });
  const phone = `0${BigInt(`0x${randomUUID().replaceAll("-", "")}`).toString().slice(0, 14)}`;
  const nombre = `Prenda 025-B ${randomUUID()}`;
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const productId = (await client.query(
      "INSERT INTO productos (nombre, precio, disponible) VALUES ($1, 150, false) RETURNING id",
      [nombre]
    )).rows[0].id;
    await client.query(`
      INSERT INTO producto_variaciones (producto_id, talla, color, stock) VALUES
        ($1, 'M', 'Negro', 123), ($1, 'S', 'Negro', 987),
        ($1, 'S', 'Blanco', 42), ($1, NULL, 'Negro', 0), ($1, 'M', NULL, 0)
    `, [productId]);
    await client.query(`
      INSERT INTO clientes_whatsapp
        (telefono, estado_conversacion, prenda_seleccionada_id, last_shown_products)
      VALUES ($1, 'PAUSED_HUMAN', $2, ARRAY[$2]::integer[])
    `, [phone, productId]);
    const f = fixture({ query: (sql, params) => client.query(sql, params) });
    const selected = await f.state.loadSelectedProduct(phone);
    assert.deepEqual(JSON.parse(JSON.stringify(selected)), {
      id: productId, nombre, precio: 150, disponible: false,
      tallas: ["S", "M"], colores: ["Blanco", "Negro"]
    });
    await f.state.processMenuOption(phone, "3");
    assert.match(f.sent.at(-1).text, /Bs 150\.00/);
    assert.match(f.sent.at(-1).text, /S, M/);
    assert.match(f.sent.at(-1).text, /no está disponible por ahora/);

    await f.state.resumeBotForClient(phone);
    const resumed = (await client.query(`
      SELECT estado_conversacion, prenda_seleccionada_id, last_shown_products
      FROM clientes_whatsapp WHERE telefono = $1
    `, [phone])).rows[0];
    assert.deepEqual(resumed, {
      estado_conversacion: "MENU", prenda_seleccionada_id: null, last_shown_products: []
    });

    await client.query(`
      UPDATE clientes_whatsapp
      SET prenda_seleccionada_id = $2, last_shown_products = ARRAY[$2]::integer[]
      WHERE telefono = $1
    `, [phone, productId]);
    await client.query("DELETE FROM productos WHERE id = $1", [productId]);
    assert.equal(await f.state.loadSelectedProduct(phone), null);
    assert.equal((await client.query(
      "SELECT prenda_seleccionada_id FROM clientes_whatsapp WHERE telefono = $1", [phone]
    )).rows[0].prenda_seleccionada_id, null);
    await f.state.processMenuOption(phone, "3");
    const generic = f.sent.at(-1).text;
    assert.match(generic, /^📏 \*Precios y tallas\*/);
    assert.match(generic, /Nuestros precios y tallas dependen del modelo específico\./);
    assert.ok(!generic.includes(nombre));
  } finally {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
});
