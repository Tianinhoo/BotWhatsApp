# BRIEF-012 — Textos honestos + datos validados por el negocio

- **Dueño:** Claude (implementación) + Humano (validación de datos con negocio, PENDIENTE)
- **Estado:** HECHO (con datos como "Por confirmar" a la espera de validación del negocio)
- **Prioridad:** P0 pre-Fase 0 (bloquea BRIEF-010)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** decisión del humano sobre los datos reales (precios, tallas, horarios, envíos).

## Objetivo

Dos cosas complementarias:

1. Los textos del árbol V1 no deben prometer capacidades que el bot NO
   tiene (por ejemplo, "decinos qué modelo te interesa" cuando el bot
   no procesa texto libre).
2. Los datos hardcodeados en esos textos (precios, tallas, horarios,
   condiciones de envío) deben estar **validados con el negocio** o
   marcarse explícitamente como "por confirmar" — no inventados.

## Contexto

Situación actual en `src/services/state.service.js`:

- **Ruta 3** (`replyPricesAndSizes`, línea 495): dice *"Decinos qué
  modelo te interesa y te confirmamos el precio y las tallas exactas"*.
  → cliente escribe "Modelo 2", el bot no lo procesa, cae en fallback.
- **Ruta 4** (`replyStock`, línea 512): dice *"Contanos qué modelo te
  interesa, en qué talla y qué color buscás, y en un ratito te
  confirmamos"*. → mentira: nadie va a confirmar nada.
- **Ruta 5** (`replyShipping`, línea 526): promete "envíos a todo el
  país", "24 a 72 horas", "pago contra entrega en zonas seleccionadas".
- **Ruta 7** (`replyContact`, línea 578): dice "Lun a Sáb, 9:00 a 19:00"
  y "Instagram: @ceciliatedin".

Todos los números y datos los inventé yo cuando escribí el árbol V1.
Nadie del negocio los validó.

## Alcance

**SÍ:**
- Reescribir los textos de las rutas 3 y 4 para que no prometan
  procesamiento de texto libre. Sugerencia: **redirigir a la opción 6
  del menú (asesor humano)** cuando el cliente quiera algo específico.
- Marcar TODOS los datos que no estén validados como "por confirmar"
  o directamente sacarlos del texto hasta tener respuesta del negocio.
- Extraer los datos que sí queden a **constantes al inicio del archivo**
  (o mejor, a un archivo `src/config/business.js`) para que un cambio
  futuro sea un edit de una línea, no una búsqueda por todo el árbol.

**NO:**
- Implementar captura guiada (modelo → talla → color con estado
  intermedio). Eso es V1.1 y requiere más estados.
- Consultar la tabla `productos` desde el árbol. La V1 se mantiene simple.

## Aceptación

- [ ] Textos de ruta 3 y 4 revisados: ninguno pide texto libre que el bot no procesa.
- [ ] Todos los datos hardcodeados están validados con el humano y
      registrados en el brief como "confirmado por: [nombre]" o
      marcados como "por confirmar".
- [ ] Datos extraídos a constantes / archivo de config.
- [ ] Firma `// [ByClaude] (BRIEF-012)` en los bloques tocados.
- [ ] Prueba manual: recorrer las 7 opciones y verificar que los textos
      no prometen lo que no cumplen.

## Cuestionario para el humano (llenar antes de arrancar)

**Rango de precios:**
- Actual en código: `Bs 150 a Bs 350`.
- Real: __________________ (o "por confirmar").

**Tallas disponibles:**
- Actual en código: `S, M, L, XL`.
- Real: __________________ (o "por confirmar").

**Horario de atención humana:**
- Actual: `Lun a Sáb, 9:00 a 19:00`.
- Real: __________________ (o "por confirmar").

**Instagram / redes:**
- Actual: `@ceciliatedin`.
- Real: __________________ (o "por confirmar").

**Envíos:**
- Actual: `todo el país, 24 a 72 h hábiles, pago contra entrega en zonas seleccionadas`.
- Real: __________________ (o "por confirmar").

**Ciudad / dirección física** (si aplica):
- Actual: no hay dirección declarada.
- Real: __________________ (o "no aplica" o "por confirmar").

## Notas técnicas

Texto sugerido para ruta 3 (Precios y tallas) sin promesa vacía:

```
📏 *Precios y tallas*

Nuestros precios y tallas dependen del modelo específico que te
interese. Para darte información exacta, tocá la *opción 6 del menú*
y te derivamos con una asesora que va a poder responderte sobre el
modelo que estés buscando.

Escribí *menú* para volver al menú principal.
```

Texto sugerido para ruta 4 (Stock):

```
🔎 *Disponibilidad / stock*

Para consultar stock de un modelo específico en tu talla y color, tocá
la *opción 6 del menú* y una asesora va a poder confirmártelo.

Escribí *menú* para volver al menú principal.
```

## Bloqueos

- 2026-09-20 — Resuelto: el humano optó por avanzar con "Por confirmar" en todos los datos que aún no fueron validados. Cuando el negocio los confirme, se actualiza `src/config/business.js` sin tocar el árbol.

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude, fusionando su propuesta original BRIEF-012 con lo que iba a ser BRIEF-020 (validar datos con negocio), según ajuste del humano.
- 2026-09-20 — Claude cerró el brief:
  - Creó `src/config/business.js` con `null` en todo campo no confirmado.
  - Reescribió las 4 rutas (3, 4, 5, 7) para leer de `business.js`. Los datos `null` se muestran como "Por confirmar" o se omiten.
  - Rutas 3 y 4 ya NO prometen procesar texto libre: derivan explícitamente a la opción 6.
  - `npm test`: 52 pass / 0 fail / 6 skip (los skip son integraciones opcionales).
  - Queda pendiente que el humano actualice los valores reales en `business.js` cuando el negocio se los confirme. Al hacerlo, el árbol se ajusta automáticamente sin editar nada más.
