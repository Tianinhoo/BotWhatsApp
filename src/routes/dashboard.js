const crypto = require("crypto");
const path = require("path");
const express = require("express");

const {
  sendTextMessage
} = require("../services/whatsapp.service");

const {
  saveMessage,
  bus,
  // [ByClaude] (Reasignado) Consumo de los "Resúmenes para Atención"
  // que se generan al derivar un cliente a asesor humano.
  getLatestHandoffSummary,
  listHandoffSummaries
} = require("../services/messages.service");

const {
  getAllProducts
} = require("../services/products.service");

// [ByOpenCode] (Reasignado) Importamos la función de state.service.js
// (creada por Claude) que reactiva el bot para un cliente en PAUSED_HUMAN.
// Se usa desde el endpoint POST .../resume que presiona la asesora.
const {
  resumeBotForClient
} = require("../services/state.service");

const pool = require("../services/db");

// [ByCodex] (BRIEF-011) Contrato común de envío y errores redactados para la asesora.
const { sendAndRecord } = require("../services/outbound.service");
const { safeError, redactPhone } = require("../services/logger.service");


const router = express.Router();

const SESSION_HOURS = 12;
const COOKIE_NAME = "admin_session";


function isEnabled() {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}


function sign(value) {
  return crypto
    .createHmac("sha256", process.env.DASHBOARD_PASSWORD || "")
    .update(value)
    .digest("hex");
}


// [ByClaude] (chequeo 2026-09-30 P2) Fix Unicode: la comparación debe ser
// sobre longitud de BUFFER, no de string. Caracteres multibyte (ej. "é" en
// UTF-8 ocupa 2 bytes aunque .length diga 1) hacían que timingSafeEqual
// recibiera buffers de longitud distinta y lanzara ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH.
function safeStrEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}


function makeToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000 })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}


function getCookie(req, name) {
  const raw = req.headers.cookie || "";

  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

    if (key === name) return value;
  }

  return null;
}


