# BRIEF-031 — Media entrante y mensajes no-texto (stub)

- **Dueño:** por asignar
- **Estado:** TODO (stub)
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Resuelve:** A1 del `../auditoria/02-Escaner-Vulnerabilidades.md`.

## Objetivo

Hoy cualquier mensaje que no sea `text` o `interactive` (audio, sticker,
image, video, location, contacts, reaction) cae al hint genérico "aún no
puedo interpretar mensajes libres". Para una clienta que manda foto de
una prenda que le gustó, es una respuesta rota.

## Alcance propuesto (a confirmar)

### Mínimo honesto (V1.0)

- Discriminar por `message.type` en `src/app.js:170-192` (`saveIncomingMessage`).
- Para `image`, `audio`, `video`, `location`: NO responder con hint genérico.
  Derivar directamente a asesora con `PAUSED_HUMAN` y resumen explicando
  el tipo recibido ("Cliente mandó una imagen — asesora debe revisarla
  en WhatsApp directamente").
- Para `sticker`, `reaction`: ignorar silenciosamente (no son
  comunicación de intención).

### Mejora (V1.1 — fuera de alcance)

- Descargar el media desde Meta (`GET /{media-id}`), guardar la URL en
  `mensajes.media_url` para que la asesora pueda abrirlo en el dashboard.

## Nota

El mínimo honesto es lo que bloquea Fase 0. La descarga de media es
candidato V1.1.
