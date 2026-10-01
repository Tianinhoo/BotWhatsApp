# Correspondencia simulación ↔ código real

> Documento honesto para auditoría. Compara `dashboard-sim.html` (prototipo
> interactivo) contra el código del bot que efectivamente corre.
>
> **Firma:** `// [ByClaude]`
> **Fecha:** 2026-09-30 · revisado 2026-09-30 tras segunda revisión externa.
> **Motivo:** revisión externa pidió explicitar qué es real, qué es simulado
> y dónde diverge la simulación del bot.
>
> **Changelog del documento:**
> - 2026-09-30 primera versión: divergencias D1–D6.
> - 2026-09-30 segunda revisión externa agregó D7–D10 y corrigió afirmaciones
>   previas (ver §"Correcciones a esta auditoría").

---

## Qué es `dashboard-sim.html`

Un prototipo HTML+JS **autocontenido en el navegador**, publicado como artifact
de Claude. **No se conecta a nada**: no habla con Postgres, no habla con Meta,
no corre el servidor Express. Toda la lógica del árbol V1 fue **transcrita a
mano** de `src/services/state.service.js` a JavaScript de navegador para
poder recorrer visualmente los flujos.

Sirve para:
- Diseñar y validar la experiencia del cliente antes de probarla con Meta real.
- Mostrar visualmente a stakeholders cómo se vería el dashboard de atención.
- Documentar el árbol de forma interactiva para onboarding.

NO sirve para:
- Verificar que `state.service.js` funciona correctamente.
- Reproducir bugs de concurrencia, race conditions o fallos de red.
- Probar el procesamiento del webhook, la validación HMAC o el dedup `wamid`.

---

## Lo que es REAL (portado línea por línea)

Las siguientes constantes y funciones del simulador son **copias literales** de
`src/services/state.service.js`. Si cambia el original, hay que actualizarlas
aquí también.

| Elemento | Origen real | Simulación |
|---|---|---|
| `STATES` (4 estados) | `state.service.js:73-78` | ✅ idéntico |
| `MENU_OPTIONS` (mapa de 7 opciones con aliases) | `state.service.js:92-129` | ✅ idéntico |
| `MENU_REOPEN_KEYWORDS` | `state.service.js:134-146` | ✅ idéntico |
| `resolveMenuOption` con `Object.hasOwn` (BRIEF-023) | `state.service.js:415-425` | ✅ idéntico |
| `requestedMenu` | `state.service.js:430-436` | ✅ idéntico |
| Textos de rutas 1-7 | `state.service.js:479-683` | ✅ copiados textualmente |
| Flujo `processMenuOption` (switch) | `state.service.js:696-752` | ✅ idéntico |
| Flujo del `app.js:299-344` (dispatch por estado) | `src/app.js` | ✅ transcrito |

---

## Lo que es SIMULADO (fake, con etiqueta visible)

Lo siguiente **no tiene contraparte real** o es una ilusión visual:

| Elemento del artifact | Qué pretende mostrar | Realidad |
|---|---|---|
| Indicador verde "Webhook conectado" | Que Meta está mandando mensajes | 🔴 No hay conexión. Es un badge decorativo. |
| Trace SQL inferior | Qué queries ejecuta Postgres | 🔴 Son strings generados por JS. Postgres nunca se consulta. |
| Imágenes del catálogo (placeholders gradient) | Los modelos reales | 🔴 Nunca se cargan `IMAGE_MODELO_1/2/3`. Son `<div>` con texto. |
| Toasts "Nuevo handoff" | Eventos SSE del backend | 🔴 Disparados por `setTimeout` desde el mismo navegador. |
| "Checkmark verde" en burbuja del bot | `estado_envio = 'enviado'` (BRIEF-011) | 🔴 Siempre verde. En producción podría ser `fallido` o `pendiente`. |
| Reloj y uptime | Horario del servidor | 🔴 Horario local del navegador. Uptime arranca al cargar la página. |
| KPIs (24 conversaciones, 61% ads, etc.) | Métricas agregadas del día | 🟡 En v1 están hardcoded o calculados a partir de la sesión actual. |
| Avatares con iniciales | Fotos de perfil de WhatsApp | 🔴 Nunca se descargan. Son texto sobre fondo. |

---

## Divergencias — simulación vs real (ojo acá)

Estas son las diferencias que **NO están cubiertas por una etiqueta visible**
y que la revisión externa detectó correctamente:

### D1 — Extracción de talla

- **Afirmé:** "detecta modelo, color y talla".
- **Real:** `src/services/summary.service.js` tiene `detectModel`, `detectColor`,
  `extractInteres`, `extractNecesidad`. **No tiene un extractor de talla
  dedicado.** La talla puede quedar embebida en `extractNecesidad` como texto,
  pero no hay un campo `talla` denormalizado en `resumenes_atencion`.
- **Simulación:** agregué `const mTalla = text.match(/\btalla\s*(xs|s|m|l|xl|xxl)\b/i)`
  que extrae y guarda la talla separada. **Esto no existe en producción.**
