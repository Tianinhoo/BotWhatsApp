-- ======================================================
-- Cecilia Tedin Bot — Estado conversacional del cliente
-- [ByClaude] Piloto V1 (árbol de 7 rutas, sin IA generativa).
--
-- Guarda, por teléfono, en qué punto del árbol conversacional está el
-- cliente. Se agrega como columna sobre la tabla existente
-- "clientes_whatsapp" para no duplicar información.
--
-- Estados válidos (ver STATES en src/services/state.service.js):
--   - ORGANIC       : primer contacto, aún no vio el menú.
--   - MENU          : ya vio el menú, esperando que elija una opción 1..7.
--   - CATALOG       : ya recibió el catálogo, sigue en el menú.
--   - PAUSED_HUMAN  : derivado a un asesor humano, el bot NO le responde.
-- ======================================================


-- [ByClaude] Aseguramos que exista "clientes_whatsapp" antes de tocar
-- sus columnas. En instalaciones limpias esta tabla se crea también aquí.
CREATE TABLE IF NOT EXISTS clientes_whatsapp (
  id                  BIGSERIAL PRIMARY KEY,
  telefono            TEXT NOT NULL UNIQUE,
  catalogo_enviado    BOOLEAN NOT NULL DEFAULT false,
  fecha_catalogo      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- [ByClaude] Agregamos la columna "estado_conversacion" solo si no existe.
-- Default "ORGANIC" para que todo cliente antiguo empiece en el estado
-- inicial cuando se despliegue la V1.
ALTER TABLE clientes_whatsapp
  ADD COLUMN IF NOT EXISTS estado_conversacion TEXT NOT NULL DEFAULT 'ORGANIC';


-- [ByClaude] Restringimos los valores permitidos con un CHECK constraint.
-- Se agrega solo si aún no está aplicada (Postgres < 15 no soporta
-- "ADD CONSTRAINT IF NOT EXISTS", por eso el DO $$ ... $$).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clientes_whatsapp_estado_check'
  ) THEN
    ALTER TABLE clientes_whatsapp
      ADD CONSTRAINT clientes_whatsapp_estado_check
      CHECK (estado_conversacion IN (
        'ORGANIC', 'MENU', 'CATALOG', 'PAUSED_HUMAN'
      ));
  END IF;
END
$$;


-- [ByClaude] Índice para filtrar rápido a los clientes derivados a humano
-- (los que el dashboard tiene que atender manualmente).
CREATE INDEX IF NOT EXISTS idx_clientes_estado
  ON clientes_whatsapp (estado_conversacion, updated_at DESC);
