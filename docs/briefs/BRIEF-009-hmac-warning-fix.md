# BRIEF-009 — Fix HMAC: warning en dev + cubrir `NODE_ENV` no seteado

- **Dueño:** Antigravity
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** BRIEF-001 (HECHO)

## Objetivo

Cerrar los dos huecos que quedaron abiertos en el middleware HMAC tras
BRIEF-001, sin cambiar el comportamiento validado.

## Contexto

Después de BRIEF-001, el middleware quedó así:

```js
if (!process.env.APP_SECRET || process.env.NODE_ENV === "development") {
  return next();
}
```

Dos problemas menores pero reales:

1. **No hay warning cuando se hace skip.** Si arrancás local sin
   `APP_SECRET`, el middleware acepta todo silenciosamente. No queda
   rastro en los logs, y si en algún momento pensás "¿por qué estoy
   recibiendo webhooks sin firma?", no hay pista.

2. **`NODE_ENV` no seteado (undefined) hace skip.** El guard de arranque
   (línea 373) sólo se dispara cuando `NODE_ENV === "production"`. Si
   corrés con `NODE_ENV=staging` (o cualquier otro valor) sin
   `APP_SECRET`, el middleware sigue haciendo skip. En la práctica el
   caso es raro, pero es una asimetría que vale la pena cerrar.

## Alcance

**SÍ:**
- Modificar `verifyMetaSignature` en `src/app.js` para que:
  - Loguee un `console.warn` **una única vez al arrancar** cuando se
    detecta modo skip (para no ensuciar logs en cada request).
  - Considere skip válido solo en `NODE_ENV === "development"` o
    `NODE_ENV === "test"`. Cualquier otro valor de `NODE_ENV` sin
    `APP_SECRET` debe rechazar el webhook con 500 en el request (no
    tirar en boot: no queremos romper `/health` ni otras rutas).

**NO:**
- Cambiar el guard de arranque (línea 373-376) — ese está OK.
- Cambiar la comparación timing-safe.

## Aceptación

- [ ] `NODE_ENV=development` sin `APP_SECRET`: el bot arranca, el
      middleware imprime UNA vez `[HMAC] Modo desarrollo sin APP_SECRET
      — validación desactivada` y acepta requests.
- [ ] `NODE_ENV` no seteado (undefined): mismo comportamiento que dev
      (arranca con warning, acepta). Es el caso normal del dev local.
- [ ] `NODE_ENV=staging` sin `APP_SECRET`: el bot arranca, `/health`
      funciona, pero un POST a `/webhook` responde 500 con log
      `[HMAC] APP_SECRET faltante en NODE_ENV=staging — rechazo`.
- [ ] `NODE_ENV=production` sin `APP_SECRET`: sigue tirando error de
      arranque (guard existente en línea 373).
- [ ] `NODE_ENV=production` con `APP_SECRET` y firma válida: 200. Con
      firma inválida: 403 (comportamiento actual).
- [ ] Firma `// [ByAntigravity] (BRIEF-009)` en los bloques modificados.
- [ ] `node --check src/app.js` pasa.

## Notas técnicas

Un patrón sugerido (ajustar a gusto):

```js
// [ByAntigravity] (BRIEF-009) Modos aceptados de skip explícito.
const SKIP_ENVS = new Set(["development", "test"]);

// [ByAntigravity] (BRIEF-009) Warning al arrancar (una sola vez).
if (!process.env.APP_SECRET) {
  const env = process.env.NODE_ENV || "development";
  if (SKIP_ENVS.has(env) || env === "development") {
    console.warn(`[HMAC] Modo ${env} sin APP_SECRET — validación desactivada.`);
  }
}

function verifyMetaSignature(req, res, next) {
  const env = process.env.NODE_ENV;

  // Skip explícito solo en dev/test.
  if (!process.env.APP_SECRET && (SKIP_ENVS.has(env) || !env)) {
    return next();
  }

  // Sin APP_SECRET en cualquier otro entorno: rechazo del request.
  if (!process.env.APP_SECRET) {
    console.warn(`[HMAC] APP_SECRET faltante en NODE_ENV=${env} — rechazo.`);
    return res.sendStatus(500);
  }

  // ... resto igual (verifica firma, timing-safe, etc.)
}
```

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude para cerrar los huecos residuales de BRIEF-001.
