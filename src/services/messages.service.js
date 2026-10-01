const { EventEmitter } = require("events");

const pool = require("./db");

// [ByOpenCode] (BRIEF-006) Redacción de teléfonos en logs.
const { redactPhone } = require("./logger.service");

// Bus de eventos en memoria. El dashboard se SUSCRIBE a "message"
// para actualizarse en tiempo real sin websockets (SSE).
const bus = new EventEmitter();


// ======================================================
// GUARDAR UN MENSAJE EN EL HISTORIAL
// ======================================================

// [ByCodex] (BRIEF-011) Estado opcional: NULL para entradas y registros históricos sin evidencia.
async function saveMessage(telefono, origen, contenido, { estado_envio = null } = {}) {
  await pool.query(
    `
      INSERT INTO mensajes (telefono, origen, contenido, estado_envio)
      VALUES ($1, $2, $3, $4)
    `,
    [telefono, origen, contenido, estado_envio]
  );

  bus.emit("message", {
    telefono,
    origen,
    contenido,
    estado_envio,
    created_at: new Date()
  });
}


// ======================================================
// TRAER LOS ÚLTIMOS MENSAJES DE UN CLIENTE
// ======================================================

async function getLastMessages(telefono, limit = 10) {
  const result = await pool.query(
    `
      SELECT origen, contenido
      FROM mensajes
      WHERE telefono = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [telefono, limit]
  );

  return result.rows.reverse();
}


// ======================================================
// [ByClaude] (Reasignado) TRAER SOLO MENSAJES DEL CLIENTE
// ======================================================
// [ByClaude] (Reasignado) Versión especializada de getLastMessages que
// filtra por origen = 'cliente'. La usa el builder del Resumen para
// Atención para escanear qué modelo/color mencionó el cliente sin
// contaminarse con las respuestas del bot.
async function getLastClientMessages(telefono, limit = 20) {
  const result = await pool.query(
    `
      SELECT contenido, created_at
      FROM mensajes
      WHERE telefono = $1
        AND origen = 'cliente'
        AND contenido IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [telefono, limit]
  );

  return result.rows.reverse();
}


// ======================================================
// [ByClaude] (BRIEF-015 + BRIEF-017) DETECCIÓN Y RESUMEN
// ======================================================
// [ByClaude] (BRIEF-015) La lógica de detección de modelo/color/interés
// se movió a `summary.service.js` como fuente única de verdad. Este
// módulo la reexporta para retro-compatibilidad y provee la firma
// asíncrona que hace la query al historial + delega al builder.
const summarySvc = require("./summary.service");

// [ByClaude] (BRIEF-015) Reexports para no romper llamadores existentes.
const { detectModel, detectColor } = summarySvc;


// [ByClaude] (BRIEF-015 + BRIEF-017) Trae el historial del cliente y
// delega al `summary.service.buildFromContext` — así todo el resumen
// (persistencia acá + on-demand en dashboard.js) tiene la misma lógica.
async function buildHandoffSummary(phone, traffic, reason = null) {
  const clientMessages = await getLastClientMessages(phone, 20);
  return summarySvc.buildFromContext({
    phone,
    traffic,
    clientMessages,
    reason
  });
}


// ======================================================
// [ByClaude] (Reasignado) PERSISTIR EL RESUMEN
// ======================================================
// [ByClaude] (Reasignado) Guarda una fila en "resumenes_atencion" con:
//   - Los tres campos denormalizados (origen, modelo, interés/color)
//     para poder listar/filtrar rápido en el dashboard.
//   - El JSON completo del resumen (JSONB), para que el frontend pueda
//     mostrar todos los detalles sin pegarse otro round-trip.
//
// Emite un evento "handoff" en el bus para que el dashboard (SSE) pueda
// enterarse en tiempo real y notificar a la asesora humana.
async function saveHandoffSummary(summary) {

  // [ByClaude] (BRIEF-017) Persistimos también la columna `necesidad`
  // agregada por la migración 007_necesidad.sql. En el JSONB va el objeto
  // completo (incluye necesidad, motivo, origen_detalle, timestamp).
  const result = await pool.query(
    `
      INSERT INTO resumenes_atencion (
        telefono,
        origen_trafico,
        modelo_seleccionado,
        interes_color,
        necesidad,
        resumen
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `,
    [
      summary.telefono,
      summary.origen_trafico,
      summary.modelo_seleccionado,
      summary.interes_color,
      summary.necesidad || "Por confirmar",
      JSON.stringify(summary)
    ]
  );

  const saved = {
    id: result.rows[0].id,
    created_at: result.rows[0].created_at,
    ...summary
  };

  // [ByClaude] (Reasignado) Notificamos al bus para que el dashboard
  // (SSE) muestre inmediatamente la nueva derivación a humano.
  bus.emit("handoff", saved);

  // [ByOpenCode] (BRIEF-006) REDACT teléfono. El interés se DROPpea:
// cuando no hay detección automática cae al último mensaje crudo del
// cliente (potencial PII); solo se loguea el modelo detectado.
  console.log(
    `[ByClaude] (Reasignado) Resumen para Atención guardado para ${redactPhone(summary.telefono)} ` +
    `— modelo=${summary.modelo_seleccionado || "N/A"}`
  );

  return saved;
}


// ======================================================
// [ByClaude] (Reasignado) LEER EL ÚLTIMO RESUMEN DE UN CLIENTE
// ======================================================
// [ByClaude] (Reasignado) Devuelve el resumen más reciente guardado para
// un teléfono (o null si el cliente nunca fue derivado a humano).
// Reconstruye el objeto completo desde la columna JSONB para simplificar
// el consumo en el dashboard.
async function getLatestHandoffSummary(telefono) {

  const result = await pool.query(
    `
      SELECT id, telefono, resumen, created_at
      FROM resumenes_atencion
      WHERE telefono = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [String(telefono)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  return {
    id: row.id,
    created_at: row.created_at,
    ...row.resumen
  };
}


// ======================================================
// [ByClaude] (Reasignado) LISTAR TODOS LOS RESÚMENES
// ======================================================
// [ByClaude] (Reasignado) Devuelve la lista de los últimos resúmenes
// (uno por derivación, no por cliente). El dashboard la usa para el
// panel "Atención Humana Pendiente".
async function listHandoffSummaries({ limit = 50 } = {}) {

  // [ByClaude] (BRIEF-017) Ahora expone también `necesidad`.
  const result = await pool.query(
    `
      SELECT id, telefono, origen_trafico, modelo_seleccionado,
             interes_color, necesidad, resumen, created_at
      FROM resumenes_atencion
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    telefono: row.telefono,
    origen_trafico: row.origen_trafico,
    modelo_seleccionado: row.modelo_seleccionado,
    interes_color: row.interes_color,
    necesidad: row.necesidad,
    created_at: row.created_at,
    resumen: row.resumen
  }));
}


module.exports = {
  bus,
  saveMessage,
  getLastMessages,

  // [ByClaude] (Reasignado) Handoff a humano — Resumen para Atención.
  getLastClientMessages,
  buildHandoffSummary,
  saveHandoffSummary,
  getLatestHandoffSummary,
  listHandoffSummaries,

  // [ByClaude] (BRIEF-015) Reexports de summary.service para retro-compat.
  detectModel,
  detectColor
};
