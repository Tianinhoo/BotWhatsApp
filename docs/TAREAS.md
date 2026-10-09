# Tablero de tareas

Tablero vivo. Cada dueño actualiza el estado de su brief acá.
Última actualización: 2026-10-01 por Claude (cierre local de BRIEF-031 + BRIEF-032 + 3 fixes P2 del chequeo 2026-09-30).

## Cierre y preparación — 2026-10-01

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-033 | Consolidación Git y runtime Node 22 | Codex | BLOQUEADO REMOTO | Checkpoints locales; Node22/PG 176/176. Push autorizado pero GitHub responde Repository not found. |

## P0 — Bloquean el deploy

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-001 | HMAC hardening (fail-closed + timing-safe) | Antigravity | HECHO | Cerrado 2026-09-19 por Antigravity; fila sincronizada por Claude |
| BRIEF-002 | Deduplicación por `wamid` | Codex | HECHO | [ByCodex] Cerrado 2026-09-19; migración 006 aplicada, 6 pruebas aprobadas con PostgreSQL; límites y seguimiento V1.1 documentados |
| BRIEF-003 | Migraciones versionadas + `scripts/migrate.js` | Claude | HECHO | Cerrado 2026-09-19; migrador probado contra Neon (aplicó 5, segunda corrida sin cambios) |
| BRIEF-004 | Endpoint `/health` con check de BD | Antigravity | HECHO | Cerrado 2026-09-19 por Antigravity; fila sincronizada por Claude |
| BRIEF-005 | Housekeeping pre-deploy (`.gitignore`, `package.json`) | Claude | HECHO | Cerrado 2026-09-19; openai fuera, Node 22.x pinneado, `.env.example` creado |
| BRIEF-006 | Auditoría de logs (secretos / PII) | OpenCode | HECHO | [ByOpenCode] `logger.service.js` + redacciones (teléfonos a ***1234, contenido DROP, axios→safeError); inventario en bitácora |
| BRIEF-009 | Fix HMAC — warning en dev + cubrir `NODE_ENV` no seteado | Antigravity | HECHO | Cerrado 2026-09-19 por Antigravity; fila sincronizada por Claude (segunda vez que Antigravity omite el paso) |

## P0 — Fixes críticos pre-Fase 0 (post-revisión externa 2026-09-20)

Estos bloquean la Fase 0. Se hicieron visibles tras la auditoría externa del 2026-09-20. Orden acordado con el humano.

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-014 | Dashboard: sincronizar conversación y destinatario | Codex | HECHO | [ByCodex] 2026-09-20: 8 regresiones de frontend; npm test verde (13 aprobadas, 1 integración omitida) |
| BRIEF-011 | Envíos fallidos: distinguir aceptado/fallido | Codex | HECHO | [ByCodex] Cerrado 2026-09-20: estado de envío persistido, 502 ante rechazo, estado del bot conservado; suite conjunta 54/54 con PostgreSQL |
| BRIEF-012 | Textos honestos + validar datos con negocio | Claude + Humano | HECHO | Cerrado 2026-09-20; `src/config/business.js` con "Por confirmar" hasta validación del negocio; textos rutas 3/4 no prometen texto libre |
| BRIEF-015 | Resumen: filtrar labels del menú + unificar builders | Claude | HECHO | Cerrado 2026-09-20; `summary.service.js` unifica ambos builders; fix "6"; 17 tests dedicados |
| BRIEF-016 | Recuperar suite de tests + regresiones nuevas | Codex | HECHO | [ByCodex] Cerrado 2026-09-20: npm test verde; 54/54 con PostgreSQL, regresiones 011/014/015/017 y regla de cierre documentadas |
| BRIEF-017 | Campo "Necesidad" en el resumen | Claude | HECHO | Cerrado 2026-09-20 junto con BRIEF-015; migración `007_necesidad.sql` aplicada; fallback "Por confirmar" |

## P0 — Fixes críticos pre-Fase 0, RONDA 2 (post-revisión externa 2026-09-30)

