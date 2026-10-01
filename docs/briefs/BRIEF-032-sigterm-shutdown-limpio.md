# BRIEF-032 — SIGTERM handler + cierre limpio del pool (stub)

- **Dueño:** por asignar
- **Estado:** TODO (stub)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** G2 del `../auditoria/02-Escaner-Vulnerabilidades.md`.

## Objetivo

Railway envía `SIGTERM` al proceso Node en cada deploy. Hoy no hay
handler, así que las conexiones a Neon se cortan en caliente, transacciones
en vuelo se abandonan, mensajes en procesamiento pueden quedar a mitad.

## Alcance propuesto (a confirmar)

- Handler para `SIGTERM`:
  - Dejar de aceptar nuevas conexiones (`server.close()`).
  - Esperar a que terminen las requests en vuelo (con timeout de 10s
    de gracia).
  - Esperar a que la cola de BRIEF-026 drene (todas las promesas
    inflight resuelvan).
  - Cerrar el pool de Postgres (`await pool.end()`).
  - `process.exit(0)`.
- Timeout duro de 15s total — después `process.exit(1)` forzado para
  que Railway reinicie.
- Mismo handler para `SIGINT` (Ctrl+C en desarrollo local).

## Interacción con BRIEF-026

El handler debe poder consultar el estado de la cola in-memory (¿hay
algo inflight?). O más simple: `await Promise.all(Array.from(inflight.values()))`
antes de cerrar el pool.

## Dependencia

Requiere BRIEF-026 cerrado antes para poder esperar a la cola.
