# BRIEF-018 — Dashboard hardening: rate limit + cookie Secure

- **Dueño:** Antigravity
- **Estado:** HECHO
- **Prioridad:** P0 pre-Railway (bloquea BRIEF-007)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna

## Objetivo

Endurecer el dashboard antes de exponerlo con una URL pública real.
Hoy el login solo verifica el password; nada limita intentos ni
protege la cookie en tránsito.

## Contexto

`src/routes/dashboard.js`:
- `POST /dashboard/login` acepta N intentos de password sin límite.
  Bruteforce trivial si alguien encuentra la URL.
- El `Set-Cookie` del token de admin **no incluye `Secure`**. En Railway
  todo va por HTTPS, así que la cookie viaja segura en la práctica,
  pero el flag falta y es cheap-to-add.
- No hay bloqueo temporal después de X intentos fallidos.

## Alcance

**SÍ:**
- Rate limit muy simple in-memory (Map<ip, {intentos, hasta}>) sobre
  `POST /dashboard/login`. 5 intentos por IP en 5 min → 429 durante 10 min.
- Agregar `Secure` al `Set-Cookie` cuando `NODE_ENV === "production"`.
- Log de intentos fallidos con IP redactada (`redactIp`?) para poder
  ver post-mortem si hay bruteforce.

**NO:**
- Autenticación con multi-user / roles. Un solo password compartido es
  lo que hay en V1.
- Captcha. Overkill para V1.
- Redis/Memcached para el rate limit. In-memory alcanza para un solo proceso.

## Aceptación

- [ ] 6to intento de login desde la misma IP en 5 min recibe 429.
- [ ] La cookie tiene `Secure` en producción (`NODE_ENV=production`).
- [ ] Prueba local documentada.
- [ ] Firma `// [ByAntigravity] (BRIEF-018)`.

## Bloqueos

(Vacío.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude tras revisión externa.
