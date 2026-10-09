// [ByCodex] Reporte y consultas de auditoría con BD simulada, sin red.
const test = require("node:test");
const assert = require("node:assert/strict");
const { findPendingData, formatReport } = require("../scripts/audit-pending-data");

test("formatReport sin pendientes imprime Sin datos pendientes", () => {
  assert.equal(formatReport({ productos: [], variaciones: [] }), "Sin datos pendientes");
});

test("formatReport muestra tablas de productos y variaciones con cero y null", () => {
  const report = formatReport({
    productos: [{ id: 11, nombre: "Modelo 1", precio: "0.00" },
      { id: 12, nombre: "Modelo 2", precio: null },
      { id: 13, nombre: "Oferta", precio: -10 }],
    variaciones: [{ producto: "Modelo 1", talla: "M", color: "Negro", stock: 0 },
      { producto: "Modelo 2", talla: null, color: null, stock: null }]
  });
  assert.match(report, /Productos con precio por confirmar \(3\)/);
  assert.match(report, /ID\s+\| Nombre\s+\| Precio/);
  assert.match(report, /11\s+\| Modelo 1\s+\| 0\.00/);
  assert.match(report, /12\s+\| Modelo 2\s+\| Por confirmar/);
  assert.match(report, /13\s+\| Oferta\s+\| -10/);
  assert.match(report, /Variaciones con stock por confirmar \(2\)/);
  assert.match(report, /Producto\s+\| Talla\s+\| Color\s+\| Stock/);
  assert.match(report, /Modelo 1\s+\| M\s+\| Negro\s+\| 0/);
  assert.match(report, /Modelo 2\s+\| Por confirmar\s+\| Por confirmar\s+\| Por confirmar/);
  assert.doesNotMatch(report, /undefined|null/);
});

test("formatReport admite pendientes en una sola sección", () => {
  const products = formatReport({ productos: [{ id: 1, nombre: "Modelo", precio: 0 }], variaciones: [] });
  assert.match(products, /Productos con precio por confirmar \(1\)/);
  assert.doesNotMatch(products, /Variaciones|Sin datos pendientes/);
  const variations = formatReport({ productos: [],
    variaciones: [{ producto: "Modelo", talla: "S", color: "Azul", stock: 0 }] });
  assert.match(variations, /Variaciones con stock por confirmar \(1\)/);
  assert.doesNotMatch(variations, /Productos|Sin datos pendientes/);
});

test("findPendingData usa pool falso y solo SELECT para precios <= 0 o null y stock 0 o null", async () => {
  const queries = [];
  const productos = [{ id: 11, nombre: "Modelo 1", precio: "0.00" }];
  const variaciones = [{ producto: "Modelo 1", talla: "M", color: "Negro", stock: 0 }];
  const sinVariaciones = [{ id: 12, nombre: "Modelo 2" }];
  const pool = { async query(sql) {
    queries.push(sql);
    assert.match(sql.trim(), /^SELECT\b/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|clientes_whatsapp|mensajes|trafico_clientes)\b/i);
    if (/NOT EXISTS/.test(sql)) return { rows: sinVariaciones };
    return { rows: /FROM producto_variaciones v/.test(sql) ? variaciones : productos };
  } };
  assert.deepEqual(await findPendingData(pool), { productos, variaciones, sinVariaciones });
  assert.equal(queries.length, 3);
  assert.match(queries[0], /precio <= 0 OR precio IS NULL/);
  assert.match(queries[1], /v\.stock = 0 OR v\.stock IS NULL/);
  assert.match(queries[1], /JOIN productos p ON p.id = v.producto_id/);
});

// [ByClaude] Revisión: productos sin ninguna talla/color también son pendientes.
test("formatReport lista productos sin tallas/colores cargados", () => {
  const report = formatReport({ productos: [], variaciones: [],
    sinVariaciones: [{ id: 2, nombre: "Modelo 2" }] });
  assert.match(report, /Productos sin tallas\/colores cargados \(1\)/);
  assert.match(report, /2\s+\| Modelo 2/);
  assert.doesNotMatch(report, /Sin datos pendientes/);
});

test("findPendingData propaga errores de BD", async () => {
  const error = new Error("lectura fallida");
  await assert.rejects(findPendingData({ query: async () => { throw error; } }),
    caught => caught === error);
});
