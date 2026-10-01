-- ======================================================
-- Cecilia Tedin Bot — Schema de base de datos
-- Tablas nuevas para el agente de IA.
-- == IMPORTANTE: NO toca la tabla clientes_whatsapp ==
-- ======================================================

-- Productos / prendas de la marca
CREATE TABLE IF NOT EXISTS productos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE,
  descripcion   TEXT,
  precio        NUMERIC(10,2) NOT NULL DEFAULT 0,
  categoria     TEXT,
  disponible    BOOLEAN NOT NULL DEFAULT true,
  imagen_key    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variaciones de cada producto (talla + color + stock)
CREATE TABLE IF NOT EXISTS producto_variaciones (
  id           SERIAL PRIMARY KEY,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  talla        TEXT,
  color        TEXT,
  stock        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (producto_id, talla, color)
);

-- Historial de conversación (el agente usa los últimos mensajes como contexto)
CREATE TABLE IF NOT EXISTS mensajes (
  id            BIGSERIAL PRIMARY KEY,
  telefono      TEXT NOT NULL,
  origen        TEXT NOT NULL CHECK (origen IN ('cliente', 'bot')),
  contenido     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_telefono
  ON mensajes (telefono, created_at);