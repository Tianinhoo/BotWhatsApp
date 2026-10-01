// [ByCodex] (BRIEF-033) Comprobacion de configuracion/BD sin envios ni secretos.
require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
async function main() {
  const checks = [];
  const add = (check, ok, detail) => checks.push({ check, ok, detail });
  add("Node 22", process.versions.node.startsWith("22."), process.version);
  for (const key of ["APP_SECRET","WHATSAPP_TOKEN","PHONE_NUMBER_ID","VERIFY_TOKEN","DATABASE_URL","DASHBOARD_PASSWORD","GRAPH_API_VERSION",
    "IMAGE_MODELO_1","IMAGE_MODELO_2","IMAGE_MODELO_3","IMAGE_OFERTA_DIA"]) {
    add(key, Boolean(process.env[key]?.trim()), process.env[key]?.trim() ? "presente; validez externa no comprobada" : "falta");
  }
  add("NODE_ENV", process.env.NODE_ENV === "production", process.env.NODE_ENV === "production" ? "production" : "usar production para la sesion publica");
  if (process.env.DATABASE_URL) {
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false },
      connectionTimeoutMillis:10000, query_timeout:10000 });
    try {
      await client.connect(); await client.query("SELECT 1"); add("PostgreSQL",true,"conexion verificada");
      const applied = new Set((await client.query("SELECT id FROM schema_migrations")).rows.map(r=>r.id));
      const missing = fs.readdirSync(path.join(__dirname,"../sql/migrations")).filter(f=>f.endsWith(".sql")&&!applied.has(f.slice(0,-4)));
      add("Migraciones",missing.length===0,missing.length ? missing.join(", ") : "al dia");
    } catch (error) { add("PostgreSQL/migraciones",false,error.code || "conexion o consulta fallida"); }
    finally { await client.end(); }
  }
  console.table(checks);
  console.log("No se comprobo Meta, validez de credenciales, webhook, imagenes ni entrega de mensajes.");
  if (checks.some(c=>!c.ok)) process.exitCode=1;
}
main().catch(()=>{console.error("No se pudo completar preflight.");process.exitCode=1;});
