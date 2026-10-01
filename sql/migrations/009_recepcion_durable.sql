-- [ByCodex] (BRIEF-027) Reservada 009. No modifica migraciones aplicadas.
CREATE TABLE IF NOT EXISTS mensajes_recibidos (
  id BIGSERIAL PRIMARY KEY,
  wamid TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  payload JSONB NOT NULL,
  estado TEXT NOT NULL DEFAULT 'recibido'
    CHECK (estado IN ('recibido','procesando','completado','revision','resuelto')),
  error_code TEXT,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recibidos_pendientes
  ON mensajes_recibidos (telefono,id) WHERE estado IN ('recibido','procesando','revision');
