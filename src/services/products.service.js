const pool = require("./db");


// ======================================================
// LISTAR PRODUCTOS (para que la IA los conozca)
// ======================================================

async function getAllProducts() {
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.categoria,
        p.disponible,
        COALESCE(
          json_agg(
            json_build_object(
              'talla', v.talla,
              'color', v.color,
              'stock', v.stock
            )
          ) FILTER (WHERE v.id IS NOT NULL),
          '[]'
        ) AS variaciones

      FROM productos p
      LEFT JOIN producto_variaciones v
        ON v.producto_id = p.id

      GROUP BY p.id
      ORDER BY p.id
    `
  );

  return result.rows;
}


// ======================================================
// CONSULTAR DISPONIBILIDAD DE UN PRODUCTO
// ======================================================

async function checkAvailability(productName, talla, color) {
  const result = await pool.query(
    `
      SELECT
        p.nombre,
        p.precio,
        p.disponible,
        v.talla,
        v.color,
        v.stock

      FROM productos p
      INNER JOIN producto_variaciones v
        ON v.producto_id = p.id

      WHERE
        p.disponible = true
        AND (p.nombre ILIKE '%' || $1 || '%')
        AND ($2 IS NULL OR v.talla ILIKE '%' || $2 || '%')
        AND ($3 IS NULL OR v.color ILIKE '%' || $3 || '%')
        AND v.stock > 0

      ORDER BY p.nombre, v.talla, v.color
    `,
    [productName, talla || null, color || null]
  );

  return result.rows;
}


// ======================================================
// FORMATO LEGIBLE PARA EL AGENTE (productos disponibles)
// ======================================================

function formatProductsForAgent(products) {
  if (!products || products.length === 0) {
    return "No hay productos cargados todavía.";
  }

  return products
    .map((p) => {
      const precio =
        p.precio && Number(p.precio) > 0
          ? `Bs ${Number(p.precio).toFixed(2)}`
          : "Precio por definir";

      const variaciones = Array.isArray(p.variaciones)
        ? p.variaciones
            .filter((v) => v.stock > 0)
            .map((v) => `Talla ${v.talla} / ${v.color} (${v.stock} u.)`)
            .join(", ")
        : "";

      const estado = p.disponible ? "Disponible" : "Agotado";

      let linea = `- ${p.nombre} (${estado}) — ${precio}`;
      if (p.descripcion) linea += ` — ${p.descripcion}`;
      if (variaciones) linea += `\n    Variantes: ${variaciones}`;

      return linea;
    })
    .join("\n");
}


module.exports = {
  getAllProducts,
  checkAvailability,
  formatProductsForAgent
};