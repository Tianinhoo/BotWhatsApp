require("dotenv").config();

const crypto = require("crypto");
const express = require("express");

// [ByClaude] Piloto V1 (árbol conversacional de 7 rutas, SIN IA generativa).
// El servicio state.service.js concentra TODO el motor conversacional:
//   - Registro de tráfico (anuncio / orgánico)  [ByOpenCode].
//   - Estado del cliente + procesamiento de las 7 opciones del menú [ByClaude].
// [ByClaude] (BRIEF-019) La V0 tenía un agente generativo; se eliminó en el glowdown.
const {
  // Tráfico
  registerTraffic,
  // Estado conversacional
  STATES,
  getUserState,
  // Parseo
  extractSelection,
  resolveMenuOption,
  requestedMenu,
  // Árbol V1
  processMenuOption,
  greetAndShowMenu,
  showMenu
} = require("./services/state.service");

// [ByClaude] Persistencia de mensajes entrantes para que aparezcan en el
// dashboard exactamente igual que antes (misma tabla "mensajes").
const { saveMessage } = require("./services/messages.service");

// [ByAntigravity] Para endpoint de health
const pool = require("./services/db");

// [ByCodex] (BRIEF-002: deduplicación persistente antes del árbol conversacional).
const { tryClaimMessage } = require("./services/dedup.service");

// [ByCodex] (BRIEF-026) Serializar antes de cualquier consulta por mensaje.
const { processInOrder } = require("./services/queue.service");

const dashboard = require("./routes/dashboard");

// [ByOpenCode] (BRIEF-006) Helpers de logging redactado (PII/secrets).
const { redactPhone, safeError } = require("./services/logger.service");


const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ======================================================
// [ByAntigravity] (endurecido) MIDDLEWARE DE VALIDACIÓN HMAC (Seguridad)
// ======================================================
// Validamos la firma X-Hub-Signature-256 de Meta para garantizar que
// los requests del webhook provengan genuinamente de WhatsApp.

// [ByAntigravity] (BRIEF-009) Modos aceptados de skip explícito.
const SKIP_ENVS = new Set(["development", "test"]);

// [ByAntigravity] (BRIEF-009) Warning al arrancar (una sola vez).
if (!process.env.APP_SECRET) {
  const env = process.env.NODE_ENV || "development";
  if (SKIP_ENVS.has(env)) {
    console.warn(`[HMAC] Modo ${env} sin APP_SECRET — validación desactivada.`);
  }
}

function verifyMetaSignature(req, res, next) {
  const env = process.env.NODE_ENV || "development";

  // Skip explícito solo en dev/test.
  if (!process.env.APP_SECRET && SKIP_ENVS.has(env)) {
    return next();
  }

  // Sin APP_SECRET en cualquier otro entorno: rechazo del request.
  if (!process.env.APP_SECRET) {
    console.warn(`[HMAC] APP_SECRET faltante en NODE_ENV=${env} — rechazo.`);
    return res.sendStatus(500);
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    console.warn("❌ Falta firma X-Hub-Signature-256 en el webhook.");
    return res.sendStatus(403);
  }

  const expectedHash = crypto
    .createHmac("sha256", process.env.APP_SECRET)
    .update(req.rawBody)
    .digest("hex");

  const expectedSignature = `sha256=${expectedHash}`;

  // [ByAntigravity] (endurecido) Comparación timing-safe.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn("❌ Firma HMAC del webhook inválida.");
    return res.sendStatus(403);
  }

  next();
}

app.use(dashboard);

const PORT = process.env.PORT || 3000;


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
// [ByClaude] REGISTRAR EL MENSAJE ENTRANTE DEL CLIENTE
// ======================================================
// Helper interno: guarda en la tabla "mensajes" el mensaje que llegó del
// cliente, sea texto o una selección interactiva. Antes vivía repetido
// en dos ramas del webhook (agente / fallback); ahora es único.
async function saveIncomingMessage(phone, message, rawText) {

  // Si el cliente tocó la lista interactiva, guardamos qué opción tocó
  // (esto se ve mejor en el dashboard que "[interactive]").
  if (message.interactive) {
    const listTitle =
      message.interactive.list_reply?.title ||
      message.interactive.button_reply?.title;

    const label = listTitle
      ? `[Opción del menú: ${listTitle}]`
      : "[Interacción con el menú]";

    await saveMessage(phone, "cliente", label);
    return;
  }

  await saveMessage(
    phone,
    "cliente",
    rawText || `[${message.type}]`
  );
}


// ======================================================
// RECEPCIÓN DE MENSAJES DE WHATSAPP
// ======================================================

// [ByCodex] (BRIEF-028) Un turno independiente por mensaje; todos los niveles del lote.
function collectIncoming(body) {
  const items = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        if (message && typeof message.from === "string" && message.from) {
          items.push({ value, message });
        }
      }
    }
  }
  return items;
}

