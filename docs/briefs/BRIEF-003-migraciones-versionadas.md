# BRIEF-003 — Migraciones versionadas + `scripts/migrate.js`

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** ninguna

## Objetivo

Migrar los `sql/*.sql` sueltos a un esquema **versionado con tracking**
para que en producción sepamos qué migraciones se aplicaron y podamos
correr sólo las nuevas.

## Contexto

Hoy `init-db.js` ejecuta cada archivo del array `["schema.sql", "seed.sql", ...]`
completo, cada vez. Funciona porque los DDL usan `CREATE TABLE IF NOT
EXISTS` y `ALTER TABLE ... IF NOT EXISTS`, pero:

- No hay historial de qué se aplicó cuándo.
- Al agregar la 6ta migración (BRIEF-002), el archivo `init-db.js` empieza
  a crecer sin control.
- No podemos hacer rollback selectivo.
- Railway tiene un **Pre-Deploy Command** que le podemos apuntar a
  `npm run db:migrate`; si falla, el deploy no arranca.

## Alcance

**SÍ:**
- Crear `sql/migrations/` y mover los SQL con nombres numerados.
- Crear `scripts/migrate.js` con tracking en tabla `schema_migrations`.
- Agregar `db:migrate` a `package.json`.
- Actualizar `README` mínimo del proyecto (o crear `docs/DEPLOY.md`) explicando el flujo.

**NO:**
- Rollback (down migrations). V1 solo forward.
- Cambiar el contenido de los SQL existentes (solo se renombran + mueven).
- Tocar `init-db.js` en esta ronda; se puede mantener como alias por ahora
  y deprecarlo en un brief posterior.

## Aceptación

- [ ] `sql/migrations/` existe con los archivos numerados:
  - `001_schema.sql` (era `schema.sql`)
  - `002_seed.sql` (era `seed.sql`)
  - `003_trafico.sql` (era `trafico.sql`)
  - `004_estados.sql` (era `estados.sql`)
  - `005_resumenes.sql` (era `resumenes.sql`)
- [ ] `scripts/migrate.js` existe y:
  - Crea `schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` si no está.
  - Lee `sql/migrations/` ordenado alfabéticamente.
  - Para cada archivo, chequea si su `id` (nombre sin extensión) ya está aplicado; si no, ejecuta en transacción e inserta el registro.
  - Loguea qué aplicó y qué salteó.
- [ ] `package.json` tiene `"db:migrate": "node scripts/migrate.js"`.
- [ ] Correr `npm run db:migrate` sobre la Neon local aplica todo lo pendiente y sale limpio; correrlo de nuevo dice "nada por aplicar".
- [ ] Todos los bloques nuevos firman `// [ByClaude]`.

## Notas técnicas

**Esqueleto de `scripts/migrate.js`:**

```js
// [ByClaude] Migrador simple con tracking en schema_migrations.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../src/services/db");

async function ensureRegistry() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedIds() {
  const r = await pool.query(`SELECT id FROM schema_migrations`);
  return new Set(r.rows.map((row) => row.id));
}

async function main() {
  await ensureRegistry();
  const applied = await appliedIds();

  const dir = path.join(__dirname, "..", "sql", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const id = path.basename(file, ".sql");
    if (applied.has(id)) {
      console.log(`- ${id} ya aplicada, salteo.`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`+ aplicando ${id}...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
      await client.query("COMMIT");
      console.log(`  ${id} ✅`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ${id} ❌`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migraciones al día ✅");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

**Regla que se propone:** las migraciones **son inmutables** una vez
aplicadas en producción. Si hay que cambiar algo, se agrega una nueva.

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
- 2026-09-19 — Claude implementó `sql/migrations/001..005_*.sql` (copias
  de los SQL existentes con nombre numerado), `scripts/migrate.js` con
  tracking en `schema_migrations`, y agregó `db:migrate` a `package.json`.
  Probado contra Neon: primera corrida aplicó las 5, segunda dijo "nada nuevo".
  Todos los criterios de aceptación cumplidos. Cerrado.
