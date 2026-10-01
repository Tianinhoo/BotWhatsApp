# BRIEF-029 — Fail-closed cuando no se puede leer el estado (stub)

- **Dueño:** Codex
- **Estado:** HECHO local (2026-10-01)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** requisito del plan V1 *"Detener el procesamiento cuando
  no se pueda consultar el estado"*.

## Objetivo

Hoy `getUserState` (en `state.service.js:302-332`) tiene un try/catch que
en caso de fallo de Postgres devuelve `ORGANIC`. Esto es degradación
silenciosa: una clienta que está en `PAUSED_HUMAN` o `CATALOG` puede
quedar re-saludada con el menú porque el bot "cree" que es nueva.

Peor: si la lectura falla pero la escritura funciona, el bot pisa el
estado real con uno recién inventado desde ORGANIC.

## Alcance propuesto (a confirmar)

- Cambiar `getUserState` para propagar el error (sin fallback).
- En `src/app.js`, atrapar explícitamente el error de lectura y:
  - NO procesar el mensaje (fail-closed).
  - Loguear con contexto (`phone` redactado, wamid).
  - Idealmente, dejar el mensaje marcado para reintento posterior
    (interacción con BRIEF-027).
- Diferenciar errores transitorios (reintentables) de errores permanentes.

## Caso edge

Para la **primera** interacción de un cliente nuevo, la consulta devuelve
0 filas (no error). Eso sigue siendo `ORGANIC` legítimo. Esta ruta no
debe cambiar — solo el **error** debe detener.

## Dependencia

Mejor si BRIEF-027 (compensación) está primero, para que los mensajes
no procesados por fail-closed se re-encolen automáticamente.

## Implementación — [ByCodex] 2026-10-01

getUserState propaga el error original. Cliente inexistente conserva ORGANIC.
Regresión del motor y webhook real: no envía, no cambia estado, no crea resumen
ante fallo SELECT. npm test en Node 24: 156 aprobadas, 6 omitidas, 0 fallidas.
La recuperación del mensaje depende de 027: el 200 temprano sigue pendiente.
Se adelanta esta corrección independiente mientras GitHub/runtime se verifican.
