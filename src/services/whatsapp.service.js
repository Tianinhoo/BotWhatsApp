const axios = require("axios");
// [ByCodex] (BRIEF-030) Plazo total que cancela la peticion real, sin reintentos.
const { setTimeout, clearTimeout } = require("node:timers");
const SEND_TIMEOUT_MS = 8000;
async function postMessage(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  timer.unref?.();
  try {
    return await axios.post(buildMessagesUrl(), payload, {
      headers: buildHeaders(), timeout: SEND_TIMEOUT_MS, signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}


// [ByOpenCode] (BRIEF-006) safeError descarta error.config (lleva el
// Bearer token) en los logs de errores de axios.
const { safeError } = require("./logger.service");


// ======================================================
// HELPERS INTERNOS
// ======================================================
// [ByOpenCode] Helper interno: construye la URL del endpoint "messages".
// Centraliza la URL para no repetirla en cada función.
function buildMessagesUrl() {
  return (
    `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}` +
    `/${process.env.PHONE_NUMBER_ID}/messages`
  );
}

// [ByOpenCode] Helper interno: headers comunes de todas las llamadas a Meta.
// Incluye el token de autorización y el tipo de contenido JSON.
function buildHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json"
  };
}


// ======================================================
// ENVIAR MENSAJE DE TEXTO
// ======================================================
// Función existente: envía un mensaje de texto simple por WhatsApp.
async function sendTextMessage(to, text) {
  try {
    const response = await postMessage(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          body: text
        }
      }
    );
    return response.data;
  } catch (error) {
    // [ByOpenCode] (BRIEF-006) safeError: nunca se loguea error.config.
    // [ByCodex] (BRIEF-011) Propagar el rechazo para persistir fallo y detener la ruta.
    console.error("[Whatsapp Service] Error enviando mensaje de texto.", safeError(error));
    throw error;
  }
}


// ======================================================
// ENVIAR MENSAJE DE IMAGEN
// ======================================================
// Función existente: envía una imagen a través del media_id de Meta.
async function sendImageMessage(to, imageId, caption = "") {
  try {
    const response = await postMessage(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "image",
        image: {
          id: imageId,
          caption: caption
        }
      }
    );
    return response.data;
  } catch (error) {
    // [ByOpenCode] (BRIEF-006) safeError: nunca se loguea error.config.
    // [ByCodex] (BRIEF-011) También abortar catálogos cuando una imagen falla.
    console.error("[Whatsapp Service] Error enviando imagen.", safeError(error));
    throw error;
  }
}


// ======================================================
// MENÚ INTERACTIVO DE 7 OPCIONES (tipo "list")
// ======================================================
// [ByOpenCode] MENÚ PRINCIPAL DEL PILOTO V1: 7 opciones agrupadas en 3 secciones.
// Estructura que entiende Meta para los mensajes interactivos tipo "list".
// Cada fila (row) necesita un "id" (se recibe como respuesta) y un "title" (visible).
const MAIN_MENU_SECTIONS = [
  {
    title: "🛍️ Catálogo",
    rows: [
      {
        id: "catalogo",
        title: "Ver catálogo completo",
        description: "Todos nuestros modelos y ofertas"
      },
      {
        id: "modelos",
        title: "Modelos nuevos",
        description: "Lo último que llegó a la tienda"
      }
    ]
  },
  {
    title: "💬 Consultas",
    rows: [
      {
        id: "precios_tallas",
        title: "Precios y tallas",
        description: "Consultar precios y medidas disponibles"
      },
      {
        id: "stock",
        title: "Disponibilidad / stock",
        description: "Saber si un modelo está disponible"
      },
      {
        id: "envios",
        title: "Envíos y entregas",
        description: "Cobertura, costos y tiempos de entrega"
      }
    ]
  },
  {
    title: "👩‍💼 Atención",
    rows: [
      {
        id: "asesor",
        title: "Hablar con un asesor",
        description: "Te deriva a atención personalizada"
      },
      {
        id: "contacto",
        title: "Contacto y horarios",
        description: "Dónde encontrarnos y cuándo respondemos"
      }
    ]
  }
];


