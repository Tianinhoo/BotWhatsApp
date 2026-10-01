-- ======================================================
-- 007 — Campo "Necesidad" en el Resumen para Atención
-- [ByClaude] (BRIEF-017)
--
-- El pedido original al equipo pedía 4 campos: Origen, Modelo, Interés
-- y NECESIDAD. La implementación inicial persistió solo los primeros 3.
-- Esta migración agrega la 4ta columna denormalizada. El JSON completo
-- del resumen (`resumen JSONB`) ya venía almacenando el objeto entero,
-- así que solo agregamos la columna para poder filtrar/listar rápido
-- sin desanidar el JSON.
--
-- Regla de negocio (documentada en summary.service.js):
--   - Si el cliente escribió texto libre útil, se guarda su necesidad
--     (últimos 1-3 textos libres, hasta 300 caracteres).
--   - Si no hay texto libre suficiente, se guarda "Por confirmar".
-- ======================================================


ALTER TABLE resumenes_atencion
  ADD COLUMN IF NOT EXISTS necesidad TEXT;
