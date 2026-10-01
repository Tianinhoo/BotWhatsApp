// [ByOpenCode] (BRIEF-006) Helpers de logging para no filtrar PII/secrets a
// Railway logs. Reemplaza las llamadas crudas a console.* en el flujo del
// webhook. NO introduce Winston/Pino todavia: console.* sigue siendo la
// salida, solo se envuelve con redacciones.

// Redacta un telefono: solo los ultimos 4 digitos quedan visibles (***1234).
function redactPhone(phone) {
  if (!phone) return "unknown";
  const s = String(phone);
  return s.length <= 4 ? "***" + s : "***" + s.slice(-4);
}

// Un error de axios lleva en error.config.headers el Bearer token.
// Nunca lo imprimimos entero: aca se descarta config y solo se conserva
// el message + el body de la respuesta (que en Meta nunca incluye el token).
// El body de la respuesta se trunca por si acaso arrastra algo con ruido.
function safeError(error) {
  if (!error) return "unknown error";

  if (error.response && error.response.data) {
    let body = "";
    try {
      body = JSON.stringify(error.response.data);
    } catch (_) {
      body = String(error.response.data);
    }
    if (body.length > 2000) {
      body = body.slice(0, 2000) + "... (truncado)";
    }
    return `${error.message || String(error)} — response: ${body}`;
  }

  return error.message || String(error);
}

module.exports = { redactPhone, safeError };