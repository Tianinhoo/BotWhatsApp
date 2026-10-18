// ======================================================
// summary.service.js — Extracción unificada del Resumen para Atención
// [ByClaude] (BRIEF-015 + BRIEF-017)
// ======================================================
//
// Módulo único que arma el "Resumen para Atención" que la asesora
// humana ve cuando el cliente pasa a PAUSED_HUMAN. Antes existían dos
// builders con criterios distintos:
//   - messages.service.js: persistía con detección regex y fallback al
//     último mensaje del cliente (que podía ser "6" y quedar como interés).
//   - dashboard.js: reconstruía on-demand con OTRA regex + otro fallback.
//
// Ahora ambos consumen este módulo:
//   - `buildFromContext({ traffic, clientMessages, reason })` es la única
//     fuente de verdad de qué contiene el resumen.
//   - Filtramos SIEMPRE las marcas internas del sistema
//     (`[Opción del menú: X]`, `[Interacción con el menú]`, etc.) antes de
//     usar el "último mensaje libre" como interés o necesidad.
//
// Campos del resumen (los 4 del pedido original):
//   - origen_trafico       → "anuncio" | "organico" | "desconocido"
//   - modelo_seleccionado  → "Modelo N" | "Oferta del día" | null
//   - interes_color        → texto libre corto describiendo qué quiere
//   - necesidad            → texto libre corto describiendo para qué o
//                            "Por confirmar" cuando no hay datos suficientes


// ======================================================
// PATRONES DE DETECCIÓN
// ======================================================
// [ByClaude] (BRIEF-015) Modelos del catálogo Piloto V1. Aceptamos:
//   - "Modelo 1/2/3" en dígito o palabra (uno/dos/tres).
//   - "Oferta del día".
const MODEL_PATTERNS = [
  { rx: /\bmodelo\s*(?:1|uno)\b/i,   label: "Modelo 1" },
  { rx: /\bmodelo\s*(?:2|dos)\b/i,   label: "Modelo 2" },
  { rx: /\bmodelo\s*(?:3|tres)\b/i,  label: "Modelo 3" },
  { rx: /\boferta(?:\s+del\s+d[íi]a)?\b/i, label: "Oferta del día" }
];

// [ByClaude] (BRIEF-015) Colores comunes en español. Bordes de palabra
// para que "rosa" no matchee dentro de "gaseosa".
const COLOR_KEYWORDS = [
  "negro", "blanco", "rojo", "azul", "verde", "amarillo",
  "rosa", "rosado", "gris", "marron", "marrón", "cafe", "café",
  "morado", "violeta", "lila", "celeste", "beige", "crema",
  "dorado", "plateado", "naranja", "turquesa", "vino", "bordo",
  "bordó", "fucsia", "coral"
];

const COLOR_RX = new RegExp("\\b(" + COLOR_KEYWORDS.join("|") + ")\\b", "i");


// ======================================================
// MARCAS INTERNAS QUE HAY QUE FILTRAR
// ======================================================
// [ByClaude] (BRIEF-015) Marcas que app.js inserta en la tabla `mensajes`
// para representar interacciones no textuales (toques de menú, tipos
// no soportados, etc.). NUNCA deben quedar como "interés" ni como
// "necesidad" del cliente.
//
// Ejemplos que hay que filtrar:
//   [Opción del menú: Ver catálogo completo]
//   [Interacción con el menú]
//   [audio]  /  [image]  /  [sticker]
//
// Regla simple: si el mensaje ENTERO está entre corchetes, es marca.
const BRACKET_ONLY_RX = /^\s*\[[^\]]*\]\s*$/;

// [ByClaude] (BRIEF-015) También extraemos el título de un `[Opción del
// menú: X]` para casos en los que sí queremos saber qué opción tocó
// (por ejemplo, si NO hay texto libre y queremos mostrar "eligió ver
// catálogo" como último recurso — no como interés real).
const MENU_OPTION_RX = /^\[Opción del menú:\s*(.+?)\]\s*$/;


// ======================================================
// HELPERS DE LIMPIEZA
// ======================================================
// [ByClaude] (BRIEF-015) Devuelve solo los mensajes del cliente que son
// texto libre (no marcas internas). Preserva el orden original.
// [ByCodex] (BRIEF-016) Integración: los números 1–7 aislados son comandos del menú, no contexto.
// [ByClaude] (BRIEF-025) Para "Necesidad": saludos y palabras de navegación
// no son contexto; los ordinales de la lista de prendas llegan hasta 9.
const NAV_ONLY = new Set(["menu", "menú", "volver", "inicio", "opciones", "hola",
  "buenas", "buenos dias", "buenos días", "buenas tardes", "buenas noches"]);

function isNavigationOnly(text) {
  const key = text.toLowerCase().replace(/[!¡.,¿?\s]+/g, " ").trim();
  return /^[1-9]$/.test(key) || NAV_ONLY.has(key);
}

function keepFreeText(messages) {
  return messages
    .filter((m) => (m.origen || "cliente") === "cliente")
    .map((m) => ({ ...m, contenido: (m.contenido || "").trim() }))
    .filter((m) => m.contenido && !BRACKET_ONLY_RX.test(m.contenido) && !/^[1-7]$/.test(m.contenido));
}


// ======================================================
// EXTRACTORES
// ======================================================


