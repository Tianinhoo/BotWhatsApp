# Catálogo V1 — ficha de productos

<!-- [ByClaude] 2026-10-10: transcripto de las placas de Instagram entregadas por el usuario. -->

Fuente: placas `@ceciliatedin.bo` entregadas el 2026-10-10, copiadas en `media/catalogo/`.
Stock: **no informado** ("Consultá disponibilidad de color y talla"). El bot nunca publica stock;
la asesora confirma disponibilidad.

| # | Producto | Precio | Tallas | Colores | Portada |
|---|---|---|---|---|---|
| 1 | Maxi con bolsillo | 180 Bs | P, M, G, GG | Negro, Beige, Azul marino, Rosa bebé, Bordó, Verde olivo, Chocolate | `maxi-01-portada.jpg` |
| 2 | Efecto Lipo | 160 Bs | P, M, G, GG | Chocolate, Azul marino, Beige, Blanco perla, Verde bandera, Camel, Verde olivo, Negro, Bordó | `lipo-01-portada.jpg` |
| 3 | Figura 10 | 160 Bs | P, M, G, GG | Terracota, Beige, Negro, Chocolate, Verde olivo | `figura10-01-portada.jpg` |
| 4 | Ultra Palazzo | 190 Bs (confirmado por el usuario) | P (36–38), M (38–40), G (42–44) | Negro, Blanco perla, Beige, Chocolate, Verde olivo, Verde bandera, Plomo, Bordó, Caramelo | `palazzo-01-portada.jpg` |

## Descripción breve (de las placas)

- **Maxi con bolsillo:** bolsillos funcionales, cintura alta, pierna amplia.
- **Efecto Lipo:** cintura alta, diseño sin bolsillos, caída amplia.
- **Figura 10:** costura central delantera, cintura alta, pierna amplia.
- **Ultra Palazzo:** faja de cintura 7 cm, bolsillos laterales curvos, tela stretch premium, bota amplia.

## Guía de tallas (cm)

Maxi con bolsillo, Efecto Lipo y Figura 10 comparten la misma guía:

| Talla | Cintura | Cadera | Largo |
|---|---|---|---|
| P | 60–70 | hasta 100 | 108 |
| M | 70–80 | hasta 110 | 110 |
| G | 80–95 | hasta 120 | 110 |
| GG | 95–110 | hasta 130 | 111 |

Ultra Palazzo: P (36–38), M (38–40), G (42–44); largo 110 cm en todas las tallas.

## Decisiones y pendientes

- 2026-10-10: estos 4 productos reemplazan a Modelo 1–3 y Oferta del día. Palazzo 190 Bs.
  Cargado por `sql/migrations/011_catalogo_real.sql`.
- Nombres distintos en el catálogo de WhatsApp Business: "MAXI PALAZZO CON B..." (= Maxi con bolsillo)
  y "ULTRA IMPACTO" (= Ultra Palazzo). El bot usa los nombres de las placas y acepta ambos.

1. Inconsistencia en las placas de Ultra Palazzo: una dice "9 colores" e incluye Verde bandera;
   otra muestra 8 colores sin Verde bandera. Se carga la lista de 9.