// [ByOpenCode] Función NUEVA: envía un menú interactivo tipo "lista".
// Es la forma oficial de WhatsApp Cloud API para mostrar hasta 10 opciones
// desplegables dentro de un menú de un solo botón.
//
// Parámetros (objeto):
//   - to          : número del cliente en formato internacional (sin "+").
//   - header      : texto corto (opcional) que va arriba del menú.
//   - body        : texto principal del mensaje.
//   - footer      : texto pequeño (opcional) al pie del mensaje.
//   - buttonText  : texto del botón que despliega el menú (máx. 20 caracteres).
//   - sections    : array de secciones con sus filas (por defecto el menú de 7).
//
// Devuelve la respuesta completa de la API de Meta (con el id del mensaje).
async function sendListMessage({
  to,
  header,
  body,
  footer,
  buttonText = "Ver menú",
  sections = MAIN_MENU_SECTIONS
}) {
  try {
    const interactive = {
      type: "list",
      header: { type: "text", text: header },
      body: { text: body },
      footer: { text: footer },
      action: {
        button: buttonText,
        sections: sections
      }
    };

    const response = await postMessage(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: interactive
      }
    );
    return response.data;
  } catch (error) {
    // [ByOpenCode] (BRIEF-006) safeError: nunca se loguea error.config.
    // [ByCodex] (BRIEF-011) Un menú rechazado no habilita la transición a MENU.
    console.error("[Whatsapp Service] Error enviando List Message.", safeError(error));
    throw error;
  }
}


// [ByOpenCode] Función NUEVA: envía un mensaje interactivo tipo "botones".
// WhatsApp solo permite un máximo de 3 botones por mensaje, cada uno con:
//   - id    : identificador interno que se recibe como respuesta.
//   - title : texto visible del botón (máx. 20 caracteres).
//
// Parámetros (objeto):
//   - to      : número del cliente.
//   - body    : texto principal del mensaje.
//   - buttons : array con máximo 3 botones: [{ id, title }, ...].
//
// Devuelve la respuesta completa de la API de Meta.
async function sendButtonMessage({
  to,
  body,
  buttons = []
}) {
  try {
    const replyButtons = buttons.map((button) => ({
      type: "reply",
      reply: {
        id: button.id,
        title: button.title
      }
    }));

    const response = await postMessage(
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: replyButtons
          }
        }
      }
    );
    return response.data;
  } catch (error) {
    // [ByOpenCode] (BRIEF-006) safeError: nunca se loguea error.config.
    // [ByCodex] (BRIEF-011) Contrato uniforme para todos los transportes de salida.
    console.error("[Whatsapp Service] Error enviando botones.", safeError(error));
    throw error;
  }
}


// [ByOpenCode] Función NUEVA: atajo para enviar el MENÚ PRINCIPAL de 7 opciones.
// Evita repetir el mismo "body"/"footer" en cada llamada.
//   - to : número del cliente al que se le mostrará el menú.
async function sendMainMenu(to) {

  return sendListMessage({
    to: to,
    header: "¡Bienvenida a Cecilia Tedin! 🛍️",
    body: "¿En qué puedo ayudarte hoy? Elegí una opción del menú y te respondo al toque 😊",
    footer: "Cecilia Tedin · Ropa con estilo",
    buttonText: "Ver menú",
    sections: MAIN_MENU_SECTIONS
  });
}


// [ByOpenCode] Exportamos TODAS las funciones del servicio.
// (Se consolidaron al final para un módulo más claro.)
module.exports = {
  sendTextMessage,
  sendImageMessage,
  sendListMessage,
  sendButtonMessage,
  sendMainMenu,
  MAIN_MENU_SECTIONS
};
