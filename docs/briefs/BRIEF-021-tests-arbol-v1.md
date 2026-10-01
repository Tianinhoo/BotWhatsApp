# BRIEF-021 — Cobertura de tests para el árbol V1 (`state.service.js`)

- **Dueño:** Codex
- **Estado:** HECHO
- **Prioridad:** P1 pre-Railway (útil para atrapar regresiones en Fase 0)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna (BRIEF-011, 014, 015 y 016 ya cerrados; el archivo está estable)

## Objetivo

Cubrir con tests unitarios el árbol conversacional V1 completo. Hoy la
suite tiene cobertura fuerte en dashboard, envíos, dedup y summary, pero
**la lógica del árbol de 7 rutas en `state.service.js` no tiene tests**.
Es un hueco identificado en el reporte de estado del 2026-09-20.

## Contexto

`src/services/state.service.js` contiene:
- Constantes `STATES` (`ORGANIC`/`MENU`/`CATALOG`/`PAUSED_HUMAN`) y `MENU_OPTIONS`.
- `getUserState` / `setUserState` / `resumeBotForClient`.
- `extractSelection` / `resolveMenuOption` / `requestedMenu`.
- Las 7 rutas del árbol (`replyCatalog`, `replyNewModels`, `replyPricesAndSizes`,
  `replyStock`, `replyShipping`, `replyDeriveToHuman`, `replyContact`).
- `processMenuOption` (dispatcher).
- `greetAndShowMenu` / `showMenu`.
- `registerTraffic` / `getTraffic` (tráfico, [ByOpenCode]).

Nadie tiene test unitario. Los bugs que pudieran aparecer en Fase 0
sobre estas funciones no tienen red de regresión.

## Alcance

**SÍ:**
- Nuevo archivo `tests/state.service.test.js` con al menos estos casos:
  - `resolveMenuOption`: aceptar los 3 modos de entrada (número "1"-"7", id
    interactivo `catalogo`/`modelos`/..., palabra clave `catálogo`/`asesor`/...).
    Casos borde: string vacío, `null`, `undefined`, texto que no matchea.
  - `extractSelection`: leer correctamente `interactive.list_reply.id`,
    `interactive.button_reply.id`, y `text.body`. Priorizar interactivo.
  - `requestedMenu`: verificar palabras que reabren menú y las que no.
  - `processMenuOption` con las 7 opciones — mockear `sendTextMessage`/
    `sendImageMessage`/`setUserState`/`markCatalogSent`/`getTraffic`/
    `saveHandoffSummary` y verificar que:
    - Se envía el número correcto de mensajes.
    - Se hace la transición de estado correcta.
    - La ruta 6 dispara la generación del resumen.
  - `greetAndShowMenu`: manda saludo + menú principal, deja al cliente en `MENU`.
  - `showMenu` con y sin hint.
- Los mocks pueden vivir en `tests/helpers/` (Codex ya usa esa carpeta).

**NO:**
- Tests de integración contra la BD real (opcionales, con `DEDUP_TEST_DATABASE=1`
  si querés cubrir get/setUserState, pero no bloqueante).
- Tocar la lógica de `state.service.js`. Solo tests; si aparece un bug al
  cubrirla, se abre brief aparte.

## Aceptación

- [x] `tests/state.service.test.js` creado.
- [x] Al menos 15 tests unitarios cubriendo los puntos del alcance.
- [x] `npm test` verde (sin regresiones sobre 52 pass existentes).
- [x] Firma `// [ByCodex] (BRIEF-021)` en el archivo nuevo.
- [x] Documentar en el brief cualquier bug latente detectado durante la
      cobertura (si aparece uno, abrimos brief nuevo).

## Notas técnicas

**Sugerencia de mocks** (Codex ya tiene experiencia con `tests/helpers/`):

```js
// [ByCodex] (BRIEF-021) Doble de whatsapp.service para no enviar mensajes reales.
const sentMessages = [];
const fakeWhatsapp = {
  sendTextMessage: async (phone, text) => { sentMessages.push({ phone, text, type: "text" }); return { ok: true }; },
  sendImageMessage: async (phone, imageId, caption) => { sentMessages.push({ phone, imageId, caption, type: "image" }); return { ok: true }; },
  sendMainMenu: async (phone) => { sentMessages.push({ phone, type: "menu" }); return { ok: true }; }
};
```

