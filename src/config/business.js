// ======================================================
// business.js — Datos del negocio (centralizados)
// [ByClaude] (BRIEF-012)
// ======================================================
//
// Todos los datos del negocio que se muestran en los mensajes del árbol
// V1 viven acá. **Ninguno está inventado**: los que no fueron validados
// con el negocio tienen valor `null` y las rutas los reemplazan por
// "Por confirmar" o los omiten del texto.
//
// Cuando el humano confirme un dato con el negocio real, se cambia
// SOLO acá y todas las rutas se actualizan sin buscar por el árbol.
//
// Regla estricta: si no está confirmado, NO se muestra al cliente.
// Preferimos un mensaje más flaco antes que información inventada.

module.exports = {

  // Rango de precios (por definir con el negocio). Formato:
  //   { desde: "Bs 150", hasta: "Bs 350" } → confirmado.
  //   null → mostramos "Por confirmar" o quitamos del texto.
  precios: null,

  // Tallas disponibles. Por ejemplo ["S", "M", "L", "XL"].
  // null → "Por confirmar".
  tallas: null,

  // Horario de atención humana. Ejemplo: "Lun a Sáb, 9:00 a 19:00".
  // null → "Por confirmar".
  horario_atencion: null,

  // Instagram oficial. Ejemplo: "@ceciliatedin". null → se omite.
  instagram: null,

  // Envíos.
  envios: {
    // "todo el país" | "solo Santa Cruz" | null.
    cobertura: null,
    // Ejemplo: "24 a 72 horas hábiles". null → "Por confirmar".
    plazo: null,
    // true | false | null.
    pago_contra_entrega: null
  },

  // Dirección física, si aplica. null → se omite.
  direccion_fisica: null
};
