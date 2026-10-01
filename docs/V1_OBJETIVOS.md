# Objetivos de la V1

## Meta grande

Poner Cecilia Tedin Bot V1 **en producción real, con clientes reales**, y
recolectar datos de comportamiento **antes** de decidir cómo se ve la V2. La
V1 no es el producto final: es la sonda que nos dice qué construir después.

## Fases

### Fase 1 — Hardening pre-deploy (esta semana)

Objetivo: el código que va a producción soporta tráfico real sin filtrarse,
sin duplicarse y con visibilidad operativa mínima.

- [ ] HMAC fail-closed + `timingSafeEqual` (BRIEF-001, Antigravity).
- [ ] Deduplicación por `wamid` + tabla `mensajes_procesados` (BRIEF-002, Codex).
- [ ] Migraciones versionadas + `scripts/migrate.js` (BRIEF-003, Claude).
- [ ] Endpoint `/health` con check de BD (BRIEF-004, Antigravity).
- [ ] `.gitignore` + `package.json` limpios (BRIEF-005, Claude).
- [ ] Auditoría de logs para secretos/PII (BRIEF-006, OpenCode).

### Fase 2 — Deploy y verificación (siguientes 2-3 días)

Objetivo: el bot vive en Railway y responde webhooks reales de Meta.

- [ ] Railway Hobby, Serverless OFF, límite de gasto configurado (BRIEF-007, humano).
- [ ] Migraciones aplicadas en Neon de producción.
- [ ] Webhook Meta apuntando al dominio `*.up.railway.app`.
- [ ] Los 5 flujos críticos verificados manualmente antes de abrir tráfico:
  1. GET `/webhook` responde el `challenge`.
  2. POST real desde un WhatsApp llega y se responde.
  3. Mensaje duplicado (mismo `wamid`) se ignora silenciosamente.
  4. Handoff a humano genera resumen en `resumenes_atencion`.
  5. Texto libre reenvía el menú con hint.

### Fase 3 — Observación (primeras 2 semanas de tráfico real)

Objetivo: ver ~50 clientes reales y clasificar problemas por frecuencia.

- [ ] Panel de handoffs pendientes visible en dashboard.
- [ ] Categorización de tipos de mensaje entrante (audio, imagen, texto libre, opción del menú).
- [ ] Métricas de embudo por menú (cuántos tocan cada opción, cuántos derivan a humano).
- [ ] Log de errores agrupado por causa.

### Fase 4 — V1.1 (recién después de Fase 3)

Objetivo: mejoras concretas basadas en los datos, no en supuestos.

Ejemplos probables (a confirmar con datos reales):
- Manejo de mensajes de audio (respuesta template).
- Debouncing de ráfagas (cliente manda 4 mensajes en 3 seg).
- Detección más rica de opciones escritas ("catálogooo", "el 1", "quiero ver todo").

## Anti-objetivos (lo que NO hacemos en V1)

1. **No metemos IA generativa nueva.** La V0 murió por eso; volveremos solo con extractor de intención → JSON estricto → validación.
2. **No migramos a n8n/Sheets.** Tenemos Postgres, tenemos estado, tenemos código versionado — está bien.
3. **No agregamos estados nuevos "por las dudas".** Solo los 4 actuales: `ORGANIC`, `MENU`, `CATALOG`, `PAUSED_HUMAN`.
4. **No refactorizamos por gusto.** Cualquier refactor grande espera hasta Fase 3.
5. **No agregamos features nuevas de negocio** (checkout, pagos, tracking de pedido) hasta que la V1 haya pasado por 50 clientes reales.

## Definición de "listo para producción"

La V1 está lista para recibir tráfico real cuando:

- Los checkboxes de Fase 1 están marcados.
- Los 5 flujos críticos de Fase 2 están verificados.
- El dashboard levanta y responde `/health` con `200 {ok:true, db:"up"}`.
- Existe una entrada en cada bitácora relevante marcando la tarea como HECHA.
