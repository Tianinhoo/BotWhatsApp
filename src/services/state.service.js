// ======================================================
// state.service.js — Estado del cliente (Piloto V1)
// ======================================================
//
// Servicio central del Piloto V1 (árbol conversacional de 7 rutas,
// SIN IA generativa). Concentra DOS responsabilidades:
//
// 1) ORIGEN DEL TRÁFICO — [ByOpenCode]
//    - Detecta y persiste si el cliente llegó desde un anuncio de Meta
//      (webhook con objeto "referral") o por tráfico orgánico.
//    - Persiste en la tabla "trafico_clientes".
//    - Contenido ORIGINAL de OpenCode, conservado íntegro.
//
// 2) ESTADO CONVERSACIONAL + ÁRBOL V1 — [ByClaude]
//    - Cada cliente vive en uno de estos 5 estados:
//        ORGANIC       → primer contacto, aún no se le mostró el menú.
//        MENU          → se le mostró el menú y esperamos una opción (1..7).
//        CATALOG       → acaba de recibir el catálogo, sigue en menú.
//        PAUSED_HUMAN  → derivado a asesor humano, el bot NO responde.
//        WAITING_PRODUCT_SELECTION → eligiendo una prenda mostrada.
//    - Persiste en la columna "estado_conversacion" de "clientes_whatsapp"
//      (creada por sql/estados.sql).
//    - Expone processMenuOption(phone, seleccion) para ejecutar la ruta
//      del árbol que corresponda a las opciones 1..7 del menú principal.
// ======================================================


const pool = require("./db");

// [ByCodex] (BRIEF-011) Persistencia del resultado de envío; errores abortan las rutas existentes.
const { sendAndRecord } = require("./outbound.service");

// [ByClaude] Dependencias de mensajería para las 7 rutas del árbol V1.
// - sendTextMessage / sendImageMessage: envían mensajes a WhatsApp.
// - sendMainMenu: envía el menú interactivo tipo lista de 7 opciones.
const {
  sendTextMessage,
  sendImageMessage,
  sendListMessage,
  sendButtonMessage,
  sendMainMenu
} = require("./whatsapp.service");

// [ByClaude] Persistimos cada respuesta del bot en la tabla "mensajes"
// para que aparezca en el dashboard exactamente igual que antes.
// [ByClaude] (Reasignado) Además importamos el builder + persistencia
// del "Resumen para Atención" que se dispara al pasar a PAUSED_HUMAN.
const {
  saveMessage,
  buildHandoffSummary,
  saveHandoffSummary
} = require("./messages.service");

// [ByClaude] Reutilizamos el servicio existente de catálogo para saber si
// es la primera vez que se lo enviamos al cliente y para marcarlo como enviado.
const {
  hasReceivedCatalog,
  markCatalogSent
} = require("./catalog-state.service");

// [ByOpenCode] (BRIEF-006) Redacción de teléfonos en logs + safeError.
const { redactPhone, safeError } = require("./logger.service");

// [ByClaude] (BRIEF-012) Datos del negocio centralizados. Cualquier
// dato hardcodeado (precios, tallas, horarios, envíos, IG) vive en
// `src/config/business.js`. Sin confirmación del negocio, cada campo
// es null y las rutas lo muestran como "Por confirmar" o lo omiten.
const business = require("../config/business");


// ======================================================
// CONSTANTES DE ESTADO CONVERSACIONAL — [ByClaude]
// ======================================================
// [ByClaude] Estados posibles del cliente en el Piloto V1.
// Se exportan como constantes para evitar strings mágicos en app.js.
const STATES = Object.freeze({
  ORGANIC:                  "ORGANIC",                  // primer contacto, sin menú aún
  MENU:                     "MENU",                     // esperando que elija una opción 1..7
  CATALOG:                  "CATALOG",                  // ya recibió el catálogo, sigue en menú
  PAUSED_HUMAN:             "PAUSED_HUMAN",             // derivado a asesor humano (bot en pausa)
  WAITING_PRODUCT_SELECTION: "WAITING_PRODUCT_SELECTION" // esperando una prenda del último catálogo
});

// [ByCodex] (BRIEF-025) Orden canónico compartido por imágenes y productos.
const CATALOG_IMAGE_KEYS = Object.freeze([
  "IMAGE_MODELO_1",
  "IMAGE_MODELO_2",
  "IMAGE_MODELO_3",
  "IMAGE_OFERTA_DIA"
]);


