// [ByCodex] (BRIEF-011) Registrar el resultado real y abortar la ruta si no se confirma el envío.
const { saveMessage } = require("./messages.service");
const { safeError, redactPhone } = require("./logger.service");

async function sendAndRecord(phone, content, send) {
  let response;
  try {
    response = await send();
  } catch (error) {
    // Un rechazo HTTP confirma fallo; sin respuesta no sabemos si Meta llegó a aceptarlo.
    const state = error.response ? "fallido" : "pendiente";
    const metaCode = error.response?.data?.error?.code;
    const detail = Number.isInteger(metaCode) ? ` (código ${metaCode})` : "";
    const failure = new Error(state === "fallido"
      ? `WhatsApp rechazó el envío${detail}. Revisa la configuración o las condiciones del envío.`
      : "No se pudo confirmar si WhatsApp aceptó el envío. Verifica la conversación antes de reenviar.");
    failure.code = "WHATSAPP_SEND_FAILED";
    failure.estado_envio = state;
    console.error(`[send] Envío ${state} a ${redactPhone(phone)}:`, safeError(error));
    try {
      await saveMessage(phone, "bot", content, { estado_envio: state });
    } catch (historyError) {
      // El fallo de historial no debe ocultar el rechazo original ni permitir avanzar de estado.
      console.error(`[send] No se pudo registrar fallo de ${redactPhone(phone)}:`, safeError(historyError));
      failure.message += " Tampoco se pudo guardar el intento en el historial.";
    }
    throw failure;
  }

  try {
    await saveMessage(phone, "bot", content, { estado_envio: "enviado" });
  } catch (error) {
    console.error(`[send] Envío aceptado sin historial para ${redactPhone(phone)}:`, safeError(error));
    const failure = new Error("WhatsApp aceptó el mensaje, pero no se pudo guardar el historial. No lo reenvíes sin verificar.");
    failure.code = "OUTBOUND_HISTORY_FAILED";
    throw failure;
  }
  return response;
}

module.exports = { sendAndRecord };
