# BRIEF-033 — Consolidación Git y preparación de Fase 0
<!-- [ByCodex] -->
- **Dueño:** Codex, autorizado por el usuario.
- **Estado:** BLOQUEADO (acceso al remoto; trabajo independiente continúa).
- **Prioridad:** P0.
- **Creado:** 2026-10-01.

## Alcance
Resguardar el trabajo acumulado, verificar Node 22, corregir instrucciones de
Fase 0 y registrar precondiciones reales. No inventar una separación histórica
por brief de archivos modificados conjuntamente: crear un checkpoint explícito,
seguido de commits acotados. No subir .env, dependencias ni datos locales.

## Aceptación
- [ ] Checkpoint local y respaldo remoto verificados.
- [x] Suite ejecutada en Node 22.23.3: 176 aprobadas/0 omitidas/0 fallidas con PostgreSQL.
- [x] Instrucciones de prueba pública con HMAC obligatorio.
- [x] Precondiciones y bloqueos externos documentados.
- [x] Bitácora y tablero actualizados.

## Registro
- La búsqueda detectó una URL ficticia de BD (falso positivo) y el VERIFY_TOKEN
  local en dos documentos. Se retira el token literal, no se modifica .env.
- APP_SECRET falta. Token WhatsApp, PHONE_NUMBER_ID e IDs de imágenes están
  presentes, pero no se han validado contra Meta.
- Node 22 se obtiene con npm exec; no se cambia Node global ni se instala nvm.

## Bloqueos
- 2026-10-01: push autorizado por el usuario al remoto configurado devuelve Repository not found. Commit local b151221 disponible. No se cambia origin sin confirmar el destino.
- npm exec no completó; alternativa: descarga oficial Node 22.23.3 con SHA256 verificado.

- BD: intento de conexión read-only con límite de 5s agotado; migraciones no consultables. No se aplicaron cambios.

## Actualización final 2026-10-01
- La BD respondió en el siguiente intento. Migración 009 aplicada; preflight confirma conexión y esquema al día.
- scripts/preflight.js informa solo presencia de variables, versión y conectividad; no envía mensajes. En NODE_ENV=production solo falta APP_SECRET.
- Continúa pendiente el respaldo remoto: usuario autorizó URL exacta, pero GitHub responde Repository not found. Se solicitó confirmar URL/acceso.
- Prueba WhatsApp real pendiente: APP_SECRET y configuración de Meta/túnel. No se abrió túnel ni se enviaron mensajes.
