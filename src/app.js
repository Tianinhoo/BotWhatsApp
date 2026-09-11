require("dotenv").config();

const express = require("express");

const {
  sendTextMessage,
  sendImageMessage
} = require("./services/whatsapp.service");

const {
  hasReceivedCatalog,
  markCatalogSent
} = require("./services/catalog-state.service");


const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;


// ======================================================
// CONFIGURACIÓN DEL CATÁLOGO
// ======================================================

const catalogKeywords = [
  "catalogo",
  "catálogo",
  "ver catalogo",
  "ver catálogo",
  "modelos",
  "ver modelos",
  "ofertas",
  "ver ofertas",
  "promociones",
  "ver promociones"
];


// Evita mandar dos catálogos al mismo tiempo
// si el cliente envía varios mensajes muy rápido.
const catalogInProgress = new Set();


// ======================================================
// FUNCIÓN: detectar solicitud de catálogo
// ======================================================

function requestedCatalog(text) {
  if (!text) {
    return false;
  }

  const normalizedText = text
    .trim()
    .toLowerCase();

  return catalogKeywords.some(
    keyword => normalizedText.includes(keyword)
  );
}


// ======================================================
// FUNCIÓN: enviar catálogo
// ======================================================

async function sendCatalog(phone, isFirstTime = false) {

  if (catalogInProgress.has(phone)) {
    console.log(
      `Catálogo ya se está enviando a ${phone}.`
    );

    return;
  }

  catalogInProgress.add(phone);

  try {

    // Mensaje inicial
    if (isFirstTime) {

      await sendTextMessage(
        phone,
        "¡Hola! 👋 Gracias por escribir a Cecilia Tedin.\n\n" +
        "A continuación te mostramos nuestros modelos y promociones disponibles 😊"
      );

    } else {

      await sendTextMessage(
        phone,
        "¡Claro! 😊 Te mostramos nuevamente nuestros modelos y promociones."
      );

    }


    // Modelo 1
    await sendImageMessage(
      phone,
      process.env.IMAGE_MODELO_1,
      "Modelo 1 ✨"
    );


    // Modelo 2
    await sendImageMessage(
      phone,
      process.env.IMAGE_MODELO_2,
      "Modelo 2 ✨"
    );


    // Modelo 3
    await sendImageMessage(
      phone,
      process.env.IMAGE_MODELO_3,
      "Modelo 3 ✨"
    );


    // Oferta del día
    await sendImageMessage(
      phone,
      process.env.IMAGE_OFERTA_DIA,
      "🔥 Oferta del día"
    );


    // Mensaje final
    await sendTextMessage(
      phone,
      "Si alguno de nuestros modelos te interesa, " +
      "escríbenos cuál y con gusto te ayudamos con " +
      "colores, tallas y disponibilidad 😊"
    );


    // Guardamos que este cliente ya recibió el catálogo
    await markCatalogSent(phone);

    console.log(
      `Catálogo enviado correctamente a ${phone} ✅`
    );

  } catch (error) {

    console.error(
      `Error enviando catálogo a ${phone}:`,
      error.response?.data || error.message
    );

  } finally {

    catalogInProgress.delete(phone);

  }
}


// ======================================================
// RUTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {

  res.send(
    "Cecilia Tedin Bot funcionando ✅"
  );

});


// ======================================================
// VERIFICACIÓN DEL WEBHOOK DE META
// ======================================================

app.get("/webhook", (req, res) => {

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];


  if (
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN
  ) {

    console.log(
      "Webhook verificado correctamente ✅"
    );

    return res
      .status(200)
      .send(challenge);
  }


  console.log(
    "Intento de verificación rechazado ❌"
  );

  return res.sendStatus(403);

});


// ======================================================
// RECEPCIÓN DE MENSAJES DE WHATSAPP
// ======================================================

app.post("/webhook", async (req, res) => {

  // Respondemos inmediatamente a Meta.
  // El procesamiento continúa después.
  res.sendStatus(200);


  try {

    const value =
      req.body.entry?.[0]
        ?.changes?.[0]
        ?.value;


    const message =
      value?.messages?.[0];


    // Algunos webhooks son estados de mensajes
    // y no contienen mensajes entrantes.
    if (!message) {
      return;
    }


    const phone = message.from;

    const text =
      message.text?.body
        ?.trim()
        ?.toLowerCase() || "";


    console.log(
      `Mensaje recibido de ${phone}: ${text || `[${message.type}]`}`
    );


    const alreadyReceivedCatalog =
      await hasReceivedCatalog(phone);


    const wantsCatalog =
      requestedCatalog(text);


    // ==================================================
    // CLIENTE NUEVO
    // ==================================================

    if (!alreadyReceivedCatalog) {

      console.log(
        `Cliente nuevo: ${phone}`
      );

      await sendCatalog(
        phone,
        true
      );

      return;
    }


    // ==================================================
    // CLIENTE PIDE EL CATÁLOGO DE NUEVO
    // ==================================================

    if (wantsCatalog) {

      console.log(
        `Cliente ${phone} solicitó nuevamente el catálogo.`
      );

      await sendCatalog(
        phone,
        false
      );

      return;
    }


    // ==================================================
    // MENSAJE NORMAL
    // ==================================================

    console.log(
      `Cliente ${phone} ya recibió el catálogo. ` +
      "El mensaje queda para atención humana."
    );


  } catch (error) {

    console.error(
      "Error procesando webhook:",
      error.response?.data ||
      error.message
    );

  }

});


// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {

  console.log(
    `Cecilia Tedin Bot iniciado ✅`
  );

  console.log(
    `Servidor funcionando en http://localhost:${PORT}`
  );

});