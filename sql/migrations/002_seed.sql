-- ======================================================
-- Seed inicial: los 4 productos que ya se muestran en el
-- .env (IMAGE_MODELO_1/2/3 e IMAGE_OFERTA_DIA).
--
-- NOTA: precio/tallas/colores reales los carga el dueño.
-- Hasta que se carguen, la IA NO debe inventar precios ni
-- stock (así está instruido en el system prompt).
-- ======================================================

INSERT INTO productos (nombre, descripcion, precio, categoria, imagen_key)
VALUES
  ('Modelo 1',            NULL, 0, 'indefinida',   'IMAGE_MODELO_1'),
  ('Modelo 2',            NULL, 0, 'indefinida',   'IMAGE_MODELO_2'),
  ('Modelo 3',            NULL, 0, 'indefinida',   'IMAGE_MODELO_3'),
  ('Oferta del día',      NULL, 0, 'indefinida',   'IMAGE_OFERTA_DIA')
ON CONFLICT (nombre) DO NOTHING;