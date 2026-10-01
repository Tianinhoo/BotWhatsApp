# BRIEF-031 — Media entrante y mensajes no-texto

- **Dueño:** Claude
- **Estado:** HECHO local (2026-10-01) — mínimo honesto V1.0
- **Prioridad:** P0 pre-Fase 0 (ronda 2)
- **Creado:** 2026-09-30
- **Cerrado:** 2026-10-01
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

## Implementación — [ByClaude] 2026-10-01

- `src/app.js`: dos sets canónicos arriba del motor conversacional,
  `MEDIA_HANDOFF_TYPES` = {image, audio, video, document, location, contacts},
  `MEDIA_SILENT_TYPES` = {sticker, reaction}. Discriminación por `message.type`
  justo después del `getUserState` + guard de `PAUSED_HUMAN`:
  - Silent types: log y return. No se envía nada, no se cambia estado.
  - Handoff types: `processMenuOption(phone, "asesor", { reason })` con un
    reason que explica qué tipo recibió para que la asesora lo vea en el
    Resumen para Atención.
- `src/services/state.service.js`: `processMenuOption` ahora acepta un
  segundo parámetro `extras` opcional. El case `"asesor"` propaga
  `extras.reason` a `replyDeriveToHuman`.
- `tests/media.test.js` nuevo: 8 regresiones (6 handoff types + 2 silent types).
  Cada test verifica status 200, llamada a processMenuOption con el reason
  correcto, y para silent types verifica ausencia total de respuesta.
- Suite completa Node 24.18.0: 193 pass/skip/0 fail.

## V1.1 (pendiente)

- Descargar el media de Meta (`GET /{media-id}`) y persistir `media_url` en
  `mensajes`. Permite que la asesora vea la foto en el dashboard sin salir.
- Transcripción de audios con Whisper o similar (costo asociado).
