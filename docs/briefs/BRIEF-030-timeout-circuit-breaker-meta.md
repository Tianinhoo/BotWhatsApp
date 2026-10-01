# BRIEF-030 — Timeout + circuit breaker en WhatsApp API (stub)

- **Dueño:** por asignar
- **Estado:** TODO (stub)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** C1 + C2 del `../auditoria/02-Escaner-Vulnerabilidades.md`.

## Objetivo

Proteger el proceso Node de la degradación de Meta. Hoy
`whatsapp.service.js` llama a Meta sin timeout explícito. Si Meta
responde lento o cuelga, cada mensaje entrante consume event loop + pool
Postgres hasta OOM.

## Alcance propuesto (a confirmar)

- `AbortController` en cada llamada a Meta con `signal` a 8s por envío.
- Retry con backoff exponencial (3 intentos: 500ms, 2s, 6s) para errores
  transitorios (5xx, timeout). No retry para 4xx (errores de payload).
- Circuit breaker (sugerido `opossum`): si 10 fallos en 60s → abrir
  circuito 5 min. Durante circuito abierto, los sends se marcan como
  `fallido` sin intentar.
- Métricas por lado para alerta: `meta_send_duration_seconds`,
  `meta_send_failures_total`, `meta_circuit_state`.

## Nota

Este brief resuelve el síntoma raíz que llevó a querer un timeout en
BRIEF-026. Con BRIEF-030 implementado, un cuelgue de Meta ya no se
propaga a la cola de BRIEF-026.
