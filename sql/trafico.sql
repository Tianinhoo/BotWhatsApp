-- ======================================================
-- Cecilia Tedin Bot — Tabla de tráfico de clientes
-- [ByOpenCode] Piloto V1: origen del tráfico (anuncio / orgánico).
-- Guarda, por teléfono, si el cliente vino desde un anuncio de Meta
-- (webhook con objeto "referral") o por tráfico orgánico.
-- ======================================================

CREATE TABLE IF NOT EXISTS trafico_clientes (
  id                 BIGSERIAL PRIMARY KEY,
  telefono           TEXT NOT NULL UNIQUE,
  origen             TEXT NOT NULL CHECK (origen IN ('anuncio', 'organico')),
  -- Datos del objeto "referral" de Meta (solo cuando vienen de anuncios)
  source_type        TEXT,
  source_id          TEXT,
  source_url         TEXT,
  headline           TEXT,
  body               TEXT,
  first_referral_id  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [ByOpenCode] Índice para acelerar la búsqueda por origen (reportes del piloto).
CREATE INDEX IF NOT EXISTS idx_trafico_origen
  ON trafico_clientes (origen, updated_at DESC);