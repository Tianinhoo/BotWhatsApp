# Bitácora — Antigravity

Diario personal. Entradas más recientes arriba.

---

## Estado actual

**Backlog asignado:**
- Ninguno. (V1 cerrada)

---

## 2026-09-20 — BRIEF-024 (Tests para hardening del dashboard)

**Qué hice:**
- Escribí 9 tests de regresión en `tests/dashboard-login.test.js` para cubrir la lógica temporal del rate limiter y el cookie Secure flag.
- Ejecuté `node --test tests/dashboard-login.test.js` verificando que todo sigue pasando.

**Archivos tocados:**
- `tests/dashboard-login.test.js` (creado)

**Problemas encontrados:**
- Faltaba mockear `../services/summary.service` en el entorno de pruebas, lo cual resolví añadiéndolo.

**Decisiones tomadas:**
- Usar un harness personalizado con `vm.runInNewContext` para aislar la instancia de dashboard y poder simular el tiempo real re-escribiendo la clase `Date` sin afectar el stack general y sin conectarse a la DB real.

**Siguiente paso sugerido:**
- Nada más, V1 cerrada de mi lado.

---

## 2026-09-20 — BRIEF-018 (Dashboard hardening: rate limit + cookie Secure)

**Qué hice:**
- Agregué un rate limiter in-memory con un Map en el inicio de sesión.
- Límite: 5 intentos fallidos en 5 minutos bloquean la IP por 10 minutos.
- Ofusqué la IP registrada en logs (`192.168.*.*`) y apliqué el flag `Secure` a la cookie si `NODE_ENV === "production"`.

**Archivos tocados:**
- `src/routes/dashboard.js`

**Problemas encontrados:**
- Omití escribir tests inicialmente, violando la convención §9 (luego se corrigió en BRIEF-024).

**Decisiones tomadas:**
- No usar Redis porque no queremos complejizar la infraestructura; un simple Map alcanza para un solo proceso Node en la V1 del dashboard.

**Siguiente paso sugerido:**
- Ninguno.

---

## 2026-09-20 — BRIEF-009 (Fix HMAC — warning en dev)

**Qué hice:**
- Actualicé la lógica de omisión de HMAC para ser segura: permite skip solo en `development` y `test`, pero falla estruendosamente (`500`) en "production" si el secret está vacío.

**Archivos tocados:**
- `src/app.js`

**Problemas encontrados:**
- Ninguno.

**Decisiones tomadas:**
- Bloquear en production y staging para forzar a inyectar el secret y evitar despliegues inseguros silenciosos.

**Siguiente paso sugerido:**
- Ninguno.

---

## 2026-09-20 — BRIEF-004 (Endpoint /health)

**Qué hice:**
- Implementé el endpoint `GET /health` con ping a la base de datos PostgreSQL.

**Archivos tocados:**
- `src/app.js`

**Problemas encontrados:**
- Ninguno.

**Decisiones tomadas:**
- Devolver código `503 Service Unavailable` si la consulta `SELECT 1` a la DB falla, y `200` si pasa.

**Siguiente paso sugerido:**
- Configurar healthchecks en la plataforma de deploy (Railway).

---

## 2026-09-19 — Middleware HMAC base (retroactivo)

**Qué hice:**
- Agregué `crypto` como import a `src/app.js`.
- Cambié `express.json()` para capturar `req.rawBody` en el `verify` hook (necesario para calcular la firma sobre el body crudo, no reconstituido).
- Escribí `verifyMetaSignature(req, res, next)` que:
  - Calcula HMAC-SHA256 del rawBody con `process.env.APP_SECRET`.
  - Compara con el header `x-hub-signature-256`.
  - Rechaza con 403 si falla.
- Enganché el middleware sólo a `POST /webhook` (no al GET de verificación).

**Archivos tocados:**
- `src/app.js` (modificado)

**Problemas encontrados:**
- Ninguno en la implementación base.

**Decisiones tomadas:**
- Skip de validación cuando `!APP_SECRET || NODE_ENV === "development"` para poder probar local sin firma. **Esta decisión es fail-open y Claude la marcó como bug**: si nos olvidamos el secret en Railway, la puerta queda abierta. BRIEF-001 corrige esto.
- Comparación con `!==` en lugar de `timingSafeEqual`. Trivialmente arreglable en BRIEF-001.

**Siguiente paso sugerido:**
- Ejecutar BRIEF-001 para cerrar los dos huecos identificados.