// ======================================================
// MAPA DE OPCIONES DEL MENÚ 1..7 — [ByClaude]
// ======================================================
// [ByClaude] Traducimos cualquier "selección cruda" del cliente al ID
// canónico del menú (los mismos IDs que ya usa whatsapp.service.js en
// MAIN_MENU_SECTIONS). Aceptamos 3 formas de entrada:
//   - Número escrito por el cliente ("1", "2", ..., "7").
//   - Palabra clave del ID interactivo ("catalogo", "modelos", ...).
//   - Alias amigables ("catalogo completo", "asesor", "hablar", ...).
// De este modo, funciona tanto si el cliente toca la lista interactiva
// como si escribe el número o la palabra a mano.
const MENU_OPTIONS = {
  "1":                       { number: 1, id: "catalogo",       label: "Ver catálogo completo" },
  "catalogo":                { number: 1, id: "catalogo",       label: "Ver catálogo completo" },
  "catálogo":                { number: 1, id: "catalogo",       label: "Ver catálogo completo" },
  "ver catalogo completo":   { number: 1, id: "catalogo",       label: "Ver catálogo completo" },
  "ver catálogo completo":   { number: 1, id: "catalogo",       label: "Ver catálogo completo" },

  "2":                       { number: 2, id: "modelos",        label: "Modelos nuevos" },
  "modelos":                 { number: 2, id: "modelos",        label: "Modelos nuevos" },
  "modelos nuevos":          { number: 2, id: "modelos",        label: "Modelos nuevos" },

  "3":                       { number: 3, id: "precios_tallas", label: "Precios y tallas" },
  "precios_tallas":          { number: 3, id: "precios_tallas", label: "Precios y tallas" },
  "precios y tallas":        { number: 3, id: "precios_tallas", label: "Precios y tallas" },
  "precios":                 { number: 3, id: "precios_tallas", label: "Precios y tallas" },
  "tallas":                  { number: 3, id: "precios_tallas", label: "Precios y tallas" },

  "4":                       { number: 4, id: "stock",          label: "Disponibilidad / stock" },
  "stock":                   { number: 4, id: "stock",          label: "Disponibilidad / stock" },
  "disponibilidad":          { number: 4, id: "stock",          label: "Disponibilidad / stock" },
  "disponibilidad / stock":  { number: 4, id: "stock",          label: "Disponibilidad / stock" },

  "5":                       { number: 5, id: "envios",         label: "Envíos y entregas" },
  "envios":                  { number: 5, id: "envios",         label: "Envíos y entregas" },
  "envíos":                  { number: 5, id: "envios",         label: "Envíos y entregas" },
  "envios y entregas":       { number: 5, id: "envios",         label: "Envíos y entregas" },
  "envíos y entregas":       { number: 5, id: "envios",         label: "Envíos y entregas" },

  "6":                       { number: 6, id: "asesor",         label: "Hablar con un asesor" },
  "asesor":                  { number: 6, id: "asesor",         label: "Hablar con un asesor" },
  "hablar con un asesor":    { number: 6, id: "asesor",         label: "Hablar con un asesor" },
  "humano":                  { number: 6, id: "asesor",         label: "Hablar con un asesor" },

  "7":                       { number: 7, id: "contacto",       label: "Contacto y horarios" },
  "contacto":                { number: 7, id: "contacto",       label: "Contacto y horarios" },
  "contacto y horarios":     { number: 7, id: "contacto",       label: "Contacto y horarios" },
  "horarios":                { number: 7, id: "contacto",       label: "Contacto y horarios" }
};


// [ByClaude] Palabras que hacen que el bot re-muestre el menú principal.
// Sirve para que un cliente que se perdió pueda volver siempre al inicio.
const MENU_REOPEN_KEYWORDS = [
  "menu",
  "menú",
  "volver",
  "inicio",
  "opciones",
  "hola",
  "buenas",
  "buenos dias",
  "buenos días",
  "buenas tardes",
  "buenas noches"
];


// ======================================================
// TRÁFICO — [ByOpenCode]  (contenido original, sin cambios)
// ======================================================


// ======================================================
// REGISTRAR / ACTUALIZAR EL ORIGEN DE TRÁFICO DE UN CLIENTE
// ======================================================
// [ByOpenCode] Función NUEVA: registra el origen de un cliente.
//
// Parámetros:
//   - phone    : número del cliente (formato internacional, sin "+").
//   - origen   : "anuncio" | "organico".
//   - referral : objeto "referral" completo que llega en el webhook de Meta
//                cuando el cliente vino desde un anuncio (puede ser null).
//
// Comportamiento:
//   - Si el teléfono no existe: se inserta una fila nueva.
//   - Si ya existe: se actualiza el origen y los datos del referral,
//     manteniendo siempre el "created_at" original y guardando en
//     "first_referral_id" el primer referral que trajo al cliente.
//   - Nunca lanza error hacia quien lo llama: avisa por consola y continúa.
//     Así, un fallo de la BD no rompe el procesamiento del mensaje.
async function registerTraffic(phone, origen, referral = null) {

  // Sanidad: que el teléfono siempre sea texto.
  const telefono = String(phone);

  // Valores seguros del referral (evita errores si falta algún campo).
  const sourceType = referral?.source_type || null;
  const sourceId = referral?.source_id || null;
  const sourceUrl = referral?.source_url || null;
  const headline = referral?.headline || null;
  const body = referral?.body || null;
  const firstReferralId = referral?.id || null;

  try {

    // Insertamos o actualizamos la fila del cliente en "trafico_clientes".
    // - Con "ON CONFLICT (telefono)" nos aseguramos de no duplicar.
    // - Al actualizar solo tocamos los campos de origen y referral,
    //   y refrescamos "updated_at", pero conservamos el "created_at".
    await pool.query(
      `
        INSERT INTO trafico_clientes (
          telefono,
          origen,
          source_type,
          source_id,
          source_url,
          headline,
          body,
          first_referral_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())

        ON CONFLICT (telefono)

        -- [ByClaude] (BRIEF-013) Preservamos la atribucion publicitaria:
        --   - "origen" NUNCA hace downgrade de "anuncio" a "organico".
        --     Solo hace upgrade cuando el nuevo mensaje trae "anuncio".
        --   - Los campos del referral (source_type, source_id, etc.) solo
        --     se sobrescriben si el nuevo valor NO es NULL (COALESCE).
        --   - Asi, un cliente que llego por un anuncio y despues manda
        --     mensajes normales (sin referral) mantiene su trazabilidad.
        DO UPDATE SET
          origen = CASE
            WHEN EXCLUDED.origen = 'anuncio' THEN 'anuncio'
            ELSE trafico_clientes.origen
          END,
          source_type       = COALESCE(EXCLUDED.source_type,       trafico_clientes.source_type),
          source_id         = COALESCE(EXCLUDED.source_id,         trafico_clientes.source_id),
          source_url        = COALESCE(EXCLUDED.source_url,        trafico_clientes.source_url),
          headline          = COALESCE(EXCLUDED.headline,          trafico_clientes.headline),
          body              = COALESCE(EXCLUDED.body,              trafico_clientes.body),
          first_referral_id = COALESCE(EXCLUDED.first_referral_id, trafico_clientes.first_referral_id),
          updated_at        = now()
      `,
      [
        telefono,
        origen,
        sourceType,
        sourceId,
        sourceUrl,
        headline,
        body,
        firstReferralId
      ]
    );

    // [ByOpenCode] (BRIEF-006) REDACT teléfono; source_type no es PII.
    console.log(
      `[ByOpenCode] Tráfico registrado para ${redactPhone(telefono)}: ${origen}` +
      (referral ? ` (source_type=${referral.source_type})` : "")
    );

  } catch (error) {

    // Nunca tiramos el proceso por un fallo de registro de tráfico:
    // logueamos y el mensaje sigue su flujo normal.
    // [ByOpenCode] (BRIEF-006) REDACT teléfono + safeError.
    console.error(
      `[ByOpenCode] Error registrando tráfico para ${redactPhone(telefono)}:`,
      safeError(error)
    );

  }
}


