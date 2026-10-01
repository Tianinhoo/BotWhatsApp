# BRIEF-007 — Deploy a Railway (Hobby + Neon + Meta webhook)

- **Dueño:** Humano (con soporte de Claude para prep del repo)
- **Estado:** TODO
- **Prioridad:** P1
- **Creado:** 2026-09-19
- **Cerrado:** —
- **Depende de:** BRIEF-001, BRIEF-002, BRIEF-003, BRIEF-004, BRIEF-005, BRIEF-006 (todos los P0)

## Objetivo

Poner Cecilia Tedin Bot V1 corriendo en Railway (Hobby), conectado a Neon
Postgres, con el webhook de Meta apuntando al dominio Railway y las
migraciones aplicadas.

## Contexto

Este brief lo ejecuta el humano porque requiere:
- Crear/pagar la cuenta Railway Hobby ($5/mes mín).
- Login en la Meta Developer Console para actualizar el webhook URL.
- Manejo de secretos (los agrega el humano, no los pega en ningún archivo).

Claude puede preparar el repo (junto con BRIEF-005 y BRIEF-003) para que
al momento del `git push` todo esté listo.

## Alcance

**SÍ:**
- Crear repo GitHub `cecilia-tedin-bot` (privado).
- `git init` + primer commit + push.
- Crear proyecto en Railway conectado al repo.
- Cargar variables de entorno en Railway.
- Configurar Pre-Deploy Command `npm run db:migrate`.
- Configurar dominio y actualizar webhook en Meta.
- Verificar los 5 flujos críticos de la Fase 2 en `V1_OBJETIVOS.md`.
- Configurar límite de gasto/alerta en Railway.

**NO:**
- Dominio custom (`bot.ceciliatedin.com`) — se puede en V1.1.
- CI/CD complejo (branch protection, PR reviews). Deploy directo desde `main` alcanza para el piloto.

## Aceptación

- [ ] Repo GitHub creado, `.env` no está commiteado.
- [ ] Railway conectado; primer deploy exitoso.
- [ ] Variables cargadas: `DATABASE_URL`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`,
      `GRAPH_API_VERSION`, `VERIFY_TOKEN`, `DASHBOARD_PASSWORD`, `APP_SECRET`,
      `IMAGE_MODELO_1/2/3`, `IMAGE_OFERTA_DIA`, `NODE_ENV=production`.
- [ ] Pre-Deploy Command corriendo `npm run db:migrate` sin errores.
- [ ] `https://<app>.up.railway.app/health` responde 200 con `{ok:true, db:"up"}`.
- [ ] `https://<app>.up.railway.app/webhook` (GET) verificado por Meta.
- [ ] Un mensaje real de WhatsApp llega y se responde con el menú.
- [ ] Reenviar el mismo `wamid` no duplica respuestas (BRIEF-002 en acción).
- [ ] Serverless está OFF en Railway.
- [ ] Alerta de gasto configurada ($10/mes de tope de alerta como piso).
- [ ] Entrada en `BITACORA-CLAUDE.md` con URL del dashboard, dominio Railway,
      y checklist marcada.

## Notas técnicas

**Orden operativo sugerido:**

1. Claude termina BRIEF-005 (repo limpio) y BRIEF-003 (migraciones listas).
2. Humano: `git init`, primer commit, crear repo en GitHub, push.
3. Humano: `railway.app` → New Project → Deploy from GitHub → seleccionar el repo.
4. Humano: en Settings → Variables, cargar el env completo.
5. Humano: en Settings → Deploy, configurar Pre-Deploy Command: `npm run db:migrate`.
6. Railway hace deploy → verificar en Logs que `db:migrate` corrió limpio y que `app.listen` disparó.
7. Humano: Generate Domain → obtener `*.up.railway.app`.
8. Humano: en Meta Developer Console, ir a WhatsApp → Configuration → Webhook,
   editar Callback URL a `https://<app>.up.railway.app/webhook`, mantener `VERIFY_TOKEN`.
9. Meta muestra "Verified ✅".
10. Humano manda un WhatsApp real y verifica los 5 flujos.

**Cómo verificar el dedup de `wamid` manualmente:**
- Grabar el request POST que llega (Railway logs muestran el body en debug).
- Repetir el request con `curl` idéntico. La segunda vez debe verse
  `[dedup] wamid X ya procesado` en logs y NO enviar segundo mensaje.

## Bloqueos

(Se completa si aparecen — ejemplo: Meta rechaza el nuevo webhook, Railway falla el build, etc.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
