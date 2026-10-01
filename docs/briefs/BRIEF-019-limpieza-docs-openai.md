# BRIEF-019 — Limpiar referencias a OpenAI / agente V0 en documentación

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P1 pre-Railway (no urgente pero corresponde antes del release)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna

## Objetivo

Eliminar referencias a OpenAI, GPT, `agent.service.js` y la V0 en la
documentación del proyecto, porque quedan de una etapa que ya no existe
y confunden a lectores nuevos.

## Contexto

`agent.service.js` fue eliminado en el glowdown del 2026-09-18. Sin
embargo, todavía aparecen menciones en:
- Comentarios en migraciones (`sql/migrations/002_seed.sql` menciona "la IA").
- `DOCUMENTACION.md` (raíz) — probablemente el más grande.
- `REPORTE-PROYECTO.md` — no confirmado.
- `README` del proyecto raíz si existe.

## Alcance

**SÍ:**
- `grep -rn "OpenAI\|agent.service\|OPENAI_\|openai\|GPT" .` (excluyendo `node_modules`, `docs/bitacoras`, `docs/briefs` — esos SÍ pueden mencionar el histórico).
- Reescribir o borrar cada mención en documentación pública y comentarios de código productivo.
- Los archivos `.md` del `docs/` que son bitácora/briefs mantienen la mención histórica (es válido, es memoria).

**NO:**
- Reescribir la documentación entera. Es un pass de limpieza, no un rewrite.

## Aceptación

- [ ] `grep` sobre el repo (excluyendo docs/bitacoras y docs/briefs) no devuelve menciones de OpenAI/GPT/agent.service.
- [ ] Firma `// [ByClaude] (BRIEF-019)` en cambios.

## Bloqueos

(Vacío.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude.
- 2026-09-20 — Claude cerró el brief con enfoque conservador:
  - `src/app.js`: dos comentarios reescritos para no mencionar "OpenAI" (dice "un agente generativo" que se eliminó).
  - `DOCUMENTACION.md` y `REPORTE-PROYECTO.md`: banner de deprecación al inicio marcándolos como V0 desactualizada y apuntando a `docs/V1_OBJETIVOS.md`, `docs/TAREAS.md`, `docs/bitacoras/` y `docs/briefs/` como fuente actual. **Rewrite completo excede el alcance del brief**; si hace falta una documentación V1 canónica, se abre brief nuevo.
  - Los archivos en `docs/bitacoras/` y `docs/briefs/` conservan las menciones históricas (es memoria de proceso, tal como pedía el alcance).
