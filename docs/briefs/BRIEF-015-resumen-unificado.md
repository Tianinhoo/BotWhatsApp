# BRIEF-015 — Resumen: filtrar labels de menú + unificar los dos builders

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P0 pre-Fase 0 (bloquea BRIEF-010)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna

## Objetivo

Que la asesora vea SIEMPRE un resumen coherente, independientemente de
cómo lo cargue el dashboard, y que el campo `interes_color` refleje el
verdadero interés del cliente, no la opción del menú que tocó.

## Contexto

Dos problemas encontrados por la revisión externa:

**Problema A — el "6" como interés.**
En `src/services/messages.service.js:163` — `buildHandoffSummary` scan
`getLastClientMessages`, que trae TODOS los mensajes del cliente,
incluidos los `[Opción del menú: X]` que persiste `app.js` cuando el
cliente toca la lista interactiva. Si el último mensaje del cliente
antes del handoff es "6" (la opción "Hablar con asesor") o su label,
eso queda como `interes_color` cuando el color no se detectó.

**Ejemplo real reproducido**: cliente escribe *"Quiero el Modelo 2 en
talla M"* y después toca la opción "6". El resumen guardado dice:
- `modelo_seleccionado`: "Modelo 2" ✅
- `interes_color`: "6" ❌ (debería ser "Modelo 2 talla M" o similar).

**Problema B — dos builders con criterios distintos.**
Existen dos formas de construir el resumen:
1. `messages.service.js:163` — el mío, persiste al pasar a `PAUSED_HUMAN`
   en `resumenes_atencion`. Detecta modelo por regex `MODEL_PATTERNS` y
   color por `COLOR_KEYWORDS`. Fallback: último mensaje del cliente.
2. `routes/dashboard.js:253` (`buildHandoffSummary` local de OpenCode) —
   reconstruye on-demand contra `mensajes + trafico_clientes`. Detecta
   modelo con regex distinta (`modelo\s*(\d+|uno|dos|tres)`, además
   acepta "uno/dos/tres"). Detecta interés como la última opción del
   menú tocada o el último texto libre.

Los dos endpoints coexisten. La asesora puede ver resúmenes
contradictorios del mismo cliente según qué endpoint pegue el frontend.

## Alcance

**SÍ:**
- Extraer la lógica de detección (modelo, color, interés, necesidad) a
  un único módulo compartido, por ejemplo `src/services/summary.service.js`.
- Los dos endpoints (persistencia y on-demand) usan **el mismo módulo**.
- Filtrar los `[Opción del menú: X]` (y variantes tipo `[Interacción con el menú]`) del scanner de "último mensaje" y del scanner de "interés".
- Unificar la regex de modelos entre ambos (aceptar "modelo 1/2/3", "uno/dos/tres", "Oferta del día").
- Agregar el campo `necesidad` (ver BRIEF-017 — mismo dueño, puede hacerse en el mismo pase).

**NO:**
- Cambiar el esquema de `resumenes_atencion` — el campo JSONB permite agregar `necesidad` sin migración.
- Rediseñar el UI del dashboard — solo pasar por el módulo unificado.

## Aceptación

- [ ] Existe `src/services/summary.service.js` con funciones `detectModel(messages)`, `detectColor(messages)`, `extractInteres(messages)`, `extractNecesidad(messages)`, `buildHandoffSummary({phone, traffic, reason})`.
- [ ] `messages.service.js` re-exporta desde el nuevo módulo (retro-compat) o importa directamente.
- [ ] `routes/dashboard.js` usa el nuevo módulo en lugar del builder local.
- [ ] Prueba reproducida por la revisión pasa: cliente escribe "Quiero el Modelo 2 en talla M" + "6" → `interes_color` = "Modelo 2 talla M" (o el detalle mejor que salga), NO "6".
- [ ] Los `[Opción del menú: X]` NUNCA quedan en `interes_color` ni en `ultimo_mensaje_cliente` del resumen.
- [ ] Test unitario para cada extractor con al menos 3 casos por función (positivo, negativo, borde).
- [ ] Firma `// [ByClaude] (BRIEF-015)` en los bloques movidos/nuevos, preservando firmas anteriores.

## Notas técnicas

Filtrar labels del scanner: cambiar `getLastClientMessages` para excluir
mensajes cuyo contenido matchee `^\[.*\]$` (bracket-marks internos), o
filtrar en el scanner del summary. Preferible en el summary — así el
dato crudo de `mensajes` no cambia.

Ejemplo de `extractInteres`:

```js
// [ByClaude] (BRIEF-015) Interés = último texto libre real, ignorando
// marcas de sistema (opciones de menú, tags de tipo, etc.).
function extractInteres(clientMessages) {
  const bracketOnly = /^\[.*\]$/;
  const reversed = [...clientMessages].reverse();
  for (const m of reversed) {
    const t = (m.contenido || "").trim();
    if (t && !bracketOnly.test(t)) return t;
  }
  return null;
}
```

Y `buildHandoffSummary` combina `modelo + color + interes` con la regla:
- Si hay modelo Y color detectados → `"Modelo X · color Y"`.
- Si hay modelo pero no color → `"Modelo X"` + `interes` en un campo aparte.
- Si no hay modelo ni color pero hay interés → ese interés.
- Si no hay nada → `"Por confirmar"`.

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude tras revisión externa. Sube a P0 pre-Fase 0 por decisión del humano.
- 2026-09-20 — Claude cerró el brief. Creó `src/services/summary.service.js` como fuente única, refactorizó `messages.service.js` (delegación) y `dashboard.js` (delegación + fix del "6" al preferir el guardado solo si no parece basura). `npm test`: 47 pass / 0 fail / 2 skip (integración Postgres opcional). Los dos fallos iniciales (`assert.notMatch` inexistente y dedup demasiado agresivo de necesidad contra interés) los detectó Codex en su bloqueo y los corregí en el mismo pase.
