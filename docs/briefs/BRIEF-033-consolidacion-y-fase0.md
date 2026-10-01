# BRIEF-033 — Consolidación Git y preparación de Fase 0
<!-- [ByCodex] -->
- **Dueño:** Codex, autorizado por el usuario.
- **Estado:** EN PROGRESO.
- **Prioridad:** P0.
- **Creado:** 2026-10-01.

## Alcance
Resguardar el trabajo acumulado, verificar Node 22, corregir instrucciones de
Fase 0 y registrar precondiciones reales. No inventar una separación histórica
por brief de archivos modificados conjuntamente: crear un checkpoint explícito,
seguido de commits acotados. No subir .env, dependencias ni datos locales.

## Aceptación
- [ ] Checkpoint local y respaldo remoto verificados.
- [ ] Suite ejecutada en Node 22.
- [x] Instrucciones de prueba pública con HMAC obligatorio.
- [ ] Precondiciones y bloqueos externos documentados.
- [ ] Bitácora y tablero actualizados.

## Registro
- La búsqueda detectó una URL ficticia de BD (falso positivo) y el VERIFY_TOKEN
  local en dos documentos. Se retira el token literal, no se modifica .env.
- APP_SECRET falta. Token WhatsApp, PHONE_NUMBER_ID e IDs de imágenes están
  presentes, pero no se han validado contra Meta.
- Node 22 se obtiene con npm exec; no se cambia Node global ni se instala nvm.
