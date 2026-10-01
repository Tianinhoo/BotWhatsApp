# BRIEF-008 — Panel de handoffs + métricas de embudo (post-deploy)

- **Dueño:** OpenCode
- **Estado:** TODO (arranca cuando la Fase 2 esté HECHA)
- **Prioridad:** P2
- **Creado:** 2026-09-19
- **Cerrado:** —
- **Depende de:** BRIEF-007 (deploy) + ~50 clientes reales observados

## Objetivo

Convertir los datos que ya guardamos (`mensajes`, `trafico_clientes`,
`resumenes_atencion`, `mensajes_procesados`) en un panel del dashboard
que le sirva al humano para decidir qué construir en V1.1.

## Contexto

Este brief no arranca hasta que tengamos tráfico real. Sin datos, los
gráficos son ficción. Cuando lleguemos a ~50 clientes reales el humano
va a querer respuestas a:

1. ¿Cuántos clientes llegaron por anuncio vs orgánico?
2. ¿Qué opción del menú es la más elegida? ¿Cuál casi nadie toca?
3. ¿Qué % de conversaciones terminan en handoff a humano?
4. ¿Cuánto tarda una asesora en atender un handoff pendiente?
5. ¿Hay handoffs "abandonados" (nadie tocó el POST /resume)?

## Alcance (a definir en detalle cuando arranque)

**SÍ (probable):**
- Query nueva en `src/routes/dashboard.js`: `GET /dashboard/api/metrics/funnel`.
- Tabla + gráfico en `public/dashboard.html` con el embudo.
- Query `GET /dashboard/api/handoffs/pendientes` (los que están en
  `PAUSED_HUMAN` sin `resume` posterior).
- Alerta visual en el dashboard cuando hay handoffs viejos.

**NO:**
- Analytics externo (GA, Mixpanel). Todo se calcula desde Postgres.
- Exportación a CSV (V1.2 si hace falta).

## Aceptación (esbozo — se refina al arrancar)

- [ ] Endpoint de embudo devuelve conteos por etapa (mensajes recibidos,
      menús mostrados, opciones tocadas por id, handoffs).
- [ ] Endpoint de handoffs pendientes lista los `PAUSED_HUMAN` ordenados
      por antigüedad, con el resumen adjunto.
- [ ] Dashboard muestra ambos con auto-refresh vía SSE (usar el bus
      existente que ya emite `message` y `handoff`).
- [ ] Firma `// [ByOpenCode]` en todo lo nuevo.

## Notas técnicas

Esperar a tener datos reales antes de decidir los cortes exactos del
embudo. La estructura del `resumen` en `resumenes_atencion.resumen` (JSONB)
ya trae `origen_trafico`, `modelo_seleccionado` e `interes_color` — son
las 3 dimensiones que van a alimentar los gráficos.

## Bloqueos

- 2026-09-19 — Bloqueado por falta de tráfico real. Reanudar cuando BRIEF-007 esté HECHO y hayan pasado ~50 clientes. — Claude.

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude (parqueado hasta post-deploy).
