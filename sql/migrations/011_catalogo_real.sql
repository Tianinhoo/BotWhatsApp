-- [ByClaude] Catálogo real V1 (fuente: docs/CATALOGO-V1.md, confirmado por el usuario 2026-10-10).
-- Reutiliza las 4 filas sembradas por 002 (mismo id e imagen_key): así no se rompen
-- prenda_seleccionada_id existentes ni el orden de imágenes del catálogo.
-- Stock no informado por el negocio: se carga 0 como "sin confirmar"; el bot nunca lo publica.
-- Nota: BRIEF-025 había reservado 011 para precio/stock nullable; esa migración queda fuera de alcance.

UPDATE productos SET nombre = 'Maxi con bolsillo', precio = 180, categoria = 'pantalon', disponible = true,
  descripcion = 'Bolsillos funcionales, cintura alta, pierna amplia.', updated_at = now()
WHERE imagen_key = 'IMAGE_MODELO_1';

UPDATE productos SET nombre = 'Efecto Lipo', precio = 160, categoria = 'pantalon', disponible = true,
  descripcion = 'Cintura alta, diseño sin bolsillos, caída amplia.', updated_at = now()
WHERE imagen_key = 'IMAGE_MODELO_2';

UPDATE productos SET nombre = 'Figura 10', precio = 160, categoria = 'pantalon', disponible = true,
  descripcion = 'Costura central delantera, cintura alta, pierna amplia.', updated_at = now()
WHERE imagen_key = 'IMAGE_MODELO_3';

UPDATE productos SET nombre = 'Ultra Palazzo', precio = 190, categoria = 'pantalon', disponible = true,
  descripcion = 'Faja de cintura 7 cm, bolsillos laterales curvos, tela stretch, bota amplia. Largo 110 cm.',
  updated_at = now()
WHERE imagen_key = 'IMAGE_OFERTA_DIA';

INSERT INTO producto_variaciones (producto_id, talla, color, stock)
SELECT p.id, t.talla, c.color, 0
FROM productos p
CROSS JOIN unnest(ARRAY['P', 'M', 'G', 'GG']) AS t(talla)
CROSS JOIN unnest(ARRAY['Negro', 'Beige', 'Azul marino', 'Rosa bebé', 'Bordó', 'Verde olivo', 'Chocolate']) AS c(color)
WHERE p.imagen_key = 'IMAGE_MODELO_1'
ON CONFLICT (producto_id, talla, color) DO NOTHING;

INSERT INTO producto_variaciones (producto_id, talla, color, stock)
SELECT p.id, t.talla, c.color, 0
FROM productos p
CROSS JOIN unnest(ARRAY['P', 'M', 'G', 'GG']) AS t(talla)
CROSS JOIN unnest(ARRAY['Chocolate', 'Azul marino', 'Beige', 'Blanco perla', 'Verde bandera', 'Camel',
  'Verde olivo', 'Negro', 'Bordó']) AS c(color)
WHERE p.imagen_key = 'IMAGE_MODELO_2'
ON CONFLICT (producto_id, talla, color) DO NOTHING;

INSERT INTO producto_variaciones (producto_id, talla, color, stock)
SELECT p.id, t.talla, c.color, 0
FROM productos p
CROSS JOIN unnest(ARRAY['P', 'M', 'G', 'GG']) AS t(talla)
CROSS JOIN unnest(ARRAY['Terracota', 'Beige', 'Negro', 'Chocolate', 'Verde olivo']) AS c(color)
WHERE p.imagen_key = 'IMAGE_MODELO_3'
ON CONFLICT (producto_id, talla, color) DO NOTHING;

INSERT INTO producto_variaciones (producto_id, talla, color, stock)
SELECT p.id, t.talla, c.color, 0
FROM productos p
CROSS JOIN unnest(ARRAY['P', 'M', 'G']) AS t(talla)
CROSS JOIN unnest(ARRAY['Negro', 'Blanco perla', 'Beige', 'Chocolate', 'Verde olivo', 'Verde bandera',
  'Plomo', 'Bordó', 'Caramelo']) AS c(color)
WHERE p.imagen_key = 'IMAGE_OFERTA_DIA'
ON CONFLICT (producto_id, talla, color) DO NOTHING;
