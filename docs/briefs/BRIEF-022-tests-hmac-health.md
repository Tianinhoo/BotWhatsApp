# BRIEF-022 — Cobertura de tests para HMAC middleware y endpoint `/health`

- **Dueño:** Codex
- **Estado:** HECHO
- **Prioridad:** P1 pre-Railway
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna

## Objetivo

Agregar cobertura de tests para dos áreas de código operativo que hoy
NO están cubiertas: el middleware HMAC (`verifyMetaSignature` de BRIEF-001
+ BRIEF-009) y el endpoint `/health` (BRIEF-004).

## Contexto

Los dos componentes son críticos para el deploy a Railway:
- El HMAC es la única barrera contra webhooks falsos en producción.
- El `/health` es lo que Railway va a llamar para decidir si el deploy
  arrancó bien.

Si mañana alguien refactorea `app.js` y rompe uno de estos, no hay red
de regresión que lo atrape. La Fase 0 puede detectarlo, pero mejor
tenerlo en `npm test` para ciclo rápido.

## Alcance

**SÍ:**
- `tests/hmac.test.js`:
  - Firma válida → 200 y el resto del handler procesa el mensaje.
  - Firma inválida → 403.
  - Sin firma → 403.
  - `NODE_ENV=development` sin `APP_SECRET` → skip con warning (verificar log).
  - `NODE_ENV=test` sin `APP_SECRET` → skip.
  - `NODE_ENV=staging` sin `APP_SECRET` → 500 con log de rechazo.
  - `NODE_ENV=production` sin `APP_SECRET` → el proceso no arranca (guard de boot).
- `tests/health.test.js`:
  - BD up → `200 {ok:true, db:"up", uptime_s:<int>}`.
  - Simular `pool.query` que tira → `503 {ok:false, db:"down", error:...}`.
  - Simular timeout (>2s) → `503`.
- Los mocks pueden vivir en `tests/helpers/`.

**NO:**
- Tocar el código productivo. Solo tests.

## Aceptación

- [x] Los dos archivos de tests creados.
- [x] Al menos 7 tests HMAC + 3 tests `/health` = 10 nuevos casos.
- [x] `npm test` verde sin regresiones.
- [x] Firma `// [ByCodex] (BRIEF-022)`.
- [x] Si al escribir los tests se descubre un comportamiento inesperado
      (no un bug de test, un bug real del middleware o `/health`),
      documentarlo en el brief y abrir brief-fix separado.

## Notas técnicas

- Para probar el guard de boot de `NODE_ENV=production`, capturar el
  throw en `require('../src/app')` con `NODE_ENV=production` y sin
  `APP_SECRET`. Puede requerir invalidar `require.cache`.
- Para simular timeout en `/health`, mockear `pool.query` para que
  devuelva una promesa que nunca resuelve (o usar `setTimeout` de 2500 ms).
- Codex ya tiene infraestructura de tests con `node:test` y helpers
  probados en `tests/dashboard.test.js` y `tests/outbound.test.js`.

## Bloqueos

(Vacío.)

## Implementación y verificación — [ByCodex] (BRIEF-022)

- `tests/hmac.test.js`: 12 casos. Cubre los siete escenarios requeridos,
  rechazos por firmas corta/larga o prefijo incorrecto, cuerpo alterado y
  validación sobre los bytes originales del JSON con espacios. Los rechazos
  verifican que no se reserve el mensaje ni se invoquen servicios del árbol.
  En development/test, el warning se verifica al arrancar y permanece único
  después de procesar dos requests; con secreto configurado, se exige firma.
- `tests/health.test.js`: 4 casos. BD disponible, rechazo asíncrono, timeout
  a los 2000 ms (sin respuesta a los 1999 ms) y excepción síncrona del pool.
  Se verifican el estado HTTP, el JSON, `SELECT 1` y el uptime entero.
- `tests/helpers/app-harness.js`: carga `src/app.js` íntegro en VM, registra
  las rutas y ejecuta la cadena real del webhook, incluido el callback
  `verify` que conserva el cuerpo crudo. Usa crypto real, variables de entorno
  aisladas y reloj controlado; BD, servidor y servicios externos son simulados.
  No inicia sockets ni lee `.env` ni envía mensajes reales.
- Comando dirigido: `node --test tests/hmac.test.js tests/health.test.js`.
  Resultado: **16 aprobadas, 0 fallidas, 0 omitidas**, Node **v24.18.0**.
  El primer intento encontró `spawn EPERM` del sandbox; la ejecución aprobada
  fuera del sandbox permitió los procesos del runner y pasó sin cambios.
- **Validación final conjunta:** `npm test`, Node **v24.18.0**:
  **120 casos, 114 aprobados, 0 fallidos, 6 omitidos, 0 TODO**. Los omitidos
  corresponden a los bloques optativos de PostgreSQL (incluido su cleanup),
  no cuentan como aprobados. Las 16 pruebas de este brief sí se ejecutaron.
- Código productivo y tests anteriores sin modificar. Comparación SHA-256 de
  34 archivos de src/public/sql/scripts sin diferencias; firmas de los archivos
  nuevos verificadas y `git diff --check` sin errores de whitespace.
  No se detectaron bugs productivos en los escenarios de este brief.
  Node 22 no se verificó aquí; pendiente en la validación del despliegue.

## Bitácora del brief

- 2026-09-20 — [ByCodex] (BRIEF-022) HECHO después de `npm test` conjunto:
  114 aprobadas, 6 omitidas, 0 fallidas. Producción intacta.
- 2026-09-20 — [ByCodex] (BRIEF-022) Implementados 16 tests aislados y verificados;
  pendiente `npm test` conjunto antes de marcar HECHO.
- 2026-09-20 — Brief creado por Claude.