function tokenValid(token) {
  if (!token || !token.includes(".")) return false;

  const [payload, sig] = token.split(".");
  const expected = sign(payload);

  if (sig.length !== expected.length) return false;

  if (!safeStrEqual(sig, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}


function requireAdmin(req, res, next) {
  if (!isEnabled()) {
    return res.status(403).json({ error: "Dashboard deshabilitado" });
  }

  const token = getCookie(req, COOKIE_NAME);

  if (!tokenValid(token)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  next();
}


// ======================================================
// PÁGINA DEL DASHBOARD
// ======================================================

router.get("/dashboard", (req, res) => {
  if (!isEnabled()) {
    return res.status(500).send(
      "Dashboard deshabilitado. Define DASHBOARD_PASSWORD en el .env y reinicia."
    );
  }

  res.sendFile(path.join(__dirname, "..", "..", "public", "dashboard.html"));
});


// ======================================================
// LOGIN / LOGOUT
// ======================================================

// [ByAntigravity] (BRIEF-018) In-memory rate limiter para login
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const BLOCK_MS = 10 * 60 * 1000; // 10 minutos de bloqueo

function redactIp(ip) {
  if (!ip || ip === "unknown") return "unknown";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip.substring(0, 4) + "****";
}

router.post("/dashboard/login", (req, res) => {
  if (!isEnabled()) {
    return res.status(500).json({ error: "Dashboard deshabilitado" });
  }

  // [ByAntigravity] (BRIEF-018) Rate Limit
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  
  let attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.bloqueadoHasta && now < attempt.bloqueadoHasta) {
      return res.status(429).json({ error: "Demasiados intentos. Intenta más tarde." });
    }
    // [ByClaude] (chequeo 2026-09-30 P2) Fix bloqueo renovado:
    // antes el reset de ventana requería !bloqueadoHasta, pero un bloqueo
    // vencido conservaba el valor truthy y los `intentos` seguían en 5.
    // El próximo fallo subía a 6 y re-disparaba un bloqueo inmediato.
    // Resetear también cuando el bloqueo expiró.
    const windowExpired = now > attempt.ventanaInicio + WINDOW_MS;
    const blockExpired = attempt.bloqueadoHasta && now >= attempt.bloqueadoHasta;
    if (windowExpired || blockExpired) {
      attempt = { intentos: 0, ventanaInicio: now, bloqueadoHasta: null };
    }
  } else {
    attempt = { intentos: 0, ventanaInicio: now, bloqueadoHasta: null };
  }

  const password = req.body && req.body.password ? String(req.body.password) : "";
  const expected = process.env.DASHBOARD_PASSWORD || "";

  if (!safeStrEqual(password, expected)) {
    // [ByAntigravity] (BRIEF-018) Incrementar intentos
    attempt.intentos += 1;
    if (attempt.intentos >= MAX_ATTEMPTS) {
      attempt.bloqueadoHasta = now + BLOCK_MS;
      console.warn(`[ByAntigravity] (BRIEF-018) Bruteforce detectado: IP ${redactIp(ip)} bloqueada.`);
    }
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  // [ByAntigravity] (BRIEF-018) Éxito: limpiar intentos
  loginAttempts.delete(ip);

  const token = makeToken();

  // [ByAntigravity] (BRIEF-018) Cookie Secure
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secureFlag}`
  );

  res.json({ ok: true });
});


router.post("/dashboard/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );

  res.json({ ok: true });
});


// ======================================================
// SESIÓN ACTUAL
// ======================================================

router.get("/dashboard/api/me", requireAdmin, (req, res) => {
  res.json({ ok: true });
});


// ======================================================
// CONVERSACIONES (resumen por número)
// ======================================================

router.get("/dashboard/api/conversations", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          m.telefono,
          COUNT(*)::int AS total,
          (SELECT m2.contenido FROM mensajes m2
             WHERE m2.telefono = m.telefono
             ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1) AS ultimo_contenido,
          (SELECT m3.origen FROM mensajes m3
             WHERE m3.telefono = m.telefono
             ORDER BY m3.created_at DESC, m3.id DESC LIMIT 1) AS ultimo_origen,
          -- // [ByCodex] (BRIEF-011) Mostrar también fallos en la lista de conversaciones.
          (SELECT m4.estado_envio FROM mensajes m4
             WHERE m4.telefono = m.telefono
             ORDER BY m4.created_at DESC, m4.id DESC LIMIT 1) AS ultimo_estado_envio,
          MAX(m.created_at) AS ultima_fecha

        FROM mensajes m
        GROUP BY m.telefono
        ORDER BY ultima_fecha DESC
      `
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Error listando conversaciones:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ======================================================
// HILO DE UNA CONVERSACIÓN
// ======================================================

router.get("/dashboard/api/conversation/:phone", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
        -- // [ByCodex] (BRIEF-011) Estado persistido del intento, sin inferir entrega.
        SELECT telefono, origen, contenido, created_at, estado_envio
        FROM mensajes
        WHERE telefono = $1
        ORDER BY created_at ASC, id ASC
      `,
      [req.params.phone]
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Error leyendo conversación:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ======================================================
// [ByOpenCode] (Reasignado) RESUMEN PARA ATENCIÓN HUMANA
// ======================================================
//
// Cuando el cliente entra en PAUSED_HUMAN (opción 6 del menú "hablar con un
// asesor"), el bot deja de responderle y un asesor humano toma el chat.
// Para que la asesora NO tenga que releer todo el historial, construimos un
// "Resumen para Atención" con tres campos, tal como definió el equipo:
//   - Origen  : ¿vino de un anuncio de Meta o es tráfico orgánico?
//   - Modelo  : modelo seleccionado por el cliente.
//   - Interés : interés/color elegido por el cliente.
//
// FUENTE PRINCIPAL DE DATOS: la tabla "resumenes_atencion" (creada por
// Claude en sql/resumenes.sql). Cada vez que el bot deriva a humano se
// guarda allí una fila con estos campos. Si todavía NO existe una fila
// (por ejemplo, cliente pausado antes del deploy de la V1), el endpoint
// calcula un resumen de respaldo a partir de "trafico_clientes" y del
// historial de "mensajes", para nunca mostrar una tarjeta vacía.
//
// [ByClaude] (BRIEF-015) Delegamos la extracción al módulo unificado
// `summary.service.js`. Este helper conserva la forma de payload que
// consume el frontend (con `estado`, `es_pausa_humana`, `origen` con
// detalle de referral, `modelos` como array, `interes` y ahora
// `necesidad`), pero la lógica de detección es la misma que persiste
// `messages.service.js`. Sin más divergencia entre los dos builders.
const summarySvc = require("../services/summary.service");

async function buildHandoffSummary(phone) {

  // 1) ÚLTIMO RESUMEN GUARDADO (tabla "resumenes_atencion").
  const resumenRes = await pool.query(
    `
      SELECT
        origen_trafico,
        modelo_seleccionado,
        interes_color,
        necesidad,
        resumen,
        created_at
      FROM resumenes_atencion
      WHERE telefono = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [phone]
  );

  const resumenRow = resumenRes.rows[0] || null;
  const resumenJson = resumenRow?.resumen || null;


  // 2) ORIGEN DE TRÁFICO (tabla trafico_clientes).
  const origenRes = await pool.query(
    `
      SELECT telefono, origen, source_type, source_id, source_url,
             headline, body, first_referral_id
      FROM trafico_clientes
      WHERE telefono = $1
      LIMIT 1
    `,
    [phone]
  );

  const origenRow = origenRes.rows[0] || null;

  const origen = {
    // [ByOpenCode] (Reasignado) Arrancamos con el origen que guardó la
    // fila de resumen; si no la hay, usamos "trafico_clientes"; y si
    // tampoco, asumimos ORGÁNICO (misma regla que app.js).
    tipo:
      resumenRow?.origen_trafico ||
      origenRow?.origen ||
      "organico"
  };

  if (origenRow) {
    origen.source_type = origenRow.source_type || null;
    origen.source_url = origenRow.source_url || null;
    origen.headline = origenRow.headline || null;
    origen.body = origenRow.body || null;
    origen.first_referral_id = origenRow.first_referral_id || null;
  }


  // 3) ESTADO CONVERSACIONAL (clientes_whatsapp.estado_conversacion).
  const estadoRes = await pool.query(
    `
      SELECT estado_conversacion
      FROM clientes_whatsapp
      WHERE telefono = $1
      LIMIT 1
    `,
    [phone]
  );

  const estado = estadoRes.rows[0]?.estado_conversacion || "ORGANIC";


  // 4) HISTORIAL COMPLETO del cliente (todos los mensajes, en orden).
  const histRes = await pool.query(
    `
      SELECT origen, contenido
      FROM mensajes
      WHERE telefono = $1
      ORDER BY created_at ASC, id ASC
    `,
    [phone]
  );

  const clientMessages = histRes.rows.filter((m) => m.origen === "cliente");


  // 5) [ByClaude] (BRIEF-015 + BRIEF-017) Extracción unificada. La lógica
  //    vive en summary.service.js — mismos criterios que persiste
  //    messages.service.saveHandoffSummary.
  const extracted = summarySvc.buildFromContext({
    phone,
    traffic: origenRow,
    clientMessages,
    reason: null
  });

  // Modelos: mantenemos el contrato del frontend (array) pero ahora sale
  // del extractor unificado. Si el resumen guardado tiene otro modelo
  // (histórico), lo agregamos también.
  const modelosFuente = new Set();
  if (extracted.modelo_seleccionado) modelosFuente.add(extracted.modelo_seleccionado);
  if (resumenRow?.modelo_seleccionado) modelosFuente.add(resumenRow.modelo_seleccionado);

  // Interés: preferimos el guardado (histórico auditable). Si NO es un
  // label de menú crudo tipo "6" o el brackets-only, lo usamos; si no,
  // preferimos el recién extraído (que filtra ese ruido). Con esto se
  // corrige el bug del "6" como interés reportado en la revisión.
  const savedInteres = resumenRow?.interes_color || null;
  const looksBad = savedInteres && (
    /^\s*\d+\s*$/.test(savedInteres) ||           // solo un número tipo "6"
    summarySvc.BRACKET_ONLY_RX.test(savedInteres) // marca de sistema
  );
  const interes = (savedInteres && !looksBad) ? savedInteres : extracted.interes_color;

  // Necesidad: preferimos la persistida; si no hay, la recién extraída.
  const necesidad = resumenRow?.necesidad || extracted.necesidad || "Por confirmar";


  return {
    // [ByOpenCode] (Reasignado) + [ByClaude] (BRIEF-015 + BRIEF-017)
    // Datos que consume el frontend.
    telefono: phone,
    estado,
    es_pausa_humana: estado === "PAUSED_HUMAN",
    origen,
    modelos: [...modelosFuente],
    interes,
    necesidad,
    resumen: resumenJson,
    resumen_fecha: resumenRow?.created_at || null
  };
}


// [ByOpenCode] (Reasignado) Endpoint del resumen de un cliente.
// GET /dashboard/api/conversation/:phone/handoff-summary
// Lo llama la asesora al abrir un chat; si el cliente está en
// PAUSED_HUMAN el frontend muestra la tarjeta fijada con estos datos.
router.get(
  "/dashboard/api/conversation/:phone/handoff-summary",
  requireAdmin,
  async (req, res) => {
    try {
      const summary = await buildHandoffSummary(req.params.phone);
      res.json(summary);

    } catch (error) {
      console.error(
        "[ByOpenCode] Error armando resumen para atención:",
        error.message
      );
      res.status(500).json({ error: error.message });
    }
  }
);


// [ByOpenCode] (Reasignado) Reanuda el bot para un cliente en PAUSED_HUMAN.
// POST /dashboard/api/conversation/:phone/resume
// Usa resumeBotForClient() de state.service.js (Creada por Claude): devuelve
// al cliente al estado MENU para que el árbol conversacional siga actuando.
// Lo presiona la asesora desde la tarjeta de resumen al terminar de atender.
router.post(
  "/dashboard/api/conversation/:phone/resume",
  requireAdmin,
  async (req, res) => {
    try {
      await resumeBotForClient(req.params.phone);
      res.json({ ok: true });

    } catch (error) {
      console.error(
        "[ByOpenCode] Error reanudando bot:",
        error.message
      );
      res.status(500).json({ error: error.message });
    }
  }
);


// ======================================================
// RESPONDERLE AL CLIENTE DESDE EL DASHBOARD
// ======================================================

router.post(
  "/dashboard/api/conversation/:phone/reply",
  requireAdmin,
  async (req, res) => {
    const text = req.body && req.body.text ? String(req.body.text).trim() : "";

    if (!text) {
      return res.status(400).json({ error: "Escribe un mensaje" });
    }

    try {

      // [ByCodex] (BRIEF-011) El rechazo queda registrado y retorna 502, nunca ok=true.
      await sendAndRecord(req.params.phone, text, () => sendTextMessage(req.params.phone, text));

      res.json({ ok: true, estado_envio: "enviado" });

    } catch (error) {
      // [ByCodex] (BRIEF-011) Solo errores públicos conocidos; no devolver respuestas crudas de Meta.
      console.error(`Error enviando respuesta a ${redactPhone(req.params.phone)}:`, safeError(error));
      const sendFailed = error.code === "WHATSAPP_SEND_FAILED";
      res.status(sendFailed ? 502 : 500).json({
        error: sendFailed || error.code === "OUTBOUND_HISTORY_FAILED"
          ? error.message : "No se pudo completar el envío.",
        estado_envio: error.estado_envio || null
      });
    }
  }
);


// ======================================================
// ESTADO DE CATÁLOGO POR CLIENTE
// ======================================================

router.get("/dashboard/api/catalog", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT telefono, catalogo_enviado, fecha_catalogo, created_at, updated_at
        FROM clientes_whatsapp
        ORDER BY updated_at DESC
      `
    );

    res.json(result.rows);

  } catch (error) {
    console.error("Error leyendo catálogo:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ======================================================
// PRODUCTOS Y STOCK
// ======================================================

router.get("/dashboard/api/products", requireAdmin, async (req, res) => {
  try {
    const rows = await getAllProducts();
    res.json(rows);

  } catch (error) {
    console.error("Error leyendo productos:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ======================================================
// [ByClaude] (Reasignado) RESÚMENES PARA ATENCIÓN (handoff a humano)
// ======================================================
// [ByClaude] (Reasignado) Devuelve el ÚLTIMO resumen guardado para un
// cliente. La UI del dashboard lo llama al abrir una conversación en
// PAUSED_HUMAN para mostrar el JSON del "Resumen para Atención".
router.get(
  "/dashboard/api/handoff/:phone",
  requireAdmin,
  async (req, res) => {
    try {

      const summary = await getLatestHandoffSummary(req.params.phone);

      if (!summary) {
        return res.status(404).json({
          error: "Este cliente no tiene resumen de atención guardado."
        });
      }

      res.json(summary);

    } catch (error) {
      console.error(
        "[ByClaude] (Reasignado) Error leyendo resumen de atención:",
        error.message
      );
      res.status(500).json({ error: error.message });
    }
  }
);


// [ByClaude] (Reasignado) Endpoint para REACTIVAR el bot para un cliente
// que estaba en PAUSED_HUMAN. Lo dispara la asesora cuando termina la
// atención humana y quiere que el árbol V1 vuelva a manejar al cliente.
// Vuelve al estado MENU (definido por state.service.js).
router.post(
  "/dashboard/api/handoff/:phone/resume",
  requireAdmin,
  async (req, res) => {
    try {

      await resumeBotForClient(req.params.phone);
      res.json({ ok: true });

    } catch (error) {
      console.error(
        "[ByClaude] (Reasignado) Error reactivando el bot:",
        error.message
      );
      res.status(500).json({ error: error.message });
    }
  }
);


// [ByClaude] (Reasignado) Lista todos los resúmenes generados (histórico
// de derivaciones a humano). El dashboard la usa para el panel "Atención
// Humana Pendiente" y para reportería del piloto V1.
router.get(
  "/dashboard/api/handoffs",
  requireAdmin,
  async (req, res) => {
    try {

      const limitRaw = req.query.limit ? Number(req.query.limit) : 50;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500
          ? Math.floor(limitRaw)
          : 50;

      const rows = await listHandoffSummaries({ limit });

      res.json(rows);

    } catch (error) {
      console.error(
        "[ByClaude] (Reasignado) Error listando resúmenes de atención:",
        error.message
      );
      res.status(500).json({ error: error.message });
    }
  }
);


// ======================================================
// EVENTOS EN TIEMPO REAL (SSE — sin websockets)
// ======================================================

router.get("/dashboard/api/events", requireAdmin, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.flushHeaders();

  res.write(": connected\n\n");

  const messageListener = (data) => {
    res.write(`data: ${JSON.stringify({ type: "message", data })}\n\n`);
  };

  // [ByClaude] (Reasignado) Nuevo listener para el evento "handoff":
  // el dashboard puede reaccionar en tiempo real cuando el bot deriva
  // un cliente a asesor humano y guarda su Resumen para Atención.
  const handoffListener = (data) => {
    res.write(`data: ${JSON.stringify({ type: "handoff", data })}\n\n`);
  };

  bus.on("message", messageListener);
  bus.on("handoff", handoffListener);

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25000);

  res.on("close", () => {
    clearInterval(heartbeat);
    bus.off("message", messageListener);
    bus.off("handoff", handoffListener);
  });
});


module.exports = router;
