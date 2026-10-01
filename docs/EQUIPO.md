# Equipo

## Claude — Orquestador + Backend core

**Firma:** `// [ByClaude]`

**Focos:**
- Coordinar al equipo (asignar briefs, mantener TAREAS.md, revisar entregas).
- Diseño de esquema de base de datos y migraciones.
- Lógica central del árbol conversacional V1 (`state.service.js`).
- Documentación del proyecto.

**No hace:**
- Cambios de infraestructura sin brief (eso es de Antigravity).
- Analítica/reportería (eso es de OpenCode).

## Codex — Backend implementation

**Firma:** `// [ByCodex]`

**Focos:**
- Implementación de features backend concretas (endpoints, servicios, integraciones).
- Refactors puntuales con brief y tests.
- Deduplicación, colas, jobs, timers.

**No hace:**
- Diseño de esquema desde cero (recibe la migración escrita por Claude).
- Configuración de infra (Railway, DNS, secrets — eso es de Antigravity).

**Nota histórica:** Codex se quedó sin tokens una vez y Claude asumió parte
de su backlog. Cuando vuelva, Claude le pasa lo que estaba pendiente.

## Antigravity — Seguridad + Infra

**Firma:** `// [ByAntigravity]`

**Focos:**
- Middleware de seguridad (HMAC, rate limiting, validación de origen).
- Endpoints operativos (`/health`, métricas).
- Configuración de deploy (Railway, variables de entorno, dominios).
- Hardening general (secrets, headers, CORS si aplica).

**Ya ha entregado:**
- Middleware `verifyMetaSignature` en `src/app.js` (X-Hub-Signature-256 de Meta).

**No hace:**
- Lógica de negocio del árbol conversacional.
- Diseño de UX del dashboard.

## OpenCode — Datos + Observabilidad

**Firma:** `// [ByOpenCode]`

**Focos:**
- Tracking de eventos y origen (tráfico anuncio vs orgánico).
- Analítica, reportería, dashboards de datos.
- Auditoría de logs (secretos, PII, ruido).
- Resumen para atención humana (reconstrucción on-demand desde `mensajes`).

**Ya ha entregado:**
- `registerTraffic` / `getTraffic` en `src/services/state.service.js`.
- `buildHandoffSummary` on-demand en `src/routes/dashboard.js`.
- Tabla `trafico_clientes` y su SQL.

**No hace:**
- Cambios en el motor conversacional (eso es de Claude).
- Middleware de seguridad (eso es de Antigravity).

## Regla de oro

Nadie edita un archivo sin brief asignado. Si aparece la necesidad de tocar
algo que no está en su brief, avisa a Claude y Claude decide si se amplía el
brief actual, se crea uno nuevo, o se reasigna.
