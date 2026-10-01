# BRIEF-026 — Serialización del procesamiento por teléfono (B1)

- **Dueño:** Codex [ByCodex], asignado por el usuario.
- **Estado:** HECHO (implementado y verificado localmente; sin commit ni despliegue).
- **Prioridad:** P0.
- **Creado:** 2026-09-30.
- **Cerrado:** 2026-10-01.
- **Resuelve:** B1: un catálogo en vuelo sobrescribía PAUSED_HUMAN.
- **Autor del brief original:** Claude. Implementación y cierre: Codex.

## Objetivo

Procesar los mensajes de un mismo teléfono en el orden en que esta instancia
los encola. La cola se registra ANTES de esperar la deduplicación y conserva el
turno hasta que finaliza todo el trabajo, incluidos los envíos y la persistencia
del estado y resumen. Los clientes distintos avanzan en paralelo.

## Implementación entregada — [ByCodex]

- src/services/queue.service.js: processInOrder(phone, fn), Map por teléfono,
  sin dependencias nuevas. Devuelve al llamador el resultado o error.
- La Map guarda un tail que siempre resuelve; un fallo no impide ejecutar B/C
  ya encolados. Limpieza solo si el tail sigue siendo el último del teléfono.
- src/app.js: cola antes de tryClaimMessage. Dentro quedan dedup, tráfico,
  historial, lectura de estado, respuestas, transiciones y resumen. Se mantiene
  HMAC antes de procesar y la política de respuesta HTTP actual.
- Aviso único a los 10 segundos de ejecución, con teléfono redactado y duración.
  El aviso NO cancela ni libera el trabajo. El temporizador se limpia al terminar
  y no mantiene vivo el proceso por sí solo.
- tests/queue.test.js: 6 casos del módulo real con reloj controlado.
- tests/state.race.test.js: 5 regresiones del webhook y motor de estados reales,
  con base de datos y transporte simulados. Se ampliaron dos helpers existentes
  para inyectar dependencias y detener un envío de forma determinista.

## Aceptación verificada

- [x] API processInOrder(phone, fn) e integración antes de dedup.
- [x] FIFO por cliente y paralelismo entre clientes distintos.
- [x] GC no elimina un sucesor activo; Map y temporizadores quedan limpios.
- [x] Error síncrono o asíncrono llega al llamador y B/C continúan en orden.
- [x] No hay rechazos adicionales de ramas de limpieza: el llamador maneja el
      rechazo esperado con assert.rejects; el runner detecta rechazos sueltos.
- [x] Dedup lenta del primer mensaje no permite adelantar al segundo, ni sus
      escrituras de tráfico, historial o estado.
- [x] Un trabajo supera el umbral de aviso sin liberar la cola; al terminar
      catálogo y luego asesora, el estado final es PAUSED_HUMAN.
- [x] Regresión B1 usa app.js y state.service.js reales. Un mensaje posterior
      al handoff se guarda, pero no genera respuesta del bot.
- [x] Otro cliente recibe atención mientras el primer catálogo está pendiente.
- [x] Duplicado concurrente genera una sola entrada de historial y un handoff.
- [x] Firma [ByCodex], CONVENCIONES, tablero y bitácora propia actualizados.
- [x] Suite completa ejecutada después de integrar los cambios de producción.

## Evidencia de pruebas

- Antes de integrar la cola: fallaron las regresiones B1 (estado final CATALOG)
  y dedup lenta (el segundo mensaje avanzaba antes del primero). Son fallos del
  webhook anterior, no solo de una simulación visual.
- Después de integrar: node --test tests/queue.test.js tests/state.race.test.js
  → **11 aprobadas, 0 fallidas**.
- npm test, DEDUP_TEST_DATABASE=0, Node **v24.18.0** → **161 casos,
  155 aprobados, 0 fallidos, 6 omitidos**, duración reportada 759.8531 ms.
- Los 6 omitidos son bloques optativos de PostgreSQL, incluido cleanup.
  No se ejecutó integración real, no se cambió el esquema ni se migró BD.
- Node 22.x, declarado en package.json, sigue pendiente de verificación.
- Los tests usan gates/promesas y reloj controlado: no dependen de esperar
  10/15 segundos reales ni de carreras temporales probabilísticas.
- Diff revisado contra copia temporal del estado previo; cambios productivos
  limitados al nuevo servicio y la envoltura del webhook.

## Límites y dependencias pendientes

- Una instancia/proceso Node. La cola no coordina réplicas, workers ni solapamientos
  durante despliegues. Antes de ejecutar varias instancias hace falta coordinación
  distribuida. Una réplica configurada no basta si dos procesos atienden tráfico
  durante una actualización.
- Solo ordena el procesamiento de entrada del webhook. Acciones administrativas
  del dashboard y futuros reintentos deben evaluar su coordinación con esta cola.
- Cola en memoria: no es recepción duradera ni recuperación ante reinicios.
  Continúa el HTTP 200 previo a persistir; BRIEF-027 debe resolverlo.
- Continúa la extracción del primer mensaje del payload (BRIEF-028).
- Continúa el fallback de lectura de estado actual (BRIEF-029).
- Un trabajo colgado retiene su turno y avisa; límites efectivos de transporte
  y recuperación corresponden a BRIEF-030. No reenviar ciegamente un envío incierto.
- Drenaje de la cola y apagado limpio quedan para BRIEF-032.
- La configuración HMAC y conectividad deben verificarse antes de Fase 0.
- Este cierre NO declara al bot completo listo para producción.

## Bloqueos

Ninguno para el alcance de BRIEF-026. Permanecen los límites explícitos anteriores.

## Bitácora del brief

- 2026-09-30 — Brief creado por Claude tras segunda revisión externa que
  (a) ratificó que B1 es el próximo bloqueador real,
  (b) corrigió el alcance del lock (todo el pipeline por teléfono, no solo
  state-read/write), y (c) pidió documentar explícitamente la limitación
  single-instance.
- 2026-09-30 — **Tercera revisión externa ejecutó el pseudocódigo en memoria
  y detectó 3 bugs reales:**
  1. `withTimeout` liberaba la cola sin cancelar el trabajo → reproducía
     exactamente la race `CATALOG` pisa `PAUSED_HUMAN` que queríamos evitar.
     Fix: eliminado `withTimeout`. Solo quedó instrumentación (`SLOW_WARN_MS`
     emite log pero no libera). El timeout real va dentro de `whatsapp.service`
     con `AbortController` (BRIEF-030).
  2. `tryClaimMessage` afuera de la cola invertía el orden si Postgres
     respondía con latencia distinta a dos requests concurrentes. Fix:
     el `tryClaim` entra adentro del `processInOrder`. Se paga el costo
     de N-1 lookups triviales para dedup correcto Y orden preservado.
  3. `next.finally(…)` creaba una promesa rechazada no manejada
     cuando el handler fallaba. Fix: `.catch(() => {})` ANTES del `.finally`
     del GC. El llamador recibe la promesa cruda y decide; la cola
     y el GC jamás ven un rechazo suelto.
  4. Tests nuevos agregados: dedup lenta, trabajo tardío, unhandled rejection.

- 2026-10-01 — [ByCodex] Implementado por solicitud del usuario. Se reemplazó el
  pseudocódigo por la referencia a la implementación probada: tail interno resuelto,
  resultado original al llamador, dedup dentro y aviso sin cancelación. Regresiones
  fallaron antes y pasaron después; cierre con 155 aprobadas/6 omitidas/0 fallidas.
  Sin commit, PR, migraciones, envíos reales ni despliegue.
