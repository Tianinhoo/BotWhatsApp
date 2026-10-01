# BRIEF-028 — Iterar todos los `entry.changes` y `value.messages` (stub)

- **Dueño:** por asignar
- **Estado:** TODO (stub)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** A4 del `../auditoria/02-Escaner-Vulnerabilidades.md` +
  requisito del plan V1 *"Procesar todos los mensajes recibidos en un
  mismo webhook"*.

## Objetivo

Hoy `src/app.js:208-215` extrae solo `req.body.entry[0].changes[0].value.messages[0]`.
En un burst de tráfico, Meta puede agrupar varios `entry`, varios
`changes` por entry y varios `messages` por change. Hoy se pierden
silenciosamente todos menos el primero.

## Alcance propuesto (a confirmar)

- Iterar `for (const entry of req.body.entry || [])`.
- Iterar `for (const change of entry.changes || [])`.
- Iterar `for (const message of change.value.messages || [])`.
- Cada `message` entra a su propio `processInOrder(phone, ...)` (que
  BRIEF-026 provee).
- También procesar `change.value.statuses` (BRIEF-029 lo cubre más
  explícitamente — aquí solo iterar).

## Dependencia

Requiere BRIEF-026 cerrado antes (cada mensaje individualizado se encola
por su propio teléfono).
