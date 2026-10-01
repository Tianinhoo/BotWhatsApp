// ======================================================
// tests/atribucion.test.js — Regresión de BRIEF-013
// [ByClaude] (BRIEF-013)
// ======================================================
//
// Verifica que el `ON CONFLICT` de `registerTraffic` NUNCA degrade la
// atribución publicitaria de un cliente que vino por un anuncio.
//
// Escenarios cubiertos:
//   1. Anuncio → orgánico posterior: mantiene "anuncio" + referral intactos.
//   2. Orgánico → anuncio posterior (raro pero posible): upgrade a "anuncio".
//   3. Orgánico → orgánico repetido: mantiene "organico".
//
// Requiere PostgreSQL real. Se activa con DEDUP_TEST_DATABASE=1 (mismo
// switch que usa la integración de dedup, para consistencia).

const test = require("node:test");
const assert = require("node:assert/strict");

// [ByClaude] (BRIEF-013) La suite requiere BD real. Sin el flag, se omite.
const INTEGRATION_ENABLED = process.env.DEDUP_TEST_DATABASE === "1";

let pool, registerTraffic, getTraffic;

if (INTEGRATION_ENABLED) {
  require("dotenv").config();
  pool = require("../src/services/db");
  const svc = require("../src/services/state.service");
  registerTraffic = svc.registerTraffic;
  getTraffic = svc.getTraffic;
}


// [ByClaude] Helper — teléfono sintético único por test para no chocar.
function syntheticPhone() {
  return "5910" + String(Date.now()).slice(-8);
}


test(
  "atribución: cliente que llegó por anuncio NO se degrada a orgánico",
  { skip: !INTEGRATION_ENABLED ? "requiere DEDUP_TEST_DATABASE=1" : false },
  async () => {
    const phone = syntheticPhone();

    const referral = {
      source_type: "ad",
      source_id: "AD-001",
      source_url: "https://example.com/ad",
      headline: "Figura 10 - Viernes Express",
      body: "Aprovechá 20% off",
      id: "REF-001"
    };

    try {
      // Primer mensaje: viene con referral → se registra como anuncio.
      await registerTraffic(phone, "anuncio", referral);
      const t1 = await getTraffic(phone);
      assert.equal(t1.origen, "anuncio");
      assert.equal(t1.source_id, "AD-001");
      assert.equal(t1.first_referral_id, "REF-001");

      // Segundo mensaje: mismo cliente, ya sin referral → registra como orgánico.
      await registerTraffic(phone, "organico", null);
      const t2 = await getTraffic(phone);

      // Regresión de BRIEF-013: NO debe degradarse a orgánico.
      assert.equal(t2.origen, "anuncio", "el origen debe mantenerse 'anuncio'");
      assert.equal(t2.source_id, "AD-001", "el source_id del anuncio debe preservarse");
      assert.equal(t2.first_referral_id, "REF-001");
      assert.equal(t2.headline, "Figura 10 - Viernes Express");
    } finally {
      await pool.query(`DELETE FROM trafico_clientes WHERE telefono = $1`, [phone]);
    }
  }
);


test(
  "atribución: cliente orgánico que después clickea un anuncio SÍ hace upgrade",
  { skip: !INTEGRATION_ENABLED ? "requiere DEDUP_TEST_DATABASE=1" : false },
  async () => {
    const phone = syntheticPhone();

    const referral = {
      source_type: "ad",
      source_id: "AD-002",
      headline: "Maxi Sábado",
      id: "REF-002"
    };

    try {
      // Primer contacto orgánico.
      await registerTraffic(phone, "organico", null);
      const t1 = await getTraffic(phone);
      assert.equal(t1.origen, "organico");

      // Después clickea un anuncio → debe hacer upgrade.
      await registerTraffic(phone, "anuncio", referral);
      const t2 = await getTraffic(phone);
      assert.equal(t2.origen, "anuncio", "el origen debe hacer upgrade a 'anuncio'");
      assert.equal(t2.source_id, "AD-002");
      assert.equal(t2.first_referral_id, "REF-002");
    } finally {
      await pool.query(`DELETE FROM trafico_clientes WHERE telefono = $1`, [phone]);
    }
  }
);


test(
  "atribución: cliente 100% orgánico se mantiene orgánico",
  { skip: !INTEGRATION_ENABLED ? "requiere DEDUP_TEST_DATABASE=1" : false },
  async () => {
    const phone = syntheticPhone();

    try {
      await registerTraffic(phone, "organico", null);
      await registerTraffic(phone, "organico", null);
      await registerTraffic(phone, "organico", null);
      const t = await getTraffic(phone);
      assert.equal(t.origen, "organico");
    } finally {
      await pool.query(`DELETE FROM trafico_clientes WHERE telefono = $1`, [phone]);
    }
  }
);


// [ByClaude] Cierre limpio del pool cuando la integración corre.
test("cleanup: cerrar pool", { skip: !INTEGRATION_ENABLED }, async () => {
  await pool.end();
});
