// [ByCodex] (BRIEF-027) Almacen en memoria para ejecutar el inbox y la cola reales.
const { createInbox } = require("../../src/services/inbox.service");
function memoryInbox({ beforePersist, failPersist = false, log = () => {}, every = () => ({ unref() {} }) } = {}) {
  const records = new Map(), queries = [];
  let seq = 0;
  async function query(sql, args = []) {
    queries.push(sql);
    if (sql.includes("RESTART_UNCERTAIN")) {
      for (const row of records.values()) if (row.estado === "procesando") row.estado = "revision";
      return { rows: [] };
    }
    if (sql.includes("STALE_RECEIPT")) {
      for (const row of records.values()) if (row.stale && row.estado === "recibido") row.estado = "revision";
      return { rows: [] };
    }
    if (sql.startsWith("SELECT wamid,telefono")) return { rows: [...records.values()].filter(r => r.estado === "recibido" && ![...records.values()].some(p => p.telefono === r.telefono && p.id < r.id && ["recibido","procesando","revision"].includes(p.estado))).sort((a,b) => a.id-b.id).slice(0,100) };
    const row = records.get(args[0]);
    if (sql.includes("RETURNING payload")) {
      if (!row || row.telefono !== args[1] || row.estado !== "recibido" ||
          [...records.values()].some(r => r.telefono === row.telefono && r.id < row.id && ["recibido","procesando","revision"].includes(r.estado))) return { rows: [] };
      row.estado = "procesando";
      return { rows: [{ payload: row.payload }] };
    }
    if (sql.includes("estado='completado'")) { row.estado = "completado"; return { rows: [] }; }
    if (sql.includes("estado='revision'")) { row.estado = "revision"; row.error_code = args[1]; return { rows: [] }; }
    throw new Error("SQL no simulado: " + sql);
  }
  const pool = { query, async connect() {
    const pending = [];
    return { release() {}, async query(sql, args = []) {
      queries.push(sql);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql === "COMMIT") {
        if (beforePersist) await beforePersist();
        if (failPersist) throw new Error("commit unavailable");
        for (const args of pending) if (!records.has(args[0])) records.set(args[0], {
          id: ++seq, wamid: args[0], telefono: args[1], payload: JSON.parse(args[2]), estado: "recibido"
        });
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO mensajes_recibidos")) { pending.push(args); return { rows: [] }; }
      throw new Error("SQL transaccion no simulado: " + sql);
    } };
  } };
  const inbox = createInbox(pool, { log, every });
  return { ...inbox, records, queries, pool };
}
module.exports = { memoryInbox };
