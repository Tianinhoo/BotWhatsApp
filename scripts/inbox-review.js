// [ByCodex] (BRIEF-027) Operacion explicita; nunca reenvia mensajes.
require("dotenv").config({ quiet: true });
const { Client } = require("pg");
const { redactPhone, safeError } = require("../src/services/logger.service");
async function main() {
  const args = process.argv.slice(2);
  const resolveIndex = args.indexOf("--resolve");
  if (args.length && (resolveIndex !== 0 || !args[1] || args[2] !== "--confirm-reviewed" || args.length !== 3)) {
    throw new Error("Uso: node scripts/inbox-review.js [--resolve WAMID --confirm-reviewed]");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  try {
    await client.connect();
    if (resolveIndex === 0) {
      const { rowCount } = await client.query(
        "UPDATE mensajes_recibidos SET estado='resuelto', actualizado_en=now() WHERE wamid=$1 AND estado='revision'", [args[1]]);
      if (rowCount !== 1) throw new Error("No existe ese caso pendiente de revision.");
      console.log("Caso resuelto sin reenvio. Los mensajes posteriores pueden continuar.");
    } else {
      const { rows } = await client.query(
        "SELECT wamid,telefono,estado,error_code,recibido_en FROM mensajes_recibidos WHERE estado IN ('recibido','procesando','revision') ORDER BY id LIMIT 100");
      console.table(rows.map(r => ({ ...r, telefono: redactPhone(r.telefono) })));
      console.log("Para resolver un caso: revisar primero la conversacion y atender al cliente.");
      console.log("Luego: node scripts/inbox-review.js --resolve WAMID --confirm-reviewed");
    }
  } finally { await client.end(); }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