> Una segunda revisión externa cerró el simulador y detectó que la ronda 1
> pasó por alto bugs reproducibles (race condition B1 observable, bugs del
> plan V1 original aún abiertos). Estos bloquean una Fase 0 honesta sobre
> el recorrido completo. Recomendación del revisor: **un único responsable**
> cierra en orden; no se reparte.
> [ByCodex] 2026-10-01: criterio actualizado con autorización del usuario.
> Conexión A puede adelantarse; B requiere 027/028/029 y C1 de 030.
> 025 se posterga; C2, 031 y 032 conservan sus límites documentados.

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-026 | Serialización por teléfono (resuelve B1 del escáner) | Codex | HECHO | [ByCodex] 2026-10-01: cola ANTES de dedup, trabajo completo por teléfono, fallos no saltan sucesores, aviso sin liberar; 11 regresiones nuevas y suite 155 aprobadas/6 omitidas/0 fallidas. Cierre local, sin commit/despliegue. Una sola instancia Node. |
| BRIEF-027 | Recepción durable y revisión de fallos | Codex | HECHO LOCAL + BD | 009 aplicada; commit antes de HTTP 200; recuperación conservadora; Node22/PG: 176/176. Una instancia. |
| BRIEF-028 | Procesar todos los mensajes de un webhook | Codex | HECHO LOCAL | Todos los niveles, contacto por wa_id, aislamiento de fallos y paralelismo; Node 22: 160 pass/6 skip. |
| BRIEF-029 | Detener ante fallo de lectura de estado | Codex | HECHO LOCAL | 2026-10-01: error propagado, sin envíos/transiciones; 156 pass/6 skip. Recuperación depende de 027. |
| BRIEF-030 | Timeout Meta + evaluación de circuit breaker | Codex | PARCIAL | C1: cancelación a 8s en todo envío, Node22 162 pass/6 skip; C2 pendiente, sin reintentos ciegos. |
| BRIEF-031 | Media entrante y mensajes no-texto (resuelve A1) | Claude | HECHO | [ByClaude] 2026-10-01: image/audio/video/document/location/contacts → handoff con reason; sticker/reaction → silencio. 8 regresiones nuevas. Suite 193/186 pass/0 fail. |
| BRIEF-032 | SIGTERM handler + cierre limpio de pool (resuelve G2) | Claude | HECHO | [ByClaude] 2026-10-01: `drain()` en queue, `stop()` en inbox, handler SIGTERM/SIGINT en app.js con secuencia close → stop → drain → pool.end → exit(0); timeout 15s respaldo. 5 regresiones nuevas. |

## P0.5 — Smoke test antes de pagar (Fase 0)

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-010 | Fase 0: conexión A y recorrido B | Humano + Codex | PENDIENTE META | BD/migraciones y protecciones mínimas verificadas. Falta APP_SECRET y configurar conexión. C2, 031/032 y 025 siguen separados. |

## P1 — Deploy

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-013 | Atribución publicitaria: origen inicial vs interacción | Claude | HECHO | Cerrado 2026-09-20; fix del `ON CONFLICT` (nunca downgrade "anuncio"→"organico"); 3 tests de integración |
| BRIEF-018 | Dashboard hardening: rate limit + cookie Secure | Antigravity | HECHO | Cerrado 2026-09-20 por Antigravity; fila sincronizada por Claude (**3ra vez** que Antigravity omite este paso). Faltan tests de regresión — pendiente para BRIEF-024 |
| BRIEF-019 | Limpiar referencias a OpenAI en docs | Claude | HECHO | Cerrado 2026-09-20; banners de deprecación en DOCUMENTACION.md y REPORTE-PROYECTO.md; app.js limpio |
| BRIEF-021 | Cobertura de tests para árbol V1 (`state.service.js`) | Codex | HECHO | [ByCodex] 2026-09-20: 46 tests nuevos; npm test conjunto 114 aprobados/6 omitidos/0 fallidos; producción intacta; bug del parser separado en BRIEF-023 |
| BRIEF-022 | Cobertura de tests para HMAC middleware y `/health` | Codex | HECHO | [ByCodex] 2026-09-20: 12 tests HMAC + 4 health; suite conjunta verde; producción intacta |
| BRIEF-023 | Rechazar claves heredadas en opciones del menú | Claude (reasignado desde Codex) | HECHO | Cerrado 2026-09-20 por Claude; `Object.hasOwn` + 21 tests de regresión en `menu-prototype.test.js`; suite 141/135 pass/6 skip |
| BRIEF-024 | Tests para hardening del dashboard (rate limit + Secure) | Antigravity | HECHO | Cerrado 2026-09-20 por Antigravity tras reclamo. |
| BRIEF-007 | Deploy a Railway (Hobby + Neon + Meta webhook) | Humano | TODO | Solo si Fase 0 pasa y los pre-Railway están HECHO |