// ======================================================
// CONSULTAR EL ORIGEN DE TRÁFICO DE UN CLIENTE
// ======================================================
// [ByOpenCode] Función NUEVA: devuelve la fila de tráfico de un teléfono.
// Útil para el dashboard o para decidir el flujo del bot según el origen.
// Si el cliente no tiene registro, devuelve null.
async function getTraffic(phone) {

  const result = await pool.query(
    `
      SELECT
        telefono,
        origen,
        source_type,
        source_id,
        source_url,
        headline,
        body,
        first_referral_id,
        created_at,
        updated_at
      FROM trafico_clientes
      WHERE telefono = $1
      LIMIT 1
    `,
    [String(phone)]
  );

  return result.rows[0] || null;
}


// ======================================================
// ESTADO CONVERSACIONAL — [ByClaude]
// ======================================================


// [ByClaude] Devuelve el estado actual del cliente. Si el cliente aún no
// existe en "clientes_whatsapp" o no tiene estado guardado, se considera
// ORGANIC (primer contacto).
// [ByCodex] (BRIEF-029) Un error de BD se propaga: no inventar el estado.
async function getUserState(phone) {

  try {

    const result = await pool.query(
      `
        SELECT estado_conversacion
        FROM clientes_whatsapp
        WHERE telefono = $1
        LIMIT 1
      `,
      [String(phone)]
    );

    if (result.rows.length === 0) {
      return STATES.ORGANIC;
    }

    return result.rows[0].estado_conversacion || STATES.ORGANIC;

  } catch (error) {

    // [ByOpenCode] (BRIEF-006) REDACT teléfono + safeError.
    console.error(
      `[ByCodex] Error leyendo estado de ${redactPhone(phone)}; procesamiento detenido:`,
      safeError(error)
    );

    throw error;
  }
}


// [ByCodex] (BRIEF-025) Lee la prenda elegida y la lista ordinal sin
// convertir un fallo de BD en contexto vacío.
async function getSelectionContext(phone) {
  const result = await pool.query(
    `
      SELECT prenda_seleccionada_id, last_shown_products
      FROM clientes_whatsapp
      WHERE telefono = $1
      LIMIT 1
    `,
    [String(phone)]
  );

  if (result.rows.length === 0) {
    return { prendaId: null, lastShown: [] };
  }

  const row = result.rows[0];
  return {
    prendaId: row.prenda_seleccionada_id == null
      ? null
      : Number(row.prenda_seleccionada_id),
    lastShown: Array.isArray(row.last_shown_products)
      ? row.last_shown_products.map(Number).filter(Number.isInteger)
      : []
  };
}


// [ByCodex] (BRIEF-025) Una lectura para la prenda y sus variaciones.
// DISTINCT/FILTER evitan duplicados y nulos del LEFT JOIN; las tallas
// siguen su escala habitual (S antes de M), y el resto el orden textual.
// [ByCodex] (catalogo-v1) Descripción real y escala de talles de la tienda.
async function loadSelectedProduct(phone) {
  const result = await pool.query(
    `
      WITH selected AS (
        SELECT p.id, p.nombre, p.descripcion, p.precio, p.disponible,
          COALESCE(
            array_agg(DISTINCT v.talla ORDER BY v.talla)
              FILTER (WHERE v.talla IS NOT NULL),
            '{}'::text[]
          ) AS tallas,
          COALESCE(
            array_agg(DISTINCT v.color ORDER BY v.color)
              FILTER (WHERE v.color IS NOT NULL),
            '{}'::text[]
          ) AS colores
        FROM clientes_whatsapp c
        JOIN productos p ON p.id = c.prenda_seleccionada_id
        LEFT JOIN producto_variaciones v ON v.producto_id = p.id
        WHERE c.telefono = $1
        GROUP BY p.id
      )
      SELECT id, nombre, descripcion, precio, disponible,
        ARRAY(
          SELECT talla FROM unnest(tallas) AS talla
          ORDER BY array_position(
            ARRAY['XXS', 'XS', 'P', 'S', 'M', 'G', 'L', 'XL', 'GG', 'XXL', 'XXXL'], talla
          ), talla
        ) AS tallas,
        colores
      FROM selected
    `,
    [String(phone)]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    nombre: row.nombre,
    descripcion: row.descripcion || null,
    precio: row.precio == null ? null : Number(row.precio),
    disponible: row.disponible,
    tallas: row.tallas || [],
    colores: row.colores || []
  };
}


// [ByCodex] (BRIEF-025) La lista sigue el mismo orden que las imágenes y
// no oculta filas por `disponible`: disponibilidad se trata en otra ruta.
// [ByCodex] (catalogo-v1) Un mismo catálogo para lista, imágenes y precios.
async function loadCatalogProducts() {
  const result = await pool.query(
    `
      SELECT id, nombre, imagen_key, precio
      FROM productos
      WHERE imagen_key = ANY($1)
      ORDER BY array_position($1::text[], imagen_key)
      LIMIT 9
    `,
    [CATALOG_IMAGE_KEYS]
  );

  return result.rows.map(row => ({
    id: Number(row.id), nombre: row.nombre, imagen_key: row.imagen_key,
    precio: row.precio == null ? null : Number(row.precio)
  }));
}


