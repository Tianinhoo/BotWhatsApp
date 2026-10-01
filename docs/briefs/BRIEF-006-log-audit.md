# BRIEF-006 — Auditoría de logs (secretos + PII)

- **Dueño:** OpenCode
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** ninguna (puede correr en paralelo con los otros P0)

## Objetivo

Revisar todos los `console.log` / `console.error` / `console.warn` del
código para confirmar que **ningún secret y ningún dato personal
sensible** se está imprimiendo, especialmente cuando se corra en Railway
con logs indexados.

## Contexto

En cuanto encendamos el webhook en producción, cada mensaje real de un
cliente pasa por nuestros logs. Hoy logueamos:
- Teléfonos completos (PII).
- Contenido de mensajes del cliente (potencialmente PII de terceros que
  cita, datos personales, etc.).
- Detalles del `referral` (source_id, headline del anuncio).

Nada de eso es un secreto per se, pero **queremos ser deliberados** sobre qué
sale a Railway logs y qué no. Además, hay que descartar:
- Que nunca imprimamos `WHATSAPP_TOKEN`, `APP_SECRET`, `DATABASE_URL`
  completos por error.
- Que nunca imprimamos el `password` del dashboard.
- Que los errores de axios (que pueden traer el token en `error.config.headers`)
  no lleguen a consola.

## Alcance

**SÍ:**
- Grep sobre `src/**/*.js` de `console.log`, `console.error`, `console.warn`.
- Revisar cada línea y clasificar:
  - **OK** — información no sensible.
  - **REDACT** — hay que enmascarar (ejemplo: teléfono → últimos 4 dígitos).
  - **DROP** — sacar el log entero.
  - **CUIDADO** — `error.response?.data` o `error.config` de axios pueden filtrar tokens.
- Proponer un helper pequeño de logging (`src/services/logger.service.js`)
  con una función `redactPhone(phone)` y quizás `safeError(error)` que
  strippea headers/config de errores de axios.
- Aplicar los cambios donde corresponda.

**NO:**
- Introducir Winston/Pino todavía. `console.*` sigue siendo suficiente
  para la V1; solo se envuelve con helpers.
- Configurar log rotation ni exportar a servicios externos (Datadog, etc.).

## Aceptación

- [ ] Existe un inventario en la bitácora de OpenCode con la lista de todos
      los sitios donde hay logs, y qué se decidió con cada uno.
- [ ] Ningún log imprime `process.env.WHATSAPP_TOKEN`, `APP_SECRET`,
      `DATABASE_URL`, `DASHBOARD_PASSWORD` (directa o indirectamente vía
      `error.config`).
- [ ] Teléfonos loguean solo los últimos 4 dígitos (`***1234`) salvo en el
      dashboard privado.
- [ ] Firma `// [ByOpenCode]` en todos los cambios.
- [ ] `node --check` de los archivos tocados pasa.

## Notas técnicas

**Grep inicial recomendado:**

```bash
grep -nE "console\.(log|error|warn)" src -r
```

**Helper propuesto (`src/services/logger.service.js`):**

```js
// [ByOpenCode] Helpers de logging para no filtrar PII/secrets a Railway logs.
function redactPhone(phone) {
  if (!phone) return "unknown";
  const s = String(phone);
  return s.length <= 4 ? "***" + s : "***" + s.slice(-4);
}

// Un error de axios lleva en error.config.headers el Bearer token.
// Nunca lo imprimimos entero.
function safeError(error) {
  if (!error) return "unknown error";
  if (error.response?.data) {
    return `${error.message} — response: ${JSON.stringify(error.response.data)}`;
  }
  return error.message || String(error);
}

module.exports = { redactPhone, safeError };
```

Reemplazar en los servicios los patrones tipo `console.error("... :", error.message)`
por `console.error("...", safeError(error))` donde haya axios de por medio.

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
- 2026-09-19 — Aceptación completa por OpenCode: helper creado, 13 redacciones aplicadas en 8 archivos, `node --check` en verde, inventario en BITACORA-OPENCODE.md. Sin bloqueos.
