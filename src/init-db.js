require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("./services/db");

async function main() {
  try {
    const sqlDir = path.join(__dirname, "..", "sql");

    // [ByOpenCode] Se agregó "trafico.sql" al listado: crea la tabla
    // "trafico_clientes" usada por state.service.js (Piloto V1).
    // [ByClaude] Se agregó "estados.sql": añade la columna
    // "estado_conversacion" a "clientes_whatsapp" para el árbol V1.
    // [ByClaude] (Reasignado) Se agregó "resumenes.sql": crea la tabla
    // "resumenes_atencion" con el JSON del Resumen para Atención que se
    // genera cada vez que un cliente pasa a PAUSED_HUMAN.
    for (const file of [
      "schema.sql",
      "seed.sql",
      "trafico.sql",
      "estados.sql",
      "resumenes.sql"
    ]) {
      const filePath = path.join(sqlDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      console.log(`Ejecutando ${file}...`);
      await pool.query(sql);
      console.log(`${file} ✅`);
    }

    console.log("\nBase de datos lista ✅");

    const productos = await pool.query(
      "SELECT id, nombre, precio, disponible FROM productos ORDER BY id"
    );
    console.log("\nProductos actuales:");
    console.table(productos.rows);

  } catch (error) {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();