# BRIEF-004 — Endpoint `/health` con check de BD

- **Dueño:** Antigravity
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** ninguna

## Objetivo

Exponer un endpoint `GET /health` que sirva como **liveness + readiness
probe** para Railway y para monitoreo externo (UptimeRobot, Better Uptime,
etc.).

## Contexto

Sin health check confiable no podemos:
- Configurar Railway para reintentar el deploy si el proceso arranca pero
  no puede hablar con Neon.
- Enterarnos de que el bot está "vivo" pero con la BD caída (peor caso:
  responde 200 al webhook y pierde el mensaje).

## Alcance

**SÍ:**
- Nuevo handler `GET /health` en `src/app.js` (o en una nueva ruta chica
  tipo `src/routes/health.js` si te queda más limpio).
- Consulta trivial a la BD (`SELECT 1`) con timeout corto.
- No requiere autenticación (es infra, no dashboard).

**NO:**
- Métricas complejas (Prometheus, etc.). Para V1 con un JSON alcanza.
- Estados de servicios externos (Meta API). Otro brief eventual.

## Aceptación

- [ ] `GET /health` responde `200 {ok:true, db:"up", uptime:<segundos>}` cuando todo está bien.
- [ ] Si la query a BD falla o tarda más de 2s, responde `503 {ok:false, db:"down"}`.
- [ ] El endpoint **NO** requiere el password del dashboard.
- [ ] Firma `// [ByAntigravity]` en el bloque nuevo.
- [ ] `node --check` del archivo modificado pasa.

## Notas técnicas

Sugerencia de handler:

```js
// [ByAntigravity] Health check: liveness + readiness (con ping a BD).
const startedAt = Date.now();

app.get("/health", async (_req, res) => {
  try {
    const dbCheck = pool.query("SELECT 1");
    const timeout = new Promise((_, r) =>
      setTimeout(() => r(new Error("db_timeout")), 2000)
    );
    await Promise.race([dbCheck, timeout]);

    return res.json({
      ok: true,
      db: "up",
      uptime_s: Math.round((Date.now() - startedAt) / 1000)
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      db: "down",
      error: err.message
    });
  }
});
```

**Nota:** el `pool` viene de `require("./services/db")`. Importarlo si no
está ya en scope de `app.js`.

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