// [ByClaude] Persiste el nuevo estado del cliente. Si no existe la fila
// aún, la crea con INSERT ... ON CONFLICT para mantener la tabla consistente.
// Valida que el estado sea uno de los permitidos por STATES.
async function setUserState(phone, state) {

  if (!Object.values(STATES).includes(state)) {
    throw new Error(`[ByClaude] Estado inválido: ${state}`);
  }

  await pool.query(
    `
      INSERT INTO clientes_whatsapp (
        telefono,
        estado_conversacion,
        created_at,
        updated_at
      ) VALUES ($1, $2, now(), now())

      ON CONFLICT (telefono) DO UPDATE
        SET estado_conversacion = EXCLUDED.estado_conversacion,
            updated_at = now()
    `,
    [String(phone), state]
  );

  // [ByOpenCode] (BRIEF-006) REDACT teléfono.
  console.log(`[ByClaude] Estado de ${redactPhone(phone)} => ${state}`);
}


// [ByClaude] Reactiva el bot para un cliente en PAUSED_HUMAN. Se usa
// desde el dashboard cuando un asesor humano quiere devolver el control
// al árbol conversacional automático. Vuelve al estado MENU.
async function resumeBotForClient(phone) {
  // [ByCodex] (BRIEF-025) Reiniciar estado y selección en una sola escritura.
  await pool.query(
    `
      INSERT INTO clientes_whatsapp (
        telefono,
        estado_conversacion,
        prenda_seleccionada_id,
        last_shown_products,
        created_at,
        updated_at
      ) VALUES ($1, $2, NULL, '{}', now(), now())
      ON CONFLICT (telefono) DO UPDATE
        SET estado_conversacion = EXCLUDED.estado_conversacion,
            prenda_seleccionada_id = NULL,
            last_shown_products = '{}',
            updated_at = now()
    `,
    [String(phone), STATES.MENU]
  );
}


// ======================================================
// PARSER DE SELECCIÓN — [ByClaude]
// ======================================================


// [ByClaude] Extrae la selección del cliente desde el objeto "message"
// del webhook de WhatsApp. Detecta 3 orígenes:
//   a) interactive.list_reply.id     → cuando toca la lista interactiva.
//   b) interactive.button_reply.id   → cuando toca un botón.
//   c) text.body                     → cuando escribe a mano ("1", "menú", ...).
// Devuelve el string "crudo" que luego resuelve resolveMenuOption().
function extractSelection(message) {

  if (!message) return null;

  const interactive = message.interactive;

  if (interactive) {
    if (interactive.type === "list_reply" && interactive.list_reply?.id) {
      return interactive.list_reply.id;
    }
    if (interactive.type === "button_reply" && interactive.button_reply?.id) {
      return interactive.button_reply.id;
    }
  }

  if (message.text?.body) {
    return message.text.body;
  }

  return null;
}


// [ByCodex] (BRIEF-025) Parser puro y contextual para la prenda. Los IDs
// interactivos se validan contra la última lista realmente mostrada.
// [ByCodex] (catalogo-v1) Los nombres no requieren una lista previa.
function resolveProductSelection(message, state, ctx) {
  const lastShown = Array.isArray(ctx?.lastShown) ? ctx.lastShown : [];

  const interactive = message?.interactive;
  const interactiveId = interactive?.type === "list_reply"
    ? interactive.list_reply?.id
    : interactive?.type === "button_reply"
      ? interactive.button_reply?.id
      : null;

  const productMatch = typeof interactiveId === "string"
    ? interactiveId.match(/^producto:(\d+)$/)
    : null;
  if (productMatch) {
    if (lastShown.length === 0) return null;
    const productId = Number(productMatch[1]);
    return lastShown.includes(productId)
      ? { kind: "product", productId }
      : { kind: "invalid" };
  }

  const text = message?.text?.body;
  if (typeof text !== "string") return null;

  if (lastShown.length > 0 && state === STATES.WAITING_PRODUCT_SELECTION && /^\s*[1-9]\s*$/.test(text)) {
    return { kind: "ordinal", index: Number(text.trim()) - 1 };
  }

  const normalize = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const normalized = normalize(text);
  for (const { imageKey, palabras } of business.alias_productos || []) {
    for (const palabra of palabras) {
      const escaped = normalize(palabra).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u");
      if (pattern.test(normalized)) return { kind: "model_key", imageKey };
    }
  }

  const modelMatch = normalized.match(/\bmodelo\s*([1-3])\b/);
  if (modelMatch) {
    return { kind: "model_key", imageKey: `IMAGE_MODELO_${modelMatch[1]}` };
  }

  return null;
}


// [ByClaude] Resuelve una selección "cruda" (número, id o palabra) al
// objeto oficial de MENU_OPTIONS. Devuelve null si el cliente escribió
// cualquier otra cosa (texto libre que no pertenece al árbol V1).
// [ByClaude] (BRIEF-023) Endurecido: consultamos solo propiedades PROPIAS
// del mapa. Un lookup directo con `MENU_OPTIONS[key]` devuelve valores
// heredados de `Object.prototype` (constructor, __proto__, hasOwnProperty,
// toString, valueOf, ...), que son truthy y engañan al dispatcher. Sin
// este fix, un cliente que escribe "constructor" recibe silencio.
function resolveMenuOption(raw) {

  if (raw === undefined || raw === null) return null;

  const key = String(raw).trim().toLowerCase();
  if (!key) return null;

  if (!Object.hasOwn(MENU_OPTIONS, key)) return null;

  return MENU_OPTIONS[key];
}