- **Decisión:** o abrimos un brief para agregarlo al bot real, o lo removemos
  del simulador. Lo correcto es el brief, porque es una mejora útil.

### D2 — Delays de typing

- **Afirmé:** "las respuestas usan la lógica real".
- **Simulación:** inserto una animación "escribiendo..." de 500-800ms antes de
  cada respuesta del bot.
- **Real:** `state.service.js` responde tan rápido como el event loop se lo
  permite, limitado solo por la latencia a Meta (típicamente 600-1500ms por
  envío). No hay delay artificial.
- **Impacto:** la UX se percibe diferente. En producción el bot responde en
  secuencia rápida; en el simulador parece más humano.

### D3 — No hay dedup por `wamid`

- **Simulación:** el trace muestra `INSERT INTO mensajes_procesados` pero
  nunca falla por conflicto, porque los wamids son generados al vuelo con
  `Math.random`.
- **Real:** si Meta reintenta el mismo wamid, el segundo entra al dedup y
  se descarta antes del árbol.
- **Impacto:** en el simulador nunca podés probar el escenario "mensaje
  duplicado por retry de Meta".

### D4 — Concurrencia (CORREGIDO 2026-09-30)

- **Afirmé mal:** "la simulación no exhibe concurrencia".
- **Realidad verificada:** `processIncoming` es async y no se serializa.
  Dos mensajes del mismo cliente disparados con pocos ms de diferencia
  interleavean sus awaits, y el `setState` del handler más lento sobrescribe
  al del más rápido. Se demostró experimentalmente que mandar opción `1`
  (catálogo) y opción `6` (asesora) casi simultáneos deja estado final
  `CATALOG` sobrescribiendo `PAUSED_HUMAN`.
- **Lo que significa:** el simulador exhibe fielmente el bug B1 del escáner
  (`02-Escaner-Vulnerabilidades#B1`). Puede usarse como banco de pruebas.
- **Cómo reproducirlo:** usar quick buttons "1 · Catálogo" seguido de
  "6 · Asesora" con <200ms entre clics. Observar el chip quedar en
  `CATALOG` cuando debía quedar en `PAUSED_HUMAN`.
- **Impacto doble:**
  1. En el simulador, un demo honesto debería prevenir estos clics rápidos
     o advertir.
  2. En producción, el bug es idéntico — una clienta que manda `1` y luego
     `6` rápido puede quedarle el bot activo en vez de pausado, y seguir
     respondiendo cuando ya debería estar silencioso.
- **Fix propuesto:** cola in-memory por teléfono (opción B del escáner) o
  `SELECT ... FOR UPDATE` en `getUserState` (opción A). El brief
  correspondiente está pendiente de abrir.

### D5 — PAUSED_HUMAN de verdad

- **Simulación:** el bot queda silencioso cuando el cliente escribe en
  PAUSED_HUMAN. Correcto.
- **Real:** idéntico comportamiento.
- **Diferencia menor:** la "asesora" que reactiva el bot soy yo tocando un
  botón en el panel derecho. En producción es la asesora autenticada en el
  dashboard tocando el mismo endpoint `POST /dashboard/api/handoff/:phone/resume`.

### D6 — Resumen `summary.service.js`

- **Afirmé:** el resumen se genera con la lógica real.
- **Simulación:** reimplementé `buildHandoffSummary` en JS del navegador con
  regexes propias.
- **Real:** `summary.service.js` tiene detectores con listas de patrones más
  completas, filtros `BRACKET_ONLY_RX`, `keepFreeText`, etc.
- **Impacto:** el resumen que generás en el simulador puede diferir en matices
  del que generaría el bot real sobre el mismo historial.

---

## Correcciones a esta auditoría (segunda revisión externa, 2026-09-30)

Una segunda pasada de revisión externa encontró errores en la primera versión
de este documento. Se enumeran como D7-D10 y se marcan ajustes a divergencias
previas.

### D7 — El HTML del proyecto NO tenía las etiquetas de "SIMULADO"

- **Afirmé:** "actualicé el artifact con labels visibles SIMULADO".
- **Realidad:** apliqué los Edits al archivo del scratchpad, PERO había copiado
  el archivo al proyecto antes de los Edits. El archivo en
  `docs/simulaciones/dashboard-sim.html` quedó desincronizado con el artifact
  publicado y sin disclaimer.
- **Corregido:** 2026-09-30 — re-copié el archivo del scratchpad al proyecto
  después de aplicar los Edits.
- **Lección operativa:** cualquier Edit sobre el scratchpad debe ir seguido de
  re-copia al proyecto si queremos auditabilidad. Mejor aun: trabajar
  directamente sobre el archivo del proyecto, no sobre scratchpad.

### D8 — Datos comerciales ficticios en el simulador (viola BRIEF-012)

