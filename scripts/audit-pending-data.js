// [ByCodex] Auditoría de datos pendientes: exclusivamente consultas SELECT.
async function findPendingData(pool) {
  // [ByClaude] Revisión: también listar productos sin ninguna talla/color cargado.
  const [productos, variaciones, sinVariaciones] = await Promise.all([
    pool.query(`
      SELECT id, nombre, precio
      FROM productos
      WHERE precio <= 0 OR precio IS NULL
      ORDER BY id
    `),
    pool.query(`
      SELECT p.nombre AS producto, v.talla, v.color, v.stock
      FROM producto_variaciones v
      JOIN productos p ON p.id = v.producto_id
      WHERE v.stock = 0 OR v.stock IS NULL
      ORDER BY p.id, v.id
    `),
    pool.query(`
      SELECT p.id, p.nombre
      FROM productos p
      WHERE NOT EXISTS (SELECT 1 FROM producto_variaciones v WHERE v.producto_id = p.id)
      ORDER BY p.id
    `)
  ]);

  return {
    productos: productos.rows,
    variaciones: variaciones.rows,
    sinVariaciones: sinVariaciones?.rows || []
  };
}

function formatTable(headers, rows) {
  const cells = [headers, ...rows].map(row => row.map(value =>
    String(value ?? "Por confirmar").replace(/\s+/g, " ")
  ));
  const widths = headers.map((_, index) =>
    Math.max(...cells.map(row => row[index].length))
  );
  const line = row => row.map((cell, index) => cell.padEnd(widths[index])).join(" | ");
  return [line(cells[0]), widths.map(width => "-".repeat(width)).join("-+-"),
    ...cells.slice(1).map(line)].join("\n");
}

function formatReport({ productos, variaciones, sinVariaciones = [] }) {
  if (productos.length === 0 && variaciones.length === 0 && sinVariaciones.length === 0) {
    return "Sin datos pendientes";
  }

  const sections = [];
  if (productos.length > 0) {
    sections.push(`Productos con precio por confirmar (${productos.length})\n` +
      formatTable(["ID", "Nombre", "Precio"],
        productos.map(({ id, nombre, precio }) => [id, nombre, precio])));
  }
  if (variaciones.length > 0) {
    sections.push(`Variaciones con stock por confirmar (${variaciones.length})\n` +
      formatTable(["Producto", "Talla", "Color", "Stock"],
        variaciones.map(({ producto, talla, color, stock }) => [producto, talla, color, stock])));
  }
  if (sinVariaciones.length > 0) {
    sections.push(`Productos sin tallas/colores cargados (${sinVariaciones.length})\n` +
      formatTable(["ID", "Nombre"], sinVariaciones.map(({ id, nombre }) => [id, nombre])));
  }
  return sections.join("\n\n");
}

module.exports = { findPendingData, formatReport };

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  const pool = require("../src/services/db");
  (async () => {
    try {
      console.log(formatReport(await findPendingData(pool)));
    } finally {
      await pool.end();
    }
  })().catch(error => {
    console.error("No se pudo completar la auditoría:", error.code || "ERROR");
    process.exitCode = 1;
  });
}
