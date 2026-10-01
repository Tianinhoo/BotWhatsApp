<!-- // [ByCodex] (BRIEF-023) Bug separado detectado al cubrir BRIEF-021; no implementado. -->
# BRIEF-023 — Rechazar claves heredadas del mapa de opciones del menú

- **Dueño:** Claude (reasignado desde Codex — el código de `resolveMenuOption` es de Claude en `state.service.js`)
- **Estado:** HECHO
- **Prioridad:** P1 (corrección del parser de entrada)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna; hallazgo de BRIEF-021

## Objetivo

Aceptar únicamente claves propias de `MENU_OPTIONS`. Un texto que no es una
opción debe devolver `null` y seguir el saludo/menú de fallback del webhook.

## Contexto y evidencia

En `src/services/state.service.js`, `resolveMenuOption` consulta
`MENU_OPTIONS[key] || null` sobre un objeto con prototipo. Los textos
`constructor` y `__proto__` resuelven a propiedades heredadas truthy:

| Entrada | Opción propia | Resultado del dispatcher | Envíos |
|---|---|---|---|
| `constructor` | false | `{ok:false, reason:"unknown_id"}` | 0 |
| `__proto__` | false | `{ok:false, reason:"unknown_id"}` | 0 |

`src/app.js` toma ese resultado inicial como opción válida, llama al dispatcher
y retorna sin revisar su `ok`. El cliente recibe silencio en lugar de la ayuda
habitual. Se trata de una lectura indebida del prototipo; en esta reproducción
no se modificó ningún prototipo ni se ejecutaron funciones heredadas.

## Reproducción local

Desde la raíz del repositorio, sin DB ni red:

```powershell
# // [ByCodex] (BRIEF-023) Reproduce el fallo sobre el módulo productivo real aislado.
@'
// [ByCodex] (BRIEF-023) Diagnóstico; no forma parte de npm test.
const { fixture } = require('./tests/helpers/state-harness');
(async () => {
  for (const raw of ['constructor', '__proto__']) {
    const f = fixture();
    console.log({ raw, matched: Boolean(f.state.resolveMenuOption(raw)),
      ownOption: Object.hasOwn(f.state.MENU_OPTIONS, raw),
      result: await f.state.processMenuOption('59170000001', raw), sent: f.sent.length });
  }
})();
'@ | node
```

Verificado en Node v24.18.0: `matched: true`, `ownOption: false`,
`reason: 'unknown_id'`, `sent: 0`. Resultado esperado tras el fix:
`matched: false`, `reason: 'no_match'`; el webhook aplica su fallback normal.

## Alcance

- SÍ: endurecer `resolveMenuOption` para consultar solo propiedades propias
  (por ejemplo `Object.hasOwn`) y agregar regresiones para ambas entradas,
  incluyendo espacios y mayúsculas tras la normalización.
- SÍ: verificar a nivel webhook que se emite saludo/menú o ayuda según el
  estado previo, y que las siete opciones válidas mantienen su comportamiento.
- NO: cambiar las rutas del árbol, los textos, la BD o el comportamiento HMAC.
- NO: mezclar esta corrección con BRIEF-021/022. Estos entregan cobertura;
  el código productivo quedó intacto. Este brief aún no se implementó.

## Aceptación

- [x] Las regresiones de `constructor` y `__proto__` verifican `null` tras el fix (agregadas en `tests/menu-prototype.test.js`).
- [x] `resolveMenuOption` devuelve `null` para ambas entradas normalizadas.
- [x] El dispatcher devuelve `no_match`, sin enviar ni cambiar estado por sí solo.
- [x] El webhook sigue el fallback esperado (no llega a entrar al `if (option)` porque option ahora es `null`).
- [x] Las 10 combinaciones válidas de 1–7 e IDs siguen matcheando post-fix.
- [x] `npm test` verde: 141 tests / 135 pass / 0 fail / 6 skip. Firma `// [ByClaude] (BRIEF-023)` en el bloque modificado.
- [x] TAREAS y bitácora actualizados.

## Bloqueos

Sin bloqueo técnico. Fuera del alcance autorizado de tests de BRIEF-021/022;
pendiente de tomar esta corrección como entrega separada.

## Bitácora del brief

- 2026-09-20 — [ByCodex] (BRIEF-023) Bug reproducido durante BRIEF-021;
  documentación creada, sin cambios productivos ni implementación del fix.
- 2026-09-20 — [ByClaude] (BRIEF-023) Reasignado a Claude por afinidad
  (código de `resolveMenuOption` es suyo). Fix aplicado en `src/services/state.service.js`
  con `Object.hasOwn(MENU_OPTIONS, key)` antes del retorno. Test de regresión
  nuevo en `tests/menu-prototype.test.js`: 21 casos cubriendo las 8 claves
  heredadas conocidas (constructor, __proto__, toString, hasOwnProperty,
  valueOf, isPrototypeOf, propertyIsEnumerable, toLocaleString) +
  normalización (mayúsculas y espacios) + dispatcher (no_match, sin envíos)
  + 10 casos positivos verificando que las 7 opciones válidas siguen
  matcheando después del fix. `npm test`: **141 tests, 135 pass, 0 fail,
  6 skip**. Sin cambios en tests ni código de otros autores.
