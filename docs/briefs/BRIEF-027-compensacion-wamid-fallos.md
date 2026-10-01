# BRIEF-027 — Compensación de `wamid` tras fallo (stub)

- **Dueño:** por asignar
- **Estado:** TODO (stub — el responsable lo completa al tomarlo)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** B2 del `../auditoria/02-Escaner-Vulnerabilidades.md` +
  requisito del plan V1 *"Guardar la recepción antes de confirmarla y
  definir recuperación ante fallos, evitando duplicar respuestas"*.

## Objetivo

Hoy `tryClaimMessage` reserva el `wamid` **antes** del procesamiento. Si
el procesamiento falla (Meta 500, Postgres timeout, cualquier excepción),
el `wamid` queda claimed en `mensajes_procesados` pero el mensaje no se
respondió. Meta no reintenta (porque recibió el 200 OK), así que el
mensaje queda perdido en silencio.

## Alcance propuesto (a confirmar)

- Agregar columna `procesado_ok BOOLEAN NOT NULL DEFAULT FALSE` a
  `mensajes_procesados` (migración 009).
- Al final del procesamiento (éxito o fallo), update de la fila con el
  resultado.
- Job periódico (sugerido `node-cron` cada 5 min) que re-procesa los
  `procesado_ok = FALSE` con `procesado_en < now() - interval '30 seconds'`.
- Guard de idempotencia en los re-procesos (no mandar la misma respuesta
  dos veces si el handler ya envió algún mensaje antes de romperse).

## Decisiones abiertas

- ¿Re-procesar automático o solo loguear + alertar?
- ¿Qué pasa si el mensaje tarde ya no es relevante (ej. cliente mandó
  otro mensaje en el ínterin)?
- Interacción con BRIEF-026 (serialización): ¿el re-proceso también se
  encola por teléfono?

## Dependencia

Requiere BRIEF-026 cerrado antes para que el re-proceso respete la
serialización.
