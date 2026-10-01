# BRIEF-001 — HMAC hardening (fail-closed + timing-safe)

- **Dueño:** Antigravity
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** ninguna

## Objetivo

Endurecer el middleware `verifyMetaSignature` que ya existe en
`src/app.js` para que sea **fail-closed** en producción y use
**comparación timing-safe**.

## Contexto

El middleware base (agregado por vos) valida la firma `X-Hub-Signature-256`
de Meta, pero tiene dos problemas para producción:

1. **Fail-open ante `APP_SECRET` ausente.** El guard actual es:
   ```js
   if (!process.env.APP_SECRET || process.env.NODE_ENV === "development") {
     return next();
   }
   ```
   Si nos olvidamos de cargar `APP_SECRET` en Railway, el middleware
   silenciosamente acepta todos los requests. En producción, la ausencia
   del secret debería tirar el proceso, no relajar la seguridad.

2. **Comparación con `!==`.** Filtra byte-a-byte y abre un timing-attack
   teórico. La fix es un one-liner con `crypto.timingSafeEqual`.

## Alcance

**SÍ:**
- `src/app.js` — modificar `verifyMetaSignature` y agregar un check de
  boot que aborte si estamos en `production` sin `APP_SECRET`.

**NO:**
- Rate limiting (otro brief eventual).
- Cambios en la lógica del webhook.

## Aceptación

- [ ] En `NODE_ENV === "production"` sin `APP_SECRET`, el proceso lanza
      error al arrancar (no llega a `app.listen`).
- [ ] En `NODE_ENV !== "production"`, se puede correr sin `APP_SECRET`
      (skip explícito con warning en consola).
- [ ] Con `APP_SECRET` presente, la comparación usa `crypto.timingSafeEqual`
      protegido contra longitudes distintas.
- [ ] Firma anterior `// [ByAntigravity]` sigue presente, con nueva firma
      `// [ByAntigravity] (endurecido)` sobre el bloque modificado.
- [ ] `node --check src/app.js` pasa.
- [ ] Prueba local: sin `APP_SECRET` + `NODE_ENV=production` → falla al
      levantar. Con `APP_SECRET` + firma mala → 403. Con firma buena → 200.

## Notas técnicas

**Guard de arranque sugerido** (al principio de `app.js`, antes de `app.listen`):

```js
// [ByAntigravity] (endurecido) Fail-closed: sin APP_SECRET en prod no arranca.
if (process.env.NODE_ENV === "production" && !process.env.APP_SECRET) {
  throw new Error(
    "APP_SECRET obligatorio en producción para validar webhooks de Meta."
  );
}
```

**Comparación timing-safe** (dentro del middleware):

```js
// [ByAntigravity] (endurecido) Comparación timing-safe.
const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expectedSignature);
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
  console.warn("Firma HMAC del webhook inválida.");
  return res.sendStatus(403);
}
```

`timingSafeEqual` requiere que ambos buffers tengan el mismo tamaño; por
eso el check previo de longitud.

## Bloqueos

(Vacío por ahora — completar si aparecen.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