// [ByClaude] (BRIEF-015) Detecta el ÚLTIMO modelo mencionado por el
// cliente en TEXTO LIBRE. Ignora marcas internas.
function detectModel(clientMessages) {
  const freeText = keepFreeText(clientMessages);
  for (let i = freeText.length - 1; i >= 0; i--) {
    for (const { rx, label } of MODEL_PATTERNS) {
      if (rx.test(freeText[i].contenido)) return label;
    }
  }
  return null;
}


// [ByClaude] (BRIEF-015) Detecta el ÚLTIMO color mencionado en texto libre.
function detectColor(clientMessages) {
  const freeText = keepFreeText(clientMessages);
  for (let i = freeText.length - 1; i >= 0; i--) {
    const match = freeText[i].contenido.match(COLOR_RX);
    if (match) return match[1].toLowerCase();
  }
  return null;
}


// [ByClaude] (BRIEF-015) INTERÉS: qué producto/color/talla NOMBRÓ el
// cliente. Preferimos texto libre; si no hay, usamos el nombre de la
// última opción del menú tocada; si tampoco, devolvemos null.
//
// NUNCA devolvemos "6" ni el label crudo de opción entre corchetes.
function extractInteres(clientMessages, { modelo = null, color = null } = {}) {

  // 1) Combinar modelo + color detectados en frase corta.
  if (modelo && color) return `${modelo} · color ${color}`;
  if (modelo) return modelo;
  if (color) return `color ${color}`;

  // 2) Último texto libre que dijo el cliente (sin marcas de sistema).
  const freeText = keepFreeText(clientMessages);
  if (freeText.length > 0) {
    return freeText[freeText.length - 1].contenido.slice(0, 200);
  }

  // 3) Como último recurso, el nombre de la última opción del menú.
  //    Ejemplo: [Opción del menú: Ver catálogo completo] → "Ver catálogo completo".
  const onlyClient = clientMessages.filter((m) => (m.origen || "cliente") === "cliente");
  for (let i = onlyClient.length - 1; i >= 0; i--) {
    const t = (onlyClient[i].contenido || "").trim();
    const menuMatch = t.match(MENU_OPTION_RX);
    if (menuMatch) return menuMatch[1].trim();
  }

  return null;
}


// [ByClaude] (BRIEF-017) NECESIDAD: para qué / cuándo / para quién lo
// quiere. Casi siempre es texto libre. Se compone con los últimos 1-3
// textos libres del cliente. Si no hay texto libre, devuelve
// "Por confirmar" (fallback acordado con el humano).
//
// Si el texto candidato es idéntico al modelo o al interés ya capturados,
// también devuelve "Por confirmar" para no duplicar información.
function extractNecesidad(clientMessages, { alreadyCaptured = {} } = {}) {

  const freeText = keepFreeText(clientMessages)
    .map((m) => m.contenido)
    .filter((text) => !isNavigationOnly(text));
  if (freeText.length === 0) return "Por confirmar";

  const last = freeText.slice(-3).join(" · ").slice(0, 300);

  // [ByClaude] (BRIEF-017) Dedup SOLO contra el modelo detectado.
  // No dedup contra el interés: cuando hay UN solo texto libre, ese
  // texto suele ser la mejor descripción de la necesidad, aunque
  // parcialmente se solape con el interés (que también cae al mismo
  // texto libre en ausencia de modelo/color). Mejor duplicar levemente
  // que descartar la necesidad real.
  return last === alreadyCaptured.modelo ? "Por confirmar" : last;
}


// ======================================================
// BUILDER PRINCIPAL
// ======================================================
// [ByClaude] (BRIEF-015 + BRIEF-017) Construye el objeto completo del
// resumen a partir de:
//   - phone         : número del cliente (sin "+").
//   - traffic       : fila de trafico_clientes (o null).
//   - clientMessages: array de mensajes del cliente (origen='cliente').
//   - reason        : motivo textual de la derivación (opcional).
//
// Retorna un objeto plano con exactamente los 4 campos del pedido +
// metadatos útiles (timestamp, motivo, origen_detalle).
function buildFromContext({ phone, traffic = null, clientMessages = [], reason = null }) {

  const modelo = detectModel(clientMessages);
  const color  = detectColor(clientMessages);
  const interes = extractInteres(clientMessages, { modelo, color });
  const necesidad = extractNecesidad(clientMessages, {
    alreadyCaptured: { modelo, interes }
  });

  const origen = traffic?.origen || "desconocido";
  const origenDetalle = traffic
    ? {
        origen: traffic.origen,
        source_type: traffic.source_type,
        source_id: traffic.source_id,
        headline: traffic.headline,
        body: traffic.body,
        source_url: traffic.source_url,
        first_referral_id: traffic.first_referral_id
      }
    : { origen };

  return {
    telefono: String(phone),
    origen_trafico: origen,
    modelo_seleccionado: modelo,
    interes_color: interes,
    necesidad: necesidad,
    motivo_derivacion: reason || "El cliente pidió hablar con un asesor",
    origen_detalle: origenDetalle,
    generado_en: new Date().toISOString()
  };
}


// ======================================================
// EXPORTS
// ======================================================
module.exports = {
  // Constantes exportadas para tests / reuso.
  MODEL_PATTERNS,
  COLOR_KEYWORDS,
  BRACKET_ONLY_RX,
  MENU_OPTION_RX,

  // Helpers de limpieza.
  keepFreeText,

  // Extractores individuales.
  detectModel,
  detectColor,
  extractInteres,
  extractNecesidad,

  // Builder principal.
  buildFromContext
};
