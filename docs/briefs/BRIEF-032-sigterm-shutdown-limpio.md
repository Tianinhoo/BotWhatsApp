# BRIEF-032 — SIGTERM handler + cierre limpio del pool

- **Dueño:** Claude
- **Estado:** HECHO local (2026-10-01)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Cerrado:** 2026-10-01
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

## Implementación — [ByClaude] 2026-10-01

- `src/services/queue.service.js` ahora exporta `drain()` — snapshot sincrónico
  del Map `inflight` + `Promise.all` que swallow errores. Los test harnesses
  verifican FIFO vacía resuelve rápido, cola llena espera, errores no propagan.
- `src/services/inbox.service.js` ahora expone `stop()` — hace `clearInterval`
  del timer de recovery y devuelve la recovery en vuelo si la hay.
- `src/app.js` captura `app.listen(...)` en `const server` y registra
  `process.on("SIGTERM", ...)` y `process.on("SIGINT", ...)`.
  Secuencia del shutdown: `server.close()` → `inbox.stop()` → `drainQueue()` →
  `pool.end()` → `process.exit(0)`. Timeout duro de 15s con `exit(1)` de respaldo
  (`setTimeout.unref()` para no bloquear si el ciclo cierra antes).
- `tests/queue.test.js` + `tests/inbox.test.js` + `tests/shutdown.test.js` cubren
  las tres piezas. `tests/helpers/app-harness.js` extendido con `signalHandlers`
  separado y server stub con `.close(cb)`.
- Suite completa Node 24.18.0 con `DEDUP_TEST_DATABASE=0`: 193 tests, 186 pass,
  7 skipped (bloques PostgreSQL), 0 fail.
