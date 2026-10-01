# BRIEF-024 — Tests para el hardening del dashboard (rate limit + Secure)

- **Dueño:** Antigravity
- **Estado:** HECHO
- **Prioridad:** P1 pre-Railway
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** BRIEF-018 (HECHO)

## Objetivo

Cubrir con tests el rate limit del login y el flag `Secure` de la
cookie, que fueron implementados en BRIEF-018 sin regresión. Es una
violación explícita de `CONVENCIONES.md §9` que se debe cerrar antes
de deploy.

## Contexto

Antigravity entregó BRIEF-018 con código funcional pero:
- SIN tests de regresión.
- Sin `npm test` ejecutado explícitamente sobre el nuevo comportamiento.

Como el rate limiter es lógica temporal (ventanas, contadores, bloqueos),
merece cobertura antes de exponer el dashboard en Railway.

## Alcance

**SÍ:**
- `tests/dashboard-login.test.js` con al menos estos casos:
  - 5 intentos incorrectos consecutivos → el 5to responde 401.
  - 6to intento → 429 (bloqueado).
  - Intento con password correcto durante bloqueo → 429 (no da entrada aunque el password sea bueno).
  - Bloqueo expira a los 10 min → siguiente intento fallido responde 401.
  - Ventana de 5 min expira sin llegar a 5 fallos → contador resetea.
  - Password correcto limpia el contador.
  - `Set-Cookie` incluye `Secure` cuando `NODE_ENV=production`.
  - `Set-Cookie` NO incluye `Secure` en dev.
  - Cada IP tiene su propio contador (no se mezclan).
- Reutilizar helpers existentes en `tests/helpers/` para simular `req.ip` y avanzar el reloj.

**NO:**
- Tocar `dashboard.js`. Si el test detecta un bug de la implementación
  de Antigravity, se abre brief-fix separado.

## Aceptación

- [ ] Nuevo `tests/dashboard-login.test.js` con 9+ casos.
- [ ] `npm test` verde (mantener 141 pass + los nuevos, sin regresiones).
- [ ] Firma `// [ByCodex] (BRIEF-024)` (o quien lo tome).
- [ ] Si aparece un bug real en `dashboard.js`, abrir brief separado.

## Notas técnicas

Un bug latente que se podría descubrir: en el código actual, después de
que un bloqueo expira, el contador NO se resetea. El siguiente fallo
lo lleva a `intentos: 6+1=7` y dispara bloqueo inmediato. Puede o no
ser intencional. Documentarlo en los tests con el comportamiento
esperado; si se decide cambiar, abrir brief-fix.

## Bloqueos

(Vacío.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude para cubrir el hueco de tests que
  quedó abierto tras BRIEF-018 (Antigravity entregó código sin regresión,
  violando CONVENCIONES.md §9).