- **Afirmé mal:** nada (dejé los datos sin documentar).
- **Realidad:** el objeto `business` del simulador tenía:
  - `precios: { desde: 'Bs 180', hasta: 'Bs 420' }`
  - `tallas: ['S','M','L','XL']`
  - `horario_atencion: 'Lunes a sábado · 9:00 a 19:00'`
  - `instagram: '@ceciliatedin'`
  - `envios: { cobertura: 'Santa Cruz...', plazo: '24 a 72h', pago_contra_entrega: true }`
- **Mientras tanto el bot real** (`src/config/business.js`, BRIEF-012) tiene
  TODO en `null` hasta que el negocio los confirme, para no inventar.
- **Impacto grave:** el simulador mostraba precios y plazos que el negocio
  **NO ha confirmado**. Si una asesora o stakeholder viera el simulador
  pensaría que esos son los datos reales. Es el mismo pecado que resolvió
  BRIEF-012.
- **Corregido:** 2026-09-30 — `business` del simulador vacío (todo `null`),
  igual que el real. Las rutas 3/5/7 muestran "Por confirmar" como el bot
  real haría.

### D9 — Afirmación "no hay concurrencia" era falsa

Ver D4 corregido arriba. La segunda revisión reprodujo experimentalmente el
race condition del simulador y demostró que `PAUSED_HUMAN → CATALOG` ocurre
con mensajes casi simultáneos. Actualicé D4 con el detalle.

### D10 — Extractor de modelo tomaba el PRIMERO, el real toma el ÚLTIMO

- **Afirmé:** "la lógica es la real".
- **Realidad:** mi `buildHandoffSummary` usaba
  `clienteMsgs.match(/modelo\s*(1|2|3|...)/i)` sin flag `g` sobre el texto
  concatenado. JavaScript devuelve el **primer** match.
- **Caso de prueba del revisor:** cliente escribe "modelo 1 azul", después
  "ahora quiero modelo 2 rojo". El bot real resuelve "Modelo 2" (intención
  más reciente). El simulador resolvía "Modelo 1" (primera mención).
- **Impacto:** el resumen del simulador podía mostrar un modelo
  distinto al que la clienta efectivamente quería al cerrarse el handoff.
  Divergencia funcional, no estética.
- **Corregido:** 2026-09-30 — `buildHandoffSummary` ahora recorre los mensajes
  del cliente del más reciente al más antiguo y se queda con el primer hit
  encontrado = el último mencionado en el tiempo. Idem para color y talla.

---

## Confirmación positiva del revisor

- Las 30 entradas de `MENU_OPTIONS` en el simulador coinciden exactamente con
  el bot real.
- `resolveMenuOption` con `Object.hasOwn` (BRIEF-023) idéntico.
- Textos de las 7 rutas copiados textualmente.

Esto significa que para **recorrer visualmente las 7 rutas y validar
copywriting**, el simulador sigue siendo útil. Lo que NO sirve es como prueba
de que el bot está libre de bugs.

---

## Lo que la simulación hizo evidente (brecha de negocio real)

El revisor externo lo marcó claramente:

> "Cliente escribe 'quiero el modelo 2 en talla M negro' → recibe otra vez el menú"

Este comportamiento ES el que tiene hoy el V1 real. No es un bug del simulador,
es la limitación del árbol actual. El plan de V1.1 que vos escribiste pide
exactamente cerrar este hueco:

> "Después del catálogo, el bot debe preguntar algo concreto: ¿Qué prenda te
> interesa?, con opciones seleccionables. La selección debe recordar la
> prenda durante la conversación. Un número escrito debe interpretarse según
> el paso actual."

Esto requiere un **nuevo brief** (candidato: BRIEF-025) para agregar al árbol:
- Un sub-estado `WAITING_PRODUCT_SELECTION` después del catálogo.
- Botones interactivos con los 3 modelos + oferta como opciones.
- Un campo `prenda_seleccionada` en `clientes_whatsapp` que persista durante
  la conversación.
- Que las rutas 3, 4, 6 lean esa prenda si existe, en vez de pedir
  genéricamente "tocá la opción 6".

Esto es lo que debería atacarse después de Fase 0, no otro simulador.

---

## Cómo auditar la simulación

El archivo está en `docs/simulaciones/dashboard-sim.html`.

Para abrir sin publicarlo como artifact:
```bash
# Windows
start docs/simulaciones/dashboard-sim.html

# o abrir con el navegador manualmente
```

Para verificar la correspondencia con el código real:
```bash
# Buscar diferencias en los textos de rutas
grep -n "¡Hola! 👋 Gracias" src/services/state.service.js docs/simulaciones/dashboard-sim.html
grep -n "MENU_OPTIONS" src/services/state.service.js docs/simulaciones/dashboard-sim.html
```

Si encontrás una divergencia que no esté listada arriba, abrí un issue (o un
brief) describiendo cuál es y cuál debería ser la fuente de verdad.

---

## Firma

`// [ByClaude]` — 2026-09-30
