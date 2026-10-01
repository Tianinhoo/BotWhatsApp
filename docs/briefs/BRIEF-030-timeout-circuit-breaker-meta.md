# BRIEF-030 — Tiempo límite de envíos Meta; circuito pendiente
<!-- [ByCodex] 2026-10-01 -->
- **Dueño:** Codex.
- **Estado:** PARCIAL: C1 implementado/verificado; C2 pendiente de evaluación.
- **Prioridad:** P0 para C1; C2 no bloquea la conexión supervisada.
- **Creado:** 2026-09-30.

## Implementado
Todos los envíos (texto, imagen, lista/menú, botones) pasan por postMessage.
Cada petición tiene timeout Axios de 8s y AbortController con temporizador de 8s:
se cancela la petición subyacente; no se libera la cola mediante Promise.race.
El temporizador se limpia tanto en aceptación como rechazo.

Sin reintentos automáticos. Un timeout no demuestra que Meta no aceptó el envío.
El contrato outbound existente conserva estado pendiente cuando no hay respuesta,
evitando declarar fallido un envío incierto o duplicarlo automáticamente.

## Verificación
Node 22.23.3: 168 casos, 162 aprobados, 6 omitidos, 0 fallidos.
Regresiones con reloj y transporte controlados comprueban cancelación, propagación,
una única petición por envío y limpieza de temporizadores en todos los caminos.

## Pendiente
Circuit breaker, métricas y política de reintentos seguros requieren evaluación
tras la primera conexión. No se agrega opossum ni node-cron en este cambio.
Este brief no limita consultas PostgreSQL ni reemplaza recepción duradera (027).
No se verificó comportamiento con Meta real.