// [ByClaude] Detecta si el cliente pidió explícitamente volver al menú,
// aunque no haya elegido una opción válida (ej: escribe "menú" o "hola").
function requestedMenu(rawText) {

  if (!rawText) return false;

  const key = String(rawText).trim().toLowerCase();
  return MENU_REOPEN_KEYWORDS.includes(key);
}


// ======================================================
// ACCIONES DEL ÁRBOL CONVERSACIONAL — [ByClaude]
// ======================================================
//
// Cada una de las 7 rutas del árbol V1 se representa como una función
// asincrónica que:
//   1. Envía al cliente los mensajes correspondientes por WhatsApp.
//   2. Registra la respuesta del bot en la tabla "mensajes".
//   3. Deja al cliente en el estado que corresponda (MENU, CATALOG o
//      PAUSED_HUMAN).
//


// [ByClaude] Helper interno: envía un texto Y lo guarda en "mensajes".
// Todos los envíos del bot pasan por acá para que el dashboard siempre
// muestre exactamente lo mismo que recibió el cliente.
// [ByCodex] (BRIEF-011) Solo registrar aceptación tras éxito; rechazo se guarda y se propaga.
async function sendAndLog(phone, text) {
  return sendAndRecord(phone, text, () => sendTextMessage(phone, text));
}


// [ByCodex] (BRIEF-025) Envía la lista y recién después persiste el
// contexto ordinal que la clienta efectivamente pudo ver.
async function sendProductList(phone, products, { hint = null } = {}) {
  if (hint) {
    await sendAndLog(phone, hint);
  }

  const rows = products.map(product => ({
    id: `producto:${product.id}`,
    title: String(product.nombre || `Prenda ${product.id}`).slice(0, 24)
  }));
  rows.push({ id: "asesor", title: "Hablar con asesora" });

  // [ByClaude] (BRIEF-025) Revisión: el outro anterior indicaba cómo salir; se conserva.
  const body =
    "Elegí la prenda que te interesa o escribí su número 👇\n\n" +
    "Escribí *menú* para volver al menú principal.";
  await sendAndRecord(phone, body, () => sendListMessage({
    to: phone,
    header: "¿Qué prenda te interesa?",
    body,
    footer: "Cecilia Tedin · Selección de prenda",
    buttonText: "Ver prendas",
    sections: [{ title: "Prendas", rows }]
  }));

  await pool.query(
    `
      INSERT INTO clientes_whatsapp (
        telefono,
        estado_conversacion,
        last_shown_products,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (telefono) DO UPDATE
        SET estado_conversacion = EXCLUDED.estado_conversacion,
            last_shown_products = EXCLUDED.last_shown_products,
            updated_at = now()
    `,
    [String(phone), STATES.WAITING_PRODUCT_SELECTION, products.map(product => product.id)]
  );
}


// [ByCodex] (BRIEF-025) Reutilizable para entradas inválidas y fallbacks.
async function showProductList(phone, { hint = null } = {}) {
  const products = await loadCatalogProducts();
  if (products.length === 0) {
    await showMenu(phone, { hint });
    return;
  }
  await sendProductList(phone, products, { hint });
}


// [ByCodex] (BRIEF-025) Confirma una selección con acciones cortas. El
// UPDATE queda deliberadamente después del envío exitoso de botones.
async function selectProduct(phone, productId, prevId) {
  const result = await pool.query(
    `SELECT id, nombre FROM productos WHERE id = $1 LIMIT 1`,
    [productId]
  );
  const product = result.rows[0];
  if (!product) {
    await showProductList(phone, {
      hint: "Esa prenda ya no está en la lista. Elegí otra opción 👇"
    });
    return;
  }

  const changed = prevId != null && Number(prevId) !== Number(productId);
  const body = changed
    ? `Cambié a *${product.nombre}*. ¿Qué querés consultar?`
    : `Elegiste *${product.nombre}*. ¿Qué querés consultar?`;

  await sendAndRecord(phone, body, () => sendButtonMessage({
    to: phone,
    body,
    buttons: [
      { id: "precios_tallas", title: "Precio y tallas" },
      { id: "stock", title: "Disponibilidad" },
      { id: "asesor", title: "Hablar con asesora" }
    ]
  }));

  await pool.query(
    `
      INSERT INTO clientes_whatsapp (
        telefono,
        prenda_seleccionada_id,
        estado_conversacion,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (telefono) DO UPDATE
        SET prenda_seleccionada_id = EXCLUDED.prenda_seleccionada_id,
            estado_conversacion = EXCLUDED.estado_conversacion,
            updated_at = now()
    `,
    [String(phone), Number(productId), STATES.MENU]
  );
}


// [ByCodex] (BRIEF-025) Resuelve ordinales y claves visuales contra el
// contexto mostrado; cualquier valor stale reabre una lista vigente.
// [ByCodex] (catalogo-v1) Sin lista previa, validar nombres contra el catálogo.
async function handleProductPick(phone, pick, ctx) {
  const lastShown = Array.isArray(ctx?.lastShown) ? ctx.lastShown : [];
  let allowedIds = lastShown;
  let productId = null;

  if (pick?.kind === "product") {
    productId = pick.productId;
  } else if (pick?.kind === "ordinal") {
    productId = lastShown[pick.index];
  } else if (pick?.kind === "model_key") {
    if (lastShown.length === 0) {
      allowedIds = (await loadCatalogProducts()).map(product => product.id);
    }
    const result = await pool.query(
      `SELECT id FROM productos WHERE imagen_key = $1 LIMIT 1`,
      [pick.imageKey]
    );
    const candidate = result.rows[0] ? Number(result.rows[0].id) : null;
    if (candidate != null && allowedIds.includes(candidate)) productId = candidate;
  }

  if (productId == null || !Number.isInteger(Number(productId)) || !allowedIds.includes(Number(productId))) {
    await showProductList(phone, {
      hint: "No pude identificar esa prenda. Elegí una de la lista 👇"
    });
    return;
  }

  await selectProduct(phone, Number(productId), ctx?.prendaId ?? null);
}


