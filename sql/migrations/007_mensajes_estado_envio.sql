-- // [ByCodex] (BRIEF-011) Estado de aceptación del envío; NULL conserva el historial sin evidencia.
-- enviado = aceptado por Meta, no confirma entrega. pendiente = resultado incierto de transporte.
ALTER TABLE mensajes
  ADD COLUMN estado_envio TEXT
  CHECK (estado_envio IN ('enviado', 'fallido', 'pendiente'));
