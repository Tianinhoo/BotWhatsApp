const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// ======================================================
// CONSULTAR SI YA RECIBIÓ EL CATÁLOGO
// ======================================================

async function hasReceivedCatalog(phone) {

  const result = await pool.query(
    `
      SELECT catalogo_enviado
      FROM clientes_whatsapp
      WHERE telefono = $1
      LIMIT 1
    `,
    [phone]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].catalogo_enviado === true;
}


// ======================================================
// MARCAR CATÁLOGO COMO ENVIADO
// ======================================================

async function markCatalogSent(phone) {

  await pool.query(
    `
      INSERT INTO clientes_whatsapp (
        telefono,
        catalogo_enviado,
        fecha_catalogo,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        true,
        now(),
        now(),
        now()
      )

      ON CONFLICT (telefono)

      DO UPDATE SET
        catalogo_enviado = true,
        fecha_catalogo = now(),
        updated_at = now()
    `,
    [phone]
  );
}


module.exports = {
  hasReceivedCatalog,
  markCatalogSent
};