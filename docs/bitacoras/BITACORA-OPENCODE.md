# Bitácora — OpenCode

Diario personal. Entradas más recientes arriba.

---

## Estado actual

**Backlog asignado:**
- BRIEF-006 (Auditoría de logs para secretos y PII) → **HECHO 2026-09-19** (ver entrada más abajo).
- BRIEF-008 (Panel de handoffs + métricas de embudo — post-deploy).

## Notas para vos, OpenCode

BRIEF-006 debería ser tuyo por afinidad (vos tocaste todo lo de tracking y
sabés qué se loguea hoy). BRIEF-008 espera a que tengamos 50 clientes reales.

Al arrancar BRIEF-006:

1. Leé [`../briefs/BRIEF-006-log-audit.md`](../briefs/BRIEF-006-log-audit.md).
2. Actualizá TAREAS.md a EN PROGRESO.
3. Firma tu código con `// [ByOpenCode]`.
4. Al terminar, entrada acá con hallazgos concretos (qué se loguea, qué es sensible, qué se propuso limpiar).

---

## 2026-09-19 — BRIEF-006 (Auditoría de logs: secretos + PII)

**Qué hice:**
- Creé `src/services/logger.service.js` con `redactPhone(phone)` (`***1234`) y `safeError(error)` (nunca toca `error.config.headers`, trunca el body de la respuesta a 2000 chars).
- Inventario completo de logs en `src/**/*.js` (grep `console.(log|error|warn)` → 55 sitios en 11 archivos). Clasificación:
  - **OK** (sin PII ni secrets): arranque del server, verificación del webhook, HMAC inválida, dedup por wamid, `STATE.service` startup, `init-db` (catálogo), `fix-image`/`fix-all-images`, `echo` de media IDs en `upload-all-images`. → sin cambios.
  - **REDACT** (teléfono a últimos 4 dígitos): `app.js` (log de mensaje recibido, error de tráfico, PAUSED_HUMAN, ORGANIC), `state.service.js` (6 sitios: tráfico, get/set state, resumen, opción elegida), `messages.service.js` (log del resumen de atención).
  - **DROP** (mensajes crudos del cliente): contenido de `rawText` en el log de "Mensaje recibido" de `app.js` (PII de terceros que cita el cliente); `interes_color` en el log de resumen de `messages.service.js` cuando cae al último mensaje libre (solo queda el modelo detectado).
  - **CUIDADO → safeError** (axios): `whatsapp.service.js` (4 sitios) y los scripts `subscribe-waba.js`, `upload-image.js`, `upload-all-images.js` (imprimían `error.response?.data`).
- Firma `// [ByOpenCode]` en todos los cambios, conservando las firmas originales ([ByClaude] etc.).

**Archivos tocados:**
- `src/services/logger.service.js` (nuevo)
- `src/app.js` (modificado)
- `src/services/state.service.js` (modificado)
- `src/services/messages.service.js` (modificado)
- `src/services/whatsapp.service.js` (modificado)
- `src/subscribe-waba.js`, `src/upload-image.js`, `src/upload-all-images.js` (modificados — scripts de dev)
- `docs/TAREAS.md`, `docs/briefs/BRIEF-006-log-audit.md` (modificados)

**Problemas encontrados:**
- Ninguno. El único `error.response?.data` que queda en el repo es en `dashboard.js:501` y es un *response HTTP al admin autenticado* (no un log), fuera del alcance del brief.
- `whatsapp.service.js` sigue devolviendo `error.message` en el objeto de retorno (`{ error: true, message }`): no es un log y `axios` no incluye `config` en `error.message`, así que no filtra el token. Dejé el contrato intacto para no cambiar comportamiento.

**Decisiones tomadas:**
- Teléfonos → `***1234` en TODOS los logs, incluso en el dashboard privado (los errores del dashboard no imprimen teléfonos de todos modos).
- Contenido del mensaje del cliente = **DROP** de logs. Es potencialmente PII de terceros (el cliente puede citar a alguien). La asesora lo ve igual en el dashboard privado; Railway logs no lo necesitan.
- `safeError` conserva `error.message` + body de la respuesta (sin `config`). En Meta el body de error no trae el token, pero el truncado es defensa en profundidad.

**Siguiente paso sugerido:**
- Antes de deploy (BRIEF-007), confirmar en Railway que un error real de axios no exponga nada; revisar el plan de indexación de logs (BRIEF-007).

---

## 2026-09-18 — Resumen para Atención on-demand (retroactivo)

**Qué hice:**
- Escribí `buildHandoffSummary(phone)` como función local en `src/routes/dashboard.js`.
- Reconstruye el resumen contra `mensajes` + `trafico_clientes` sin persistir.
- Detecta modelos con regex `modelo\s*(\d+|uno|dos|tres)` y "oferta del día".
- Detecta el interés como la última opción del menú tocada (fallback: último texto libre).
- Endpoint `GET /dashboard/api/conversation/:phone/handoff-summary`.
- Endpoint `POST /dashboard/api/conversation/:phone/resume` usando `resumeBotForClient` de Claude.

**Archivos tocados:**
- `src/routes/dashboard.js` (modificado)

**Problemas encontrados:**
- Claude había implementado en paralelo su propia persistencia del resumen en la tabla `resumenes_atencion`. Los dos endpoints conviven (URLs distintas). Podría consolidarse en V1.1.

**Decisiones tomadas:**
- Reconstruir on-demand permite que el resumen siempre refleje el estado más nuevo del historial (útil si la asesora abre el chat 20 min después y el cliente siguió escribiendo).

---

## 2026-09-11 — Registro de tráfico anuncio vs orgánico (retroactivo)

**Qué hice:**
- Diseñé la tabla `trafico_clientes` (SQL en `sql/trafico.sql`).
- Escribí `registerTraffic(phone, origen, referral)` y `getTraffic(phone)` en lo que originalmente era `src/services/state.service.js`.
- Enganché el registro en el POST del webhook: si viene `referral` es `"anuncio"`, si no `"organico"`.

**Archivos tocados:**
- `sql/trafico.sql` (nuevo)
- `src/services/state.service.js` (original, ahora convivo con el motor de estados de Claude)
- `src/init-db.js` (modificado)
- `src/app.js` (modificado — sección de tráfico)

**Problemas encontrados:**
- Ninguno; el objeto `referral` de Meta a veces viene en `message.referral` y a veces en `value.contacts[0].referral`. Ambos casos están cubiertos.

**Decisiones tomadas:**
- Nunca lanzar excepción desde `registerTraffic`: un fallo del tracking no puede bloquear la respuesta al cliente. Se loguea y se sigue.
