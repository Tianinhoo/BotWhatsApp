-- // [ByCodex] (BRIEF-002: reservas persistentes para deduplicar webhooks de Meta).
CREATE TABLE IF NOT EXISTS mensajes_procesados (
  wamid        TEXT PRIMARY KEY,
  telefono     TEXT NOT NULL,
  procesado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_procesados_fecha
  ON mensajes_procesados (procesado_en);
