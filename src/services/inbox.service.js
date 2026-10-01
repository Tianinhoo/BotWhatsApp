// [ByCodex] (BRIEF-027) Recepcion durable y recuperacion conservadora, una instancia.
const { setInterval } = require("node:timers");
const { processInOrder } = require("./queue.service");
const { safeError } = require("./logger.service");
function createInbox(pool, { enqueue = processInOrder, every = setInterval, log = console.error } = {}) {
  let storeTail = Promise.resolve(), init, handler, timer, recovery;
  function initialize() {
    if (!init) {
      init = pool.query("UPDATE mensajes_recibidos SET estado='revision', error_code='RESTART_UNCERTAIN', actualizado_en=now() WHERE estado='procesando'")
        .catch(error => { init = null; throw error; });
    }
    return init;
  }
  async function run(wamid, phone) {
    const result = await pool.query(`
      UPDATE mensajes_recibidos AS m SET estado='procesando', actualizado_en=now()
      WHERE wamid=$1 AND telefono=$2 AND estado='recibido'
        AND NOT EXISTS (SELECT 1 FROM mensajes_recibidos prev
          WHERE prev.telefono=m.telefono AND prev.id<m.id
            AND prev.estado IN ('recibido','procesando','revision'))
      RETURNING payload`, [wamid, phone]);
    if (!result.rows.length) return;
    try {
      const { message, value } = result.rows[0].payload;
      await handler(value, message);
      await pool.query("UPDATE mensajes_recibidos SET estado='completado', actualizado_en=now() WHERE wamid=$1 AND estado='procesando'", [wamid]);
    } catch (error) {
      const code = ["WHATSAPP_SEND_FAILED", "OUTBOUND_HISTORY_FAILED"].includes(error.code) ? error.code : "PROCESSING_FAILED";
      // Si falla esta escritura queda procesando: bloquea sucesores y se revisa al reiniciar.
      await pool.query("UPDATE mensajes_recibidos SET estado='revision', error_code=$2, actualizado_en=now() WHERE wamid=$1 AND estado='procesando'", [wamid, code]);
      throw error;
    }
  }
  function schedule(wamid, phone, barrier = Promise.resolve()) {
    return enqueue(phone, async () => { await barrier; return run(wamid, phone); })
      .catch(error => log("Error procesando webhook:", safeError(error)));
  }
  async function persist(items) {
    await initialize();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const { message, value } of items) {
        const payload = { message, value: { contacts: Array.isArray(value?.contacts)
          ? value.contacts.filter(c => c?.wa_id === message.from) : [] } };
        await client.query(`INSERT INTO mensajes_recibidos (wamid,telefono,payload)
          VALUES ($1,$2,$3::jsonb) ON CONFLICT (wamid) DO NOTHING`,
          [message.id, message.from, JSON.stringify(payload)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
  async function receive(items) {
    for (const { message } of items) {
      if (typeof message.id !== "string" || !message.id || typeof message.from !== "string" || !message.from) {
        const error = new Error("Mensaje sin identificador o telefono"); error.code = "INVALID_INBOUND"; throw error;
      }
    }
    if (!items.length) return { done: Promise.resolve() };
    // Ordenar las transacciones de recepcion; los envios de distintos clientes son paralelos.
    const stored = storeTail.then(() => persist(items));
    storeTail = stored.catch(() => {});
    const done = Promise.all(items.map(({ message }) => schedule(message.id, message.from, stored)));
    await stored; // Solo despues de COMMIT se puede responder HTTP 200.
    return { done };
  }
  function recover() {
    if (recovery) return recovery;
    recovery = (async () => {
    try {
      await initialize();
      // No responder automaticamente mensajes viejos en otro contexto de conversacion.
      await pool.query("UPDATE mensajes_recibidos SET estado='revision', error_code='STALE_RECEIPT', actualizado_en=now() WHERE estado='recibido' AND recibido_en < now() - interval '10 minutes'");
      const { rows } = await pool.query("SELECT wamid,telefono FROM mensajes_recibidos AS m WHERE estado='recibido' AND NOT EXISTS (SELECT 1 FROM mensajes_recibidos prev WHERE prev.telefono=m.telefono AND prev.id<m.id AND prev.estado IN ('recibido','procesando','revision')) ORDER BY id LIMIT 100");
      await Promise.all(rows.map(row => schedule(row.wamid, row.telefono)));
    } finally { recovery = null; }
    })();
    return recovery;
  }
  function start(processMessage) {
    handler = processMessage;
    if (!timer) {
      const tick = () => { void recover().catch(error => log("[inbox] recovery:", safeError(error))); };
      timer = every(tick, 5000); timer.unref?.();
      tick();
    }
  }
  return { start, receive, recover };
}
module.exports = { createInbox };
