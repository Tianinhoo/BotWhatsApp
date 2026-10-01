// [ByClaude] Migrador de esquema con tracking en schema_migrations.
//
// Reemplaza el flujo "corré init-db.js y aplicá todo cada vez" por uno
// versionado: mantiene una tabla `schema_migrations` con el id de cada
// archivo aplicado, lee `sql/migrations/` ordenado alfabéticamente, y
// aplica solo los archivos cuyo id no esté registrado.
//
// Reglas:
//   - Cada migración se llama NNN_nombre-corto.sql (id = "NNN_nombre-corto").
//   - Las migraciones son INMUTABLES una vez aplicadas en producción.
//     Si hay que corregir algo, se agrega una migración nueva.
//   - Cada migración corre dentro de una transacción; si falla, ROLLBACK
//     completo y el proceso sale con exit code 1 (Railway aborta el deploy).
//
// Uso:
//   node scripts/migrate.js
//   (o mejor: npm run db:migrate)
//
// Railway: apuntar Pre-Deploy Command a `npm run db:migrate`.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../src/services/db");


// [ByClaude] Crea la tabla de tracking si no existe. Es idempotente y
// segura de correr en cada arranque.
async function ensureRegistry() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}


// [ByClaude] Devuelve el set de ids ya aplicados para saltearlos.
async function loadAppliedIds() {
  const result = await pool.query(`SELECT id FROM schema_migrations`);
  return new Set(result.rows.map((row) => row.id));
}


// [ByClaude] Lista los archivos .sql de sql/migrations/ ordenados por
// nombre. Como los archivos empiezan por NNN_, el sort alfabético
// coincide con el orden numérico deseado (siempre que sean 3 dígitos).
function loadMigrationFiles() {
  const dir = path.join(__dirname, "..", "sql", "migrations");

  if (!fs.existsSync(dir)) {
    throw new Error(`No existe la carpeta de migraciones: ${dir}`);
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}


// [ByClaude] Aplica una migración dentro de una transacción. Cualquier
// error dispara ROLLBACK y se propaga hacia arriba para que main() aborte.
async function applyMigration(fileName) {
  const id = path.basename(fileName, ".sql");
  const filePath = path.join(__dirname, "..", "sql", "migrations", fileName);
  const sql = fs.readFileSync(filePath, "utf8");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (id) VALUES ($1)`,
      [id]
    );
    await client.query("COMMIT");
    console.log(`  ${id} ✅`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  ${id} ❌  ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}


// [ByClaude] Orquestador. Loguea qué se aplicó, qué se salteó, y sale con
// exit code 1 si algo falla (importante para Pre-Deploy Command de Railway).
async function main() {
  console.log("Migrador de esquema — Cecilia Tedin Bot\n");

  await ensureRegistry();
  const applied = await loadAppliedIds();
  const files = loadMigrationFiles();

  if (files.length === 0) {
    console.log("No hay archivos en sql/migrations/. Nada por hacer.");
    return;
  }

  let pendientes = 0;

  for (const file of files) {
    const id = path.basename(file, ".sql");

    if (applied.has(id)) {
      console.log(`- ${id} ya aplicada, salteo.`);
      continue;
    }

    console.log(`+ aplicando ${id}...`);
    await applyMigration(file);
    pendientes++;
  }

  if (pendientes === 0) {
    console.log("\nBase de datos al día ✅ (nada nuevo por aplicar).");
  } else {
    console.log(`\nBase de datos al día ✅ (${pendientes} nueva(s) aplicada(s)).`);
  }
}


main()
  .catch((error) => {
    console.error("\nERROR en la migración:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
