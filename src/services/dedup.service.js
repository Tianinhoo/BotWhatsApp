// [ByCodex] (BRIEF-002: reserva atómica de mensajes entrantes por wamid).
const pool = require("./db");

// Una única inserción decide el ganador incluso entre procesos concurrentes.
// Solo el conflicto de wamid es un duplicado; los demás errores se propagan.
// La reserva antecede al procesamiento: no certifica que este haya terminado.
async function tryClaimMessage(wamid, phone) {
  const result = await pool.query(
    `INSERT INTO mensajes_procesados (wamid, telefono)
     VALUES ($1, $2)
     ON CONFLICT (wamid) DO NOTHING`,
    [wamid, phone]
  );

  return result.rowCount === 1;
}

module.exports = { tryClaimMessage };