// [ByClaude] Envía las 4 imágenes del catálogo (3 modelos + oferta del día).
// No agrega textos: el llamador decide el mensaje de intro y de outro.
// [ByCodex] (BRIEF-011) Registrar cada imagen; un fallo detiene catálogo y transición de estado.
// [ByCodex] (catalogo-v1) Moneda al final; enteros sin decimales.
function formatProductPrice(price) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} Bs`;
}

// [ByCodex] (catalogo-v1) Captions y media_id salen del catálogo vigente.
async function sendCatalogImages(phone) {
  const products = await loadCatalogProducts();
  const images = products.length > 0 ? products.map((product, index) => {
    const price = formatProductPrice(product.precio);
    return [process.env[product.imagen_key],
      `${index + 1}. ${product.nombre}${price ? ` · ${price}` : ""}`];
  }) : [
    [process.env.IMAGE_MODELO_1, "Modelo 1 ✨"],
    [process.env.IMAGE_MODELO_2, "Modelo 2 ✨"],
    [process.env.IMAGE_MODELO_3, "Modelo 3 ✨"],
    [process.env.IMAGE_OFERTA_DIA, "🔥 Oferta del día"]
  ];
  for (const [imageId, caption] of images) {
    await sendAndRecord(phone, `[Imagen: ${caption}]`, () => sendImageMessage(phone, imageId, caption));
  }
  await saveMessage(phone, "bot", "[Catálogo enviado]");
  return products;
}


// [ByClaude] RUTA 1 — Catálogo completo. Envía intro + imágenes + lista de
// prendas y deja al cliente en WAITING_PRODUCT_SELECTION (BRIEF-025).
// Sin productos en BD: outro + CATALOG, como antes.
async function replyCatalog(phone, { isFirstTime = false } = {}) {

  const intro = isFirstTime
    ? "¡Hola! 👋 Gracias por escribirle a *Cecilia Tedin*.\n\n" +
      "A continuación te mostramos nuestros modelos y promociones disponibles 😊"
    : "¡Claro! 😊 Te muestro de nuevo nuestros modelos y promociones.";

  await sendAndLog(phone, intro);
  // [ByCodex] (catalogo-v1) La lista usa las mismas filas que los captions.
  const products = await sendCatalogImages(phone);

  await markCatalogSent(phone);

  if (products.length > 0) {
    await sendProductList(phone, products);
    return;
  }

  // [ByClaude] (chequeo 2026-09-30 P2) Texto honesto: el bot V1 NO interpreta
  // texto libre. Antes esta ruta prometía "escribí su nombre y te ayudamos"
  // y después mandaba el menú al cliente que escribía — mala UX.
  // Mismo criterio que rutas 3/4: derivar explícitamente a la opción 6.
  const outro =
    "Si algún modelo te llamó la atención, tocá la *opción 6* del menú " +
    "y una asesora te confirma tallas, colores y precios 💖\n\n" +
    "Escribí *menú* para volver al menú principal.";

  await sendAndLog(phone, outro);

  await setUserState(phone, STATES.CATALOG);
}


// [ByClaude] RUTA 2 — Modelos nuevos. Comparte las imágenes del catálogo
// pero con un texto de intro específico ("modelos nuevos").
async function replyNewModels(phone) {

  const intro =
    "✨ *Modelos nuevos*\n\n" +
    "Estas son las últimas prendas que llegaron a la tienda:";

  await sendAndLog(phone, intro);
  // [ByCodex] (catalogo-v1) La lista usa las mismas filas que los captions.
  const products = await sendCatalogImages(phone);

  await markCatalogSent(phone);

  if (products.length > 0) {
    await sendProductList(phone, products);
    return;
  }

  // [ByClaude] (chequeo 2026-09-30 P2) Mismo criterio que ruta 1: derivar.
  const outro =
    "Si te interesa alguno, tocá la *opción 6* del menú y una asesora te " +
    "confirma tallas, colores y disponibilidad 💖\n\n" +
    "Escribí *menú* para volver al menú principal.";

  await sendAndLog(phone, outro);

  await setUserState(phone, STATES.CATALOG);
}


// [ByClaude] (BRIEF-012) RUTA 3 — Precios y tallas.
// Textos honestos: NO promete procesar texto libre (el bot no lo procesa).
// Cualquier dato específico (precio, talla exacta) se deriva a la opción 6.
// Los rangos genéricos salen de `src/config/business.js` cuando estén
// validados; si no, se omiten.
async function replyPricesAndSizes(phone) {

  // [ByCodex] (BRIEF-025) Con prenda, solo publicar un precio positivo.
  const product = await loadSelectedProduct(phone);
  const partes = product
    ? [`📏 *Precio y tallas — ${product.nombre}*`, ""]
    : ["📏 *Precios y tallas*", ""];

  if (product) {
    // [ByCodex] (catalogo-v1) Ficha de la prenda con precio y descripción reales.
    const price = formatProductPrice(product.precio) || "Por confirmar";
    partes.push(`• Precio: *${price}*.`);
    partes.push(`• Tallas: *${product.tallas.length ? product.tallas.join(", ") : "Por confirmar"}*.`);
    partes.push(`• Colores: *${product.colores.length ? product.colores.join(", ") : "Por confirmar"}*.`);
    if (product.descripcion) partes.push(`• ${product.descripcion}`);

    if (product.disponible === false) {
      partes.push("• Esta prenda no está disponible por ahora.");
    }
  } else {
    if (business.precios?.desde && business.precios?.hasta) {
      partes.push(`• Nuestros modelos van desde *${business.precios.desde}* hasta *${business.precios.hasta}*.`);
    }

    if (Array.isArray(business.tallas) && business.tallas.length > 0) {
      partes.push(`• Contamos con tallas *${business.tallas.join(", ")}* (según modelo).`);
    }

    // Si NO hay ningún dato confirmado, el texto queda flaco pero honesto.
    if (partes.length === 2) {
      partes.push("Nuestros precios y tallas dependen del modelo específico.");
    }
  }

  partes.push("");
  // [ByCodex] (catalogo-v1) Con prenda elegida, la asesora confirma disponibilidad.
  partes.push(product
    ? "Para confirmar disponibilidad de tu talla y color, tocá la *opción 6* del menú y te ayuda una asesora 💖"
    : "Para ver precio y talla exactos de un modelo, tocá la *opción 6* del menú y te derivamos con una asesora que puede confirmártelos 💖");
  partes.push("");
  partes.push("Escribí *menú* para volver al menú principal.");

  await sendAndLog(phone, partes.join("\n"));
  await setUserState(phone, STATES.MENU);
}


// [ByClaude] (BRIEF-012) RUTA 4 — Disponibilidad / stock.
// Antes prometía "en un ratito te confirmamos" cuando el bot no procesa
// texto libre. Ahora deriva explícitamente a la opción 6 sin mentir.
async function replyStock(phone) {

  // [ByCodex] (BRIEF-025) Nombrar la prenda sin publicar cantidades.
  const product = await loadSelectedProduct(phone);
  const text =
    "🔎 *Disponibilidad / stock*\n\n" +
    `Para consultar stock de ${product ? `*${product.nombre}*` : "un modelo específico"} en tu talla y color, tocá la ` +
    "*opción 6* del menú y una asesora te confirma en el momento ✨\n\n" +
    "Escribí *menú* para volver al menú principal.";

  await sendAndLog(phone, text);
  await setUserState(phone, STATES.MENU);
}


// [ByClaude] (BRIEF-012) RUTA 5 — Envíos y entregas.
// Los datos concretos (cobertura, plazos, pago contra entrega) salen de
// `business.js`. Los que no estén confirmados quedan como "Por confirmar"
// o se omiten. Preferimos texto flaco antes que prometer algo inventado.
async function replyShipping(phone) {

  const partes = ["🚚 *Envíos y entregas*", ""];

  if (business.envios?.cobertura) {
    partes.push(`• Enviamos a *${business.envios.cobertura}* 📦`);
  } else {
    partes.push("• Cobertura de envíos: *Por confirmar*.");
  }

  partes.push("• Costo: se calcula según ciudad y te lo confirmamos al coordinar.");

  if (business.envios?.plazo) {
    partes.push(`• Tiempo estimado: *${business.envios.plazo}*.`);
  } else {
    partes.push("• Tiempo estimado de entrega: *Por confirmar*.");
  }

  if (business.envios?.pago_contra_entrega === true) {
    partes.push("• Pago contra entrega disponible en zonas seleccionadas.");
  } else if (business.envios?.pago_contra_entrega === false) {
    partes.push("• Pago contra entrega: *no disponible por el momento*.");
  }
  // Si es null (por confirmar), se omite la línea.

  partes.push("");
  partes.push("Para coordinar tu envío, tocá la *opción 6* del menú y te ayuda una asesora.");
  partes.push("");
  partes.push("Escribí *menú* para volver al menú principal.");

  await sendAndLog(phone, partes.join("\n"));
  await setUserState(phone, STATES.MENU);
}


// [ByClaude] RUTA 6 — Hablar con un asesor humano. Deja al cliente en
// PAUSED_HUMAN, por lo que el bot deja de responderle automáticamente.
// [ByClaude] (Reasignado) Al pasar a PAUSED_HUMAN generamos y guardamos
// el "Resumen para Atención" (JSON con origen del tráfico, modelo
// seleccionado e interés/color) para que la asesora humana lo tenga
// disponible desde el dashboard.
async function replyDeriveToHuman(phone, { reason = null } = {}) {

  const text =
    "👩‍💼 ¡Perfecto! Te derivamos con una *asesora humana*.\n\n" +
    "En breve te va a contactar por este mismo chat.\n" +
    "Mientras tanto, el asistente automático se pone en pausa 🙌";

  await sendAndLog(phone, text);
  await setUserState(phone, STATES.PAUSED_HUMAN);

  // [ByClaude] (Reasignado) Generamos el Resumen para Atención con lo
  // que ya sabemos del cliente (tráfico + últimos mensajes escaneados)
  // y lo persistimos en "resumenes_atencion". Todo va en try/catch:
  // un fallo del resumen NO puede romper la derivación al humano.
  try {

    const traffic = await getTraffic(phone);

    const summary = await buildHandoffSummary(
      phone,
      traffic,
      reason || "El cliente pidió hablar con un asesor (Opción 6 del menú)"
    );

    // [ByCodex] (BRIEF-025) La selección persistida prevalece sobre el historial.
    // [ByClaude] (BRIEF-025) Revisión: si falla esta lectura, guardar igual el
    // resumen con la detección por historial en vez de perderlo entero.
    let product = null;
    try {
      product = await loadSelectedProduct(phone);
    } catch (error) {
      console.error(
        `[ByClaude] (BRIEF-025) Prenda no leída para el resumen de ${redactPhone(phone)}:`,
        safeError(error)
      );
    }
    summary.prenda_seleccionada_id = product ? product.id : null;
    if (product) {
      summary.modelo_seleccionado = product.nombre;
    }

    await saveHandoffSummary(summary);

  } catch (error) {

    // [ByOpenCode] (BRIEF-006) REDACT teléfono + safeError.
    console.error(
      `[ByClaude] (Reasignado) Error generando Resumen para Atención de ${redactPhone(phone)}:`,
      safeError(error)
    );

  }
}


// [ByClaude] (BRIEF-012) RUTA 7 — Contacto y horarios.
// Horario, Instagram y dirección salen de `business.js`. Datos sin
// confirmar se marcan "Por confirmar" o se omiten. Sin inventos.
async function replyContact(phone) {

  const partes = ["📍 *Contacto y horarios*", ""];

  partes.push("• WhatsApp: este mismo chat 😉");

  if (business.horario_atencion) {
    partes.push(`• Horario de atención: *${business.horario_atencion}*.`);
  } else {
    partes.push("• Horario de atención: *Por confirmar*.");
  }

  if (business.instagram) {
    partes.push(`• Instagram: *${business.instagram}*.`);
  }

  if (business.direccion_fisica) {
    partes.push(`• Dirección: ${business.direccion_fisica}.`);
  }

  partes.push("");
  partes.push("Escribí *menú* para volver al menú principal.");

  await sendAndLog(phone, partes.join("\n"));
  await setUserState(phone, STATES.MENU);
}


// ======================================================
// PROCESADOR PRINCIPAL: opción del menú 1..7 — [ByClaude]
// ======================================================
//
// [ByClaude] Dado un teléfono y una selección "cruda" (número, id de la
// lista interactiva o palabra clave), ejecuta la ruta del árbol
// conversacional que corresponda y devuelve un pequeño resumen del
// resultado. Si la selección no corresponde a ninguna opción válida,
// devuelve { ok: false, reason: "no_match" } sin efectos secundarios,
// para que app.js decida si reenviar el menú al cliente.
async function processMenuOption(phone, rawSelection, extras = {}) {

  const option = resolveMenuOption(rawSelection);

  if (!option) {
    return { ok: false, reason: "no_match" };
  }

  // [ByOpenCode] (BRIEF-006) REDACT teléfono.
  console.log(
    `[ByClaude] Opción ${option.number} (${option.id}) elegida por ${redactPhone(phone)}`
  );

  switch (option.id) {

    case "catalogo": {
      const isFirstTime = !(await hasReceivedCatalog(phone));
      await replyCatalog(phone, { isFirstTime });
      return { ok: true, option, action: "catalog_sent" };
    }

    case "modelos": {
      await replyNewModels(phone);
      return { ok: true, option, action: "models_sent" };
    }

    case "precios_tallas": {
      await replyPricesAndSizes(phone);
      return { ok: true, option, action: "prices_sent" };
    }

    case "stock": {
      await replyStock(phone);
      return { ok: true, option, action: "stock_sent" };
    }

    case "envios": {
      await replyShipping(phone);
      return { ok: true, option, action: "shipping_sent" };
    }

    case "asesor": {
      // [ByClaude] (BRIEF-031) Si viene reason externo (ej. media recibido),
      // lo pasamos a replyDeriveToHuman para que quede en el Resumen.
      await replyDeriveToHuman(phone, { reason: extras.reason || null });
      return { ok: true, option, action: "paused_human" };
    }

    case "contacto": {
      await replyContact(phone);
      return { ok: true, option, action: "contact_sent" };
    }

    default:
      // Nunca debería llegar (resolveMenuOption ya validó el id),
      // pero lo dejamos por seguridad.
      return { ok: false, reason: "unknown_id" };
  }
}


// ======================================================
// FLUJOS DE ENTRADA — [ByClaude]
// ======================================================


// [ByClaude] Saludo inicial: se llama la PRIMERA vez que un cliente
// escribe (estado ORGANIC). Manda un saludo, luego el menú principal,
// y deja al cliente en estado MENU esperando la selección de opción.
async function greetAndShowMenu(phone) {

  const hello =
    "¡Hola! 👋 Somos *Cecilia Tedin*.\n" +
    "Elegí una opción del menú para que te ayudemos 😊";

  await sendAndLog(phone, hello);

  // [ByCodex] (BRIEF-011) Un menú fallido no se registra como aceptado ni cambia el estado.
  await sendAndRecord(phone, "[Menú principal]", () => sendMainMenu(phone));

  await setUserState(phone, STATES.MENU);
}


// [ByClaude] Reenvía el menú principal. Se usa cuando:
//   - El cliente ya vio el menú pero escribió texto que no encaja.
//   - El cliente pidió volver al menú explícitamente ("menú", "volver", ...).
// Recibe un "hint" opcional para explicarle al cliente por qué se lo
// mostramos otra vez.
async function showMenu(phone, { hint = null } = {}) {

  if (hint) {
    await sendAndLog(phone, hint);
  }

  // [ByCodex] (BRIEF-011) Misma política en reenvíos del menú.
  await sendAndRecord(phone, "[Menú principal]", () => sendMainMenu(phone));

  await setUserState(phone, STATES.MENU);
}


// ======================================================
// EXPORTS
// ======================================================
module.exports = {

  // [ByOpenCode] Tráfico de clientes (anuncio / orgánico).
  registerTraffic,
  getTraffic,

  // [ByClaude] Estado conversacional (constantes y getters/setters).
  STATES,
  CATALOG_IMAGE_KEYS,
  MENU_OPTIONS,
  MENU_REOPEN_KEYWORDS,
  getUserState,
  getSelectionContext,
  loadSelectedProduct,
  setUserState,
  resumeBotForClient,

  // [ByClaude] Parseo de la selección del cliente.
  extractSelection,
  resolveProductSelection,
  resolveMenuOption,
  requestedMenu,

  // [ByClaude] Árbol conversacional V1 (7 rutas + saludo + menú).
  processMenuOption,
  loadCatalogProducts,
  handleProductPick,
  selectProduct,
  greetAndShowMenu,
  showMenu,
  showProductList
};
