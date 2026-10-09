-- [ByCodex] (BRIEF-025) Selección persistente y contexto ordinal del catálogo.
ALTER TABLE clientes_whatsapp
  DROP CONSTRAINT IF EXISTS clientes_whatsapp_estado_check;

ALTER TABLE clientes_whatsapp
  ADD CONSTRAINT clientes_whatsapp_estado_check
  CHECK (estado_conversacion IN (
    'ORGANIC',
    'MENU',
    'CATALOG',
    'PAUSED_HUMAN',
    'WAITING_PRODUCT_SELECTION'
  ));

ALTER TABLE clientes_whatsapp
  ADD COLUMN IF NOT EXISTS prenda_seleccionada_id INTEGER
    REFERENCES productos(id) ON DELETE SET NULL;

ALTER TABLE clientes_whatsapp
  ADD COLUMN IF NOT EXISTS last_shown_products INTEGER[] NOT NULL DEFAULT '{}';
