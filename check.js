require('dotenv').config();
const pool = require('./src/services/db');

async function check() {
  try {
    const clientes = await pool.query("SELECT * FROM clientes_whatsapp WHERE telefono = '59100000000'");
    console.log("Clientes:", clientes.rows);

    const mensajes = await pool.query("SELECT origen, contenido FROM mensajes WHERE telefono = '59100000000' ORDER BY created_at DESC LIMIT 5");
    console.log("Mensajes:", mensajes.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

check();
