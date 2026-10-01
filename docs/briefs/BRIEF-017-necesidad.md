# BRIEF-017 — Campo "Necesidad" en el Resumen para Atención

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P0 pre-Fase 0 (bloquea BRIEF-010)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** puede hacerse en el mismo pase que BRIEF-015 (mismo dueño, mismo archivo).

## Objetivo

Agregar el cuarto campo del "Resumen para Atención" que estaba en el
pedido original y que Claude perdió al implementar: **Necesidad**.

## Contexto

El pedido original al equipo fue:
> "Origen, Modelo, Interés **y Necesidad** del cliente"

En la implementación quedaron 3 (`origen_trafico`, `modelo_seleccionado`,
`interes_color`). El cuarto se perdió. La revisión externa lo detectó y
confirmó que era parte del alcance.

**Diferencia entre "Interés" y "Necesidad" que usamos como definición:**
- **Interés**: qué producto / color / talla nombró el cliente
  (ej: "Modelo 2 en negro talla M").
- **Necesidad**: para qué / cuándo / para quién lo quiere
  (ej: "para un evento el sábado", "es regalo para mi hermana",
  "quiero devolverlo", "problema con un pedido anterior").

La necesidad casi siempre es texto libre. En V1 sin extractor semántico,
lo que podemos hacer es:
- Recolectar los mensajes de texto libre del cliente (excluyendo labels
  del menú) y usarlos como "necesidad candidata".
- Si no hay texto libre suficiente, marcar como **"Por confirmar"** (fallback
  que confirmó el humano).

## Alcance

**SÍ:**
- Extender el JSON de resumen con `necesidad`.
- Agregar `extractNecesidad(messages)` en el módulo unificado que
  crea BRIEF-015.
- Persistirlo tanto en la columna denormalizada (nueva columna en
  `resumenes_atencion`, migración `007_necesidad.sql`) como en el JSONB.
- Exponerlo en los endpoints del dashboard.
- Fallback `"Por confirmar"` cuando no hay data suficiente.

**NO:**
- Preguntar al cliente antes de derivar. Eso es V1.1 (habría que agregar
  un mini-flujo tipo `ESPERANDO_NECESIDAD` con un estado nuevo).
- Usar IA para clasificar necesidad. V2.

## Aceptación

- [ ] Migración `007_necesidad.sql`:
  ```sql
  ALTER TABLE resumenes_atencion
    ADD COLUMN IF NOT EXISTS necesidad TEXT;
  ```
- [ ] `summary.service.js` (creado por BRIEF-015) exporta `extractNecesidad(messages)`.
- [ ] `buildHandoffSummary` retorna `necesidad: string | "Por confirmar"`.
- [ ] `saveHandoffSummary` persiste el nuevo campo denormalizado y en el JSONB.
- [ ] Endpoint `GET /dashboard/api/handoff/:phone` incluye `necesidad`.
- [ ] Dashboard muestra los 4 campos: Origen, Modelo, Interés, Necesidad.
- [ ] Prueba: cliente escribe *"Es para el cumple de mi hermana el sábado"* → `necesidad` contiene esa frase.
- [ ] Prueba: cliente solo tocó opciones del menú, nunca texto libre → `necesidad = "Por confirmar"`.
- [ ] Firma `// [ByClaude] (BRIEF-017)` en los bloques nuevos.

## Notas técnicas

Regla propuesta para `extractNecesidad`:
- Tomar todos los mensajes del cliente que son texto libre (no labels de menú).
- Si NO hay ninguno → `"Por confirmar"`.
- Si hay 1 → devolver ese texto tal cual (limitado a 300 chars).
- Si hay varios → concatenar los últimos 3 con `" · "` (para no perder contexto).
- Después del extractor, si detectamos que la frase entera coincide
  exactamente con el `modelo_seleccionado` o `interes_color` ya guardado
  (redundancia), devolver `"Por confirmar"` en lugar de duplicar.

Ejemplo:

```js
// [ByClaude] (BRIEF-017) Necesidad = texto libre del cliente, sin marcas
// de sistema, con fallback "Por confirmar".
function extractNecesidad(clientMessages, alreadyCaptured = {}) {
  const bracketOnly = /^\[.*\]$/;
  const freeTexts = clientMessages
    .map(m => (m.contenido || "").trim())
    .filter(t => t && !bracketOnly.test(t));

  if (freeTexts.length === 0) return "Por confirmar";

  const combined = freeTexts.slice(-3).join(" · ").slice(0, 300);

  const duplicated =
    combined === alreadyCaptured.modelo ||
    combined === alreadyCaptured.interes;

  return duplicated ? "Por confirmar" : combined;
}
```

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude tras confirmación del humano de que "Necesidad" estaba en el pedido original y se perdió en la implementación.
- 2026-09-20 — Claude cerró junto con BRIEF-015 (mismo módulo). Migración `sql/migrations/007_necesidad.sql` aplicada (segunda migración con número 007 en el repo — coexiste sin conflicto con `007_mensajes_estado_envio.sql` de Codex; ver nota abajo). Nueva columna `necesidad TEXT`, persistida en `saveHandoffSummary` y expuesta en `listHandoffSummaries` + `dashboard.js`. Fallback `"Por confirmar"` cuando el cliente no dejó texto libre útil. 4 tests dedicados en `tests/summary.test.js`.

**Nota de proceso**: hay dos migraciones con número 007 (`007_mensajes_estado_envio.sql` de BRIEF-011 y `007_necesidad.sql` de este). Técnicamente no colisiona (ids distintos en `schema_migrations`, ambas aditivas sobre tablas distintas). Pero es un olor de proceso: cuando dos briefs paralelos generan migración, hay que coordinar el número. Regla nueva a documentar en `CONVENCIONES.md` como parte del cierre de esta ronda.
