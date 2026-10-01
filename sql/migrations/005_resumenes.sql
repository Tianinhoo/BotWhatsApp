-- ======================================================
-- Cecilia Tedin Bot — Resumen para Atención (handoff a humano)
-- [ByClaude] (Reasignado) Piloto V1: cada vez que un cliente pasa a
-- PAUSED_HUMAN generamos un JSON con lo que ya sabemos de él
-- (origen del tráfico, modelo seleccionado, interés/color) para que
-- la asesora humana pueda arrancar la charla sin releer todo el hilo.
--
-- Guardamos una fila por cada derivación (histórico auditable), no
-- una fila por cliente, para poder ver cómo evolucionó el interés.
-- ======================================================


CREATE TABLE IF NOT EXISTS resumenes_atencion (
  id                  BIGSERIAL PRIMARY KEY,
  telefono            TEXT NOT NULL,

  -- [ByClaude] (Reasignado) Campos denormalizados para poder filtrar y
  -- listar rápido en el dashboard sin tener que abrir el JSON completo.
  origen_trafico      TEXT,
  modelo_seleccionado TEXT,
  interes_color       TEXT,

  -- [ByClaude] (Reasignado) JSON completo del resumen (incluye motivo,
  -- último mensaje del cliente, fecha, y todos los campos anteriores).
  -- Se guarda como JSONB para poder indexar/filtrar campos internos.
  resumen             JSONB NOT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- [ByClaude] (Reasignado) Índice para traer rápidamente el último resumen
-- de un cliente (uso principal del dashboard cuando abre una conversación).
CREATE INDEX IF NOT EXISTS idx_resumenes_telefono_fecha
  ON resumenes_atencion (telefono, created_at DESC);