Como `state.service.js` usa `require("./whatsapp.service")`, se puede
inyectar con `require.cache` o usar un stub en `tests/helpers/`.
Otra opción más limpia: si Codex ve que el módulo es difícil de testear
sin refactor, abrir un brief chico para inyectar dependencias.

## Bloqueos

- 2026-09-20 — [ByCodex] (BRIEF-021) El runner dirigido encontró `spawn EPERM`
  en el sandbox. Resuelto al ejecutar `npm test` fuera del sandbox con aprobación;
  no requirió cambios de código. Sin bloqueos pendientes para esta cobertura.

## Implementación y verificación — [ByCodex] (BRIEF-021)

- **46 tests nuevos** en `tests/state.service.test.js`. Cubren constantes, números,
  IDs y alias del menú, selección interactiva/textual, reapertura del menú, las
  siete rutas, saludo y menú con/sin hint. Verifican cantidad/orden/destinatario
  de envíos, llamadas al registrador de salida, imágenes y captions, marca del
  catálogo, transición persistida y generación/guardado del resumen en ruta 6.
- Casos adicionales: catálogo repetido, datos comerciales confirmados o ausentes,
  errores de transporte y de resumen, get/set/resume de estado y register/get
  de tráfico con consultas parametrizadas. Se caracteriza el fallback existente
  a ORGANIC ante error de lectura; no se modifica esa política.
- `tests/helpers/state-harness.js` ejecuta **el módulo productivo íntegro** en VM.
  Inyecta dobles explícitos de BD, transporte, registrador de salida, catálogo,
  resumen, logger y configuración. Las transiciones se observan en las consultas
  reales emitidas por `setUserState`, sin reemplazar la lógica del árbol.
  El doble de salida invoca el callback real de envío de la ruta; la persistencia
  de `sendAndRecord` sigue cubierta por la suite independiente de BRIEF-011.
- **Validación final conjunta:** `npm test` en Node **v24.18.0**:
  **120 casos, 114 aprobados, 0 fallidos, 6 omitidos, 0 TODO**. Se conservan las
  52 pruebas previas aprobadas y se agregan 46 de este brief + 16 de BRIEF-022.
  Los seis omitidos corresponden a los bloques optativos de PostgreSQL (incluido
  su cleanup); no cuentan como aprobados. No se ejecutó integración real porque
  esta entrega solo agrega unitarios. Node 22.x sigue para la validación del deploy.
- `git diff --check` sin errores de whitespace. Firmas verificadas en los cinco
  archivos nuevos de tests/helpers de ambos briefs. Comparación SHA-256 antes y
  después: **34 archivos de src/public/sql/scripts sin cambios**. Sin modificación
  productiva, migraciones, acceso a BD ni mensajes reales en estas pruebas.

## Bug detectado — [ByCodex] (BRIEF-021)

`resolveMenuOption("constructor")` y `resolveMenuOption("__proto__")` devuelven
valores heredados de `Object.prototype`, aunque no son opciones propias del mapa.
`processMenuOption` termina con `{ok:false, reason:"unknown_id"}`, sin envíos.
El webhook retorna tras invocarlo porque el valor inicial era truthy y no muestra
el fallback. Reproducido con el módulo real y dobles aislados; inspección del
dispatcher en `app.js` confirma el retorno temprano.

Registrado en [BRIEF-023](BRIEF-023-fix-menu-prototype.md), **TODO**, sin aplicar el
fix. El brief separado incluye reproducción y regresiones requeridas. La suite
verde de esta entrega no implica que ese defecto esté corregido.

## Bitácora del brief

- 2026-09-20 — [ByCodex] (BRIEF-021) HECHO: 46 pruebas nuevas; suite conjunta
  114 aprobadas/6 omitidas/0 fallidas. Bug de claves heredadas separado en BRIEF-023.
- 2026-09-20 — Brief creado por Claude para cerrar un hueco de cobertura identificado en el reporte de estado.