// [ByCodex] (BRIEF-028) El error de un mensaje no descarta sus hermanos.
async function processIncoming(value, message) {
    // [ByCodex] (BRIEF-026) Encolar antes de dedup: una consulta lenta no
    // reordena mensajes. La cola conserva el turno hasta terminar realmente.
    const phone = message.from;
    return processInOrder(phone, async () => {
      // [ByCodex] (BRIEF-002: solo el primer INSERT procesa este wamid).
      // Se ejecuta antes de logs, tráfico, historial, estado o respuestas.
      // Sin id conservamos el flujo anterior para simuladores locales.
      if (message.id) {
        const isNew = await tryClaimMessage(message.id, message.from);
        if (!isNew) {
          console.log(`[dedup] wamid ${message.id} ya procesado, ignoro.`);
          return;
        }
      }


      const rawText =
        message.text?.body?.trim() || "";


      // [ByOpenCode] (BRIEF-006) REDACT: teléfono a últimos 4 dígitos; DROP:
      // el contenido del mensaje (puede traer PII de terceros). Solo se deja
      // el tipo de mensaje para entender el tráfico en Railway logs.
      console.log(
        `[ByOpenCode] Mensaje recibido de ${redactPhone(phone)} (type=${message.type})`
      );


      // ==================================================
      // [ByOpenCode] PILOTO V1 — ORIGEN DEL TRÁFICO
      // ==================================================
      // Extraemos el objeto "referral" del webhook:
      //   - Si viene un "referral" (Click-to-WhatsApp de un anuncio de Meta),
      //     el cliente llegó desde un ANUNCIO y se registra como tal.
      //   - Si NO hay "referral", el mensaje es tráfico ORGÁNICO.
      //
      // La información se envía a state.service.js, que la persiste en la
      // tabla "trafico_clientes". Se hace SIEMPRE, justo después de recibir
      // el mensaje.
      const referral =
        message.referral ||
        (Array.isArray(value?.contacts)
          ? value.contacts.find(contact => contact?.wa_id === phone)?.referral
          : null) ||
        null;

      const origenTrafico =
        referral
          ? "anuncio"
          : "organico";

      try {
        await registerTraffic(phone, origenTrafico, referral);
      } catch (error) {
        // [ByOpenCode] Un fallo del registro nunca puede cortar la
        // respuesta al cliente: logueamos y seguimos.
        // [ByOpenCode] (BRIEF-006) REDACT teléfono + safeError.
        console.error(
          `[ByOpenCode] Error registrando tráfico de ${redactPhone(phone)}:`,
          safeError(error)
        );
      }


      // ==================================================
      // [ByClaude] PILOTO V1 — MOTOR CONVERSACIONAL (7 RUTAS)
      // ==================================================
      // [ByClaude] (BRIEF-019) Antes acá vivía un agente generativo. En V1 el bot ya no razona
      // en lenguaje natural: solo enruta la selección del cliente al
      // handler correspondiente del árbol de 7 opciones.
      //
      // Flujo:
      //   1. Guardamos el mensaje entrante en "mensajes" (dashboard).
      //   2. Leemos el estado actual del cliente.
      //   3. Si está en PAUSED_HUMAN → no respondemos, humano se encarga.
      //   4. Si está en ORGANIC y no eligió nada → saludo + menú.
      //   5. Si eligió una opción válida (1..7 o id) → ejecutamos su ruta.
      //   6. Si escribió texto libre → reenviamos el menú con un hint.

      await saveIncomingMessage(phone, message, rawText);

      const state = await getUserState(phone);

      // 3) Cliente pausado por un asesor humano: NO responder desde el bot.
      // [ByOpenCode] (BRIEF-006) REDACT teléfono.
      if (state === STATES.PAUSED_HUMAN) {
        console.log(
          `[ByClaude] Cliente ${redactPhone(phone)} está en PAUSED_HUMAN. Bot en silencio.`
        );
        return;
      }

      // Extraemos la selección del cliente (interactivo o texto).
      const rawSelection = extractSelection(message);
      const option = resolveMenuOption(rawSelection);

      // 5) Opción válida del árbol V1 (1..7): ejecutamos su ruta.
      if (option) {
        await processMenuOption(phone, rawSelection);
        return;
      }

      // 4) Cliente ORGANIC (primer contacto) sin opción válida → saludo + menú.
      // [ByOpenCode] (BRIEF-006) REDACT teléfono.
      if (state === STATES.ORGANIC) {
        console.log(
          `[ByClaude] Cliente nuevo (ORGANIC): ${redactPhone(phone)}. Envío saludo + menú.`
        );
        await greetAndShowMenu(phone);
        return;
      }

      // 6) El cliente ya está en MENU o CATALOG pero escribió texto libre.
      // - Si pidió explícitamente volver al menú (palabra clave) → menú limpio.
      // - Si escribió cualquier otra cosa → menú con un hint amable.
      if (requestedMenu(rawText)) {
        await showMenu(phone);
        return;
      }

      await showMenu(phone, {
        hint:
          "Perdón, aún no puedo interpretar mensajes libres 🤖\n" +
          "Elegí una de las opciones del menú para que te ayudemos 👇"
      });

    });
}

app.post("/webhook", verifyMetaSignature, async (req, res) => {
  // [ByCodex] Recepcion durable antes del 200: pendiente de BRIEF-027.
  res.sendStatus(200);
  await Promise.all(collectIncoming(req.body).map(({ value, message }) =>
    processIncoming(value, message).catch(error => {
      console.error("Error procesando webhook:", safeError(error));
    })
  ));
});


// ======================================================
// [ByAntigravity] BRIEF-004: Endpoint /health
// ======================================================
const startedAt = Date.now();

app.get("/health", async (_req, res) => {
  try {
    const dbCheck = pool.query("SELECT 1");
    const timeout = new Promise((_, r) =>
      setTimeout(() => r(new Error("db_timeout")), 2000)
    );
    await Promise.race([dbCheck, timeout]);

    return res.json({
      ok: true,
      db: "up",
      uptime_s: Math.round((Date.now() - startedAt) / 1000)
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      db: "down",
      error: err.message
    });
  }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

// [ByAntigravity] (endurecido) Fail-closed: sin APP_SECRET en prod no arranca.
if (process.env.NODE_ENV === "production" && !process.env.APP_SECRET) {
  throw new Error(
    "APP_SECRET obligatorio en producción para validar webhooks de Meta."
  );
}

app.listen(PORT, () => {

  console.log(
    `Cecilia Tedin Bot iniciado ✅`
  );

  console.log(
    `Servidor funcionando en http://localhost:${PORT}`
  );

});