## P1.5 — UX del árbol (post ronda 2 de críticos, pre Fase 0)

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-025 | Selección de prenda persistente + sub-estado post-catálogo | Claude (orquesta) + Codex | HECHO LOCAL | [ByClaude] 2026-10-09: 025-A + 025-B (migración 010, selección lista/ordinal/"modelo N", rutas 3/4/6 con prenda, resumen con prenda real, limpieza al reactivar). Node 22.23.3: 216 pass/0 fail/9 skip; con PG 225/225 (incluye audit:data). Commit d9f36f7 en rama `brief-025-seleccion-prenda`. Falta probar en WhatsApp real. 011 fuera de alcance. |

## P2 — Post-deploy (arrancan cuando Fase 2 esté verde)

| ID | Título | Dueño | Estado | Notas |
|---|---|---|---|---|
| BRIEF-008 | Panel de handoffs pendientes + métricas de embudo | OpenCode | TODO | Espera 50 clientes reales |

## Ya HECHO (histórico)

| Autor | Entrega | Fecha aproximada |
|---|---|---|
| OpenCode | `registerTraffic`/`getTraffic` + tabla `trafico_clientes` | 2026-09 |
| OpenCode | `buildHandoffSummary` on-demand en `dashboard.js` | 2026-09-18 |
| Claude | Glowdown a V1: `state.service.js`, árbol de 7 rutas, eliminación de `agent.service.js` | 2026-09-18 |
| Claude | Tabla `resumenes_atencion` + persistencia de resumen en handoff | 2026-09-18 |
| Antigravity | Middleware `verifyMetaSignature` (HMAC base) | 2026-09-19 |
| Claude | BRIEF-003: migraciones versionadas + `scripts/migrate.js` + `sql/migrations/` | 2026-09-19 |
| Claude | BRIEF-005: `.gitignore` endurecido, `openai` fuera de deps, Node 22.x, `.env.example` | 2026-09-19 |
| OpenCode | BRIEF-006: `logger.service.js` + auditoría de logs (PII/secrets) | 2026-09-19 |
| Codex | BRIEF-014: race condition dashboard fixed (8 regresiones frontend) | 2026-09-20 |
| Claude | BRIEF-015 + BRIEF-017: `summary.service.js` unificado + campo Necesidad + migración 007 | 2026-09-20 |
| Codex | BRIEF-011: Envíos fallidos (aceptado/fallido/incierto) + regresiones | 2026-09-20 |
| Codex | BRIEF-016: Suite de tests verde (54/54) + regla obligatoria en CONVENCIONES.md | 2026-09-20 |
| Claude | BRIEF-012: textos honestos + `src/config/business.js` centralizado | 2026-09-20 |
| Claude | BRIEF-013: fix atribución `ON CONFLICT` + 3 tests de integración | 2026-09-20 |
| Claude | BRIEF-019: banners de deprecación en docs V0 | 2026-09-20 |
| Codex | BRIEF-021 + BRIEF-022: cobertura tests árbol V1 + HMAC/health (46+16 tests, 141/135 pass) | 2026-09-20 |
| Claude | BRIEF-023: fix prototype pollution en `resolveMenuOption` + 21 tests | 2026-09-20 |

## Convención de estados

- **TODO**: el brief existe, el dueño no arrancó.
- **EN PROGRESO**: el dueño está trabajando activamente.
- **BLOQUEADO**: hay un impedimento externo. Ver "Bloqueos" del brief.
- **HECHO**: aceptación completa, verificada.

## Cómo actualizar este archivo

Cada IA edita solo su(s) fila(s), no las de otros. Cuando cambies un estado,
también agregá una entrada en tu bitácora personal explicando qué avanzaste.
