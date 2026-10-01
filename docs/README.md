# Cecilia Tedin Bot — Documentación del proyecto

Este directorio es el **centro operativo** del equipo multi-agente que construye
Cecilia Tedin Bot. Todo lo que pasa en el proyecto (decisiones, tareas,
avances, problemas) queda escrito acá para que **ninguna IA del equipo pierda
contexto entre sesiones** y para que el humano dueño del proyecto pueda
auditar quién hizo qué, cuándo y por qué.

## Cómo navegar esta carpeta

| Archivo | Para qué sirve | Quién lo lee |
|---|---|---|
| [V1_OBJETIVOS.md](V1_OBJETIVOS.md) | Qué buscamos con la V1 y qué NO hacemos | Todos |
| [EQUIPO.md](EQUIPO.md) | Roles, focos y responsabilidades de cada IA | Todos |
| [CONVENCIONES.md](CONVENCIONES.md) | Reglas de firma, briefs, bitácoras y estados | Todos |
| [TAREAS.md](TAREAS.md) | Tablero vivo de todas las tareas en curso | Todos |
| `briefs/BRIEF-*.md` | Órdenes de trabajo concretas por tarea | Dueño del brief |
| `bitacoras/BITACORA-<AI>.md` | Diario personal de cada IA (avances y problemas) | La IA + el humano |

## Flujo de trabajo (resumen)

```
Humano/Claude detecta necesidad
        ↓
Claude escribe BRIEF-NNN-*.md y lo asigna
        ↓
Claude actualiza TAREAS.md → TODO
        ↓
IA dueña lee el brief y arranca
        ↓
IA dueña actualiza TAREAS.md → EN PROGRESO
        ↓
IA dueña ejecuta, firma código y anota en su BITACORA
        ↓
IA dueña actualiza TAREAS.md → HECHO (o BLOQUEADO)
        ↓
Claude revisa, cierra brief, planea siguiente
```

## Firmas obligatorias

Todo bloque de código nuevo o modificado lleva la firma de su autor:

- `// [ByClaude]` — Claude (orquestador + backend core)
- `// [ByCodex]` — Codex (backend implementation)
- `// [ByAntigravity]` — Antigravity (seguridad + infra)
- `// [ByOpenCode]` — OpenCode (datos + observabilidad)

Ver detalles en [CONVENCIONES.md](CONVENCIONES.md).

## Índice de briefs abiertos

Ver [TAREAS.md](TAREAS.md) para el estado real. Los briefs viven en `briefs/`.

## Índice de bitácoras

- [bitacoras/BITACORA-CLAUDE.md](bitacoras/BITACORA-CLAUDE.md)
- [bitacoras/BITACORA-CODEX.md](bitacoras/BITACORA-CODEX.md)
- [bitacoras/BITACORA-ANTIGRAVITY.md](bitacoras/BITACORA-ANTIGRAVITY.md)
- [bitacoras/BITACORA-OPENCODE.md](bitacoras/BITACORA-OPENCODE.md)
