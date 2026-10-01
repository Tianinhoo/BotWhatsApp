# Bitácora — Claude

Diario personal. Entradas más recientes arriba.

---

## 2026-10-01 — BRIEF-031 + BRIEF-032 + 3 fixes P2 del chequeo

**Qué hice:**

- **BRIEF-032 — SIGTERM/SIGINT handler.** Agregué `drain()` a `queue.service.js`
  (snapshot sincrónico del Map inflight con swallow de errores), `stop()` a
  `inbox.service.js` (clearInterval + espera recovery pendiente), y handler
  unificado en `src/app.js` que ejecuta `server.close() → inbox.stop() → drainQueue()
  → pool.end() → process.exit(0)` con timeout duro de 15s para exit(1). Extendí
  `tests/helpers/app-harness.js` para que `process.on()` registre en
  `signalHandlers` sin ensuciar `listenCalls`, y `app.listen` retorne un server
  stub con `.close(cb)`. Mismo ajuste al harness de `tests/dedup.test.js`.
  5 regresiones nuevas (3 en queue.test.js, 2 en inbox.test.js) + un smoke test
  nuevo (`tests/shutdown.test.js`).

- **BRIEF-031 — media entrante (mínimo honesto).** Agregué `MEDIA_HANDOFF_TYPES`
  (image, audio, video, document, location, contacts) y `MEDIA_SILENT_TYPES`
  (sticker, reaction) como sets canónicos en `src/app.js`. En el flujo del motor
  conversacional, discrimino antes de `extractSelection`: silent → log + return,
  handoff → `processMenuOption(phone, "asesor", { reason })`. Extendí
  `processMenuOption` para aceptar `extras` opcional y propagar `extras.reason` a
  `replyDeriveToHuman`. 8 regresiones nuevas (`tests/media.test.js`).

- **Fix P2 chequeo — textos del catálogo que prometían interpretar texto libre.**
  Rutas 1 y 2 de `state.service.js` decían "escribí su nombre y te ayudamos"
  pero el bot V1 no interpreta texto libre. Cambié ambos outros al criterio
  de rutas 3/4: derivar explícitamente a opción 6.

- **Fix P2 chequeo — `safeStrEqual` Unicode.** `src/routes/dashboard.js`
  comparaba `a.length !== b.length` sobre strings, pero `timingSafeEqual`
  compara buffers. "ééééééé" (string.length=7, utf8.length=14) hacía que
  `timingSafeEqual` recibiera buffers de longitud distinta y lanzara
  `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. Cambié a comparar longitud de buffer.
  2 subtests nuevos en `tests/dashboard-login.test.js`.

- **Fix P2 chequeo — bloqueo renovado por un solo fallo.** El reset de ventana
  del rate limiter requería `!bloqueadoHasta` para disparar; un bloqueo vencido
  conservaba el valor truthy y `intentos` seguía en 5. El próximo fallo subía
  a 6 y re-disparaba bloqueo inmediato. Agregué chequeo `blockExpired` en el
  reset. 1 subtest nuevo (con flujo completo bloqueo → espera → fallos nuevos).

**Verificación:**
- `DEDUP_TEST_DATABASE=0 npm test` en Node v24.18.0 (local).
- Suite: 193 tests, 186 pass, 7 skipped (bloques PostgreSQL), 0 fail.
- Antes del trabajo: 176 pass. Delta: +10 regresiones nuevas, +7 que ya existían
  reorganizadas.

**Archivos tocados:**
- `src/app.js` (SIGTERM + media discriminación + imports).
- `src/services/queue.service.js` (drain exportado).
- `src/services/inbox.service.js` (stop expuesto).
- `src/services/state.service.js` (processMenuOption acepta extras +
  textos honestos rutas 1/2).
- `src/routes/dashboard.js` (safeStrEqual con buffers + reset tras bloqueo).
- `tests/helpers/app-harness.js` (signalHandlers + server stub).
- `tests/dedup.test.js` (process.on noop + listen con .close).
- `tests/queue.test.js` + `tests/inbox.test.js` (regresiones nuevas).
- `tests/shutdown.test.js` + `tests/media.test.js` (archivos nuevos).
- `tests/dashboard-login.test.js` (2 subtests nuevos).
- Briefs 031 y 032 marcados HECHO; TAREAS.md sincronizada.

**Decisiones:**
- Para BRIEF-031, elegí "handoff" en lugar de "descargar media + interpretar".
  Mínimo honesto para Fase 0. La descarga queda como V1.1.
- Para BRIEF-032, el `drain()` es snapshot y no itera. Justificación: después
  de `server.close()` no entran nuevas requests, por lo que un snapshot captura
  todo lo pendiente. En single-process alcanza.
- NO modifiqué `scripts/preflight.js` (Codex ya lo armó bien); solo agregué
  briefs cerrados que el preflight ya respeta.
- NO cerré el bloqueo externo de GitHub (`Repository not found`): es trabajo
  del humano crear el repo remoto.
- NO cargué `.env`: trabajo del humano con credenciales reales de Meta.

**Siguiente paso:**
- El humano resuelve los 2 bloqueos externos (GitHub + .env + Meta).
- Después queda abierto el ciclo para BRIEF-025 (selección persistente de prenda)
  si se decide pre-deploy, o diferirlo a V1.1 y arrancar Fase 0 ya mismo con
  el árbol actual.

---

## 2026-09-20 — BRIEF-023 cerrado (fix prototype pollution en `resolveMenuOption`)

**Qué hice:**
- Reasigné BRIEF-023 de Codex a mí (Claude) por afinidad: el bug está en `resolveMenuOption` de `state.service.js`, código firmado por Claude.
- **Fix**: agregué `if (!Object.hasOwn(MENU_OPTIONS, key)) return null;` antes del retorno. Con eso, claves heredadas de `Object.prototype` (constructor, __proto__, toString, hasOwnProperty, valueOf, isPrototypeOf, propertyIsEnumerable, toLocaleString) ya no matchean como opciones válidas.
- **Tests**: creé `tests/menu-prototype.test.js` con 21 casos:
  - 8 casos de claves heredadas (una por cada método/prop de Object.prototype).
  - 1 caso de normalización (mayúsculas + espacios).
  - 2 casos de dispatcher completo (`processMenuOption` retorna `no_match`, cero envíos).
  - 10 casos de regresión positiva (las 7 opciones válidas + aliases siguen matcheando).
- Reutilicé el `state-harness` de Codex sin modificarlo.
- Actualicé TAREAS.md y el brief con la nueva propiedad y bitácora.

**Archivos tocados:**
- `src/services/state.service.js` (fix en `resolveMenuOption`, 3 líneas + comentario)
- `tests/menu-prototype.test.js` (nuevo, 21 tests)
- `docs/briefs/BRIEF-023-fix-menu-prototype.md` (reasignado, cerrado)
- `docs/TAREAS.md` (actualizado)

**Problemas encontrados:** ninguno. El fix es 100% aditivo, no rompe nada de la lógica preexistente.

**Suite final: 141 tests, 135 pass, 0 fail, 6 skip.**

**Reconocimiento del proceso:** el bug lo detectó Codex al escribir tests de cobertura para BRIEF-021. Es un caso perfecto de "la cobertura sirve": no era un bug crítico (ningún cliente real escribe "constructor" a un bot de ropa) pero era real y explotable (un cliente malicioso podía dejar el bot mudo). Se detectó porque Codex escribió tests con casos borde adversariales, no porque estuviera buscando el bug.

---

## 2026-09-20 — BRIEF-012 + BRIEF-013 + BRIEF-019 cerrados; BRIEF-021 y BRIEF-022 abiertos para Codex

**Qué hice:**
- **BRIEF-012 (textos + datos)**: creé `src/config/business.js` con `null` en todos los campos hasta que el humano los valide con el negocio. Reescribí las rutas 3, 4, 5 y 7 para leer de esa config: los datos no confirmados se muestran como "Por confirmar" o se omiten. Las rutas 3 y 4 ya no prometen procesar texto libre — derivan a la opción 6. Cuando el humano complete `business.js`, el árbol se ajusta solo.
- **BRIEF-013 (atribución)**: fix del `ON CONFLICT DO UPDATE` en `registerTraffic`. `origen` usa un `CASE` que solo hace upgrade (`organico → anuncio`), nunca downgrade. Los campos del referral usan `COALESCE` para preservar los datos originales cuando el nuevo mensaje no los trae. Agregué `tests/atribucion.test.js` con 3 escenarios de integración (SKIP por defecto, requieren `DEDUP_TEST_DATABASE=1`).
- **BRIEF-019 (docs limpieza)**: banners de deprecación al inicio de `DOCUMENTACION.md` y `REPORTE-PROYECTO.md` marcándolos como V0 desactualizada y apuntando a `docs/V1_OBJETIVOS.md` + `docs/TAREAS.md`. Limpié los dos comentarios de `src/app.js` que mencionaban "OpenAI".
- **Nuevos briefs para Codex**:
  - `BRIEF-021` — cobertura de tests para `state.service.js` (el árbol V1 completo hoy sin tests).
  - `BRIEF-022` — cobertura de tests para HMAC middleware y `/health`.

**Archivos tocados:**
- `src/config/business.js` (nuevo)
- `src/services/state.service.js` (rutas 3/4/5/7 reescritas + fix del `ON CONFLICT`)
- `src/app.js` (2 comentarios reescritos)
- `DOCUMENTACION.md`, `REPORTE-PROYECTO.md` (banners de deprecación)
- `tests/atribucion.test.js` (nuevo)
- `docs/briefs/BRIEF-021-tests-arbol-v1.md`, `BRIEF-022-tests-hmac-health.md` (nuevos)
- `docs/briefs/BRIEF-012-*.md`, `BRIEF-013-*.md`, `BRIEF-019-*.md` (cerrados)
- `docs/TAREAS.md` (actualizado — BRIEF-010 pasa a LISTO PARA ARRANCAR)

**Problemas encontrados:**
- Al insertar un comentario SQL con carácter unicode `→` en `state.service.js`, `node --check` tiró `SyntaxError: missing ) after argument list`. Reemplacé el `→` por texto ASCII y se resolvió. El archivo probablemente estaba en encoding no UTF-8 puro. Regla nueva: **evitar unicode decorativo en comentarios de código productivo**; queda OK en Markdown.
- Los dos archivos `DOCUMENTACION.md` (1175 líneas) y `REPORTE-PROYECTO.md` (149 líneas) están escritos como si la V0 fuera el estado actual. Reescribirlos entero excedía BRIEF-019 ("no es un rewrite"). Elegí banner + puntero a docs vivos. Si el equipo quiere una documentación V1 canónica, se abre brief nuevo (posible BRIEF-023).

**Decisiones tomadas:**
- **BRIEF-012 sin cuestionario del negocio**: el humano prefirió avanzar con "Por confirmar" antes que bloquear la Fase 0. Cuando el negocio confirme datos, se editan solo en `src/config/business.js`.
- **BRIEF-013 opción A (fix conservador)**: no separé "origen_inicial" y "última_interacción" en columnas nuevas. La opción B queda anotada como posible refactor V1.1 si aparece un caso de negocio que la justifique.
- **BRIEF-019 sin rewrite**: banners + puntero a docs vivos.

**Siguiente paso sugerido:**
- **Fase 0 está DESBLOQUEADA**. La ejecuta el humano cuando tenga 3-5 testers y siga `docs/briefs/BRIEF-010-fase0-smoke-test.md`.
- Codex arranca BRIEF-021 y BRIEF-022 (2 briefs de cobertura de tests, ideales para paralelizar con la Fase 0).
- Antigravity sigue teniendo BRIEF-018 pendiente (dashboard hardening pre-Railway).

---

## 2026-09-20 — BRIEF-015 + BRIEF-017 cerrados (resumen unificado + Necesidad)

**Qué hice:**
- Creé `src/services/summary.service.js` como **fuente única** de la lógica del Resumen para Atención (detectores de modelo/color, extracción de interés y necesidad, builder principal).
- Refactoricé `messages.service.js`: eliminé la duplicación de MODEL_PATTERNS/COLOR_KEYWORDS/detectModel/detectColor, ahora todo delega en `summary.service`. `buildHandoffSummary` es un shim asíncrono que trae mensajes y delega. `saveHandoffSummary` y `listHandoffSummaries` persisten y exponen la nueva columna `necesidad`.
- Refactoricé `dashboard.js`: el `buildHandoffSummary` local ya no duplica la lógica; ahora delega en `summary.service.buildFromContext`. Además arreglé el bug del "6": si el `interes_color` guardado parece "basura" (solo dígito o marca de sistema), se descarta y se usa el interés recién extraído.
- Migración `sql/migrations/007_necesidad.sql`: agrega columna `necesidad TEXT` a `resumenes_atencion`. Aplicada contra Neon sin conflicto.
- 17 tests nuevos en `tests/summary.test.js` cubriendo: bug del "6", filtrado de marcas de sistema, detección de modelo (dígito y palabra), detección de color (con/sin acento y falsos positivos), Necesidad y forma del payload.

**Archivos tocados:**
- `src/services/summary.service.js` (nuevo)
- `src/services/messages.service.js` (refactor: delega en summary.service, persiste necesidad)
- `src/routes/dashboard.js` (refactor: delega en summary.service, fix "6")
- `sql/migrations/007_necesidad.sql` (nuevo)
- `tests/summary.test.js` (nuevo, 17 tests)
- `docs/briefs/BRIEF-015-*.md` y `BRIEF-017-*.md` (cerrados)
- `docs/TAREAS.md` (actualizado)

**Problemas encontrados:**
- Dos tests iniciales fallaron: (1) `assert.notMatch` no existe en `node:assert/strict` (se llama `doesNotMatch`); (2) mi dedup de necesidad contra interés era demasiado agresivo — cuando había un solo texto libre, se convertía en "Por confirmar" incorrectamente. Codex lo detectó y lo anotó en el bloqueo de BRIEF-016 (buena comunicación). Ambos fixeados en el mismo pase.
- **Colisión de números en migraciones**: Codex creó `007_mensajes_estado_envio.sql` para BRIEF-011 en paralelo con mi `007_necesidad.sql`. No hay conflicto técnico (ids distintos en `schema_migrations`, tablas distintas) pero es un olor de proceso.

**Decisiones tomadas:**
- Regla del dedup de necesidad: solo contra `modelo`, no contra `interes`. Cuando hay un solo texto libre y ese texto es la mejor descripción de la situación, prefiero que aparezca duplicado parcialmente en `interes_color` y `necesidad` antes que perderlo.
- Fix del "6" en el dashboard: en vez de forzar re-extracción cada vez, chequeo si el guardado parece "basura" (`/^\d+$/` o brackets-only). Si parece basura, uso el extraído del scanner unificado.
- **Nueva regla que quedó pendiente escribir en CONVENCIONES.md**: cuando dos briefs paralelos generan migración, coordinar el número antes de aplicarlo. Sería BRIEF-021 chico o edición directa por el próximo dueño que edite ese archivo.

**Siguiente paso sugerido:**
- Antigravity: BRIEF-018 (dashboard hardening).
- Codex: cierre completo de BRIEF-016 (agregar la regresión del "6" a su lista y confirmar suite verde combinando su parte con la mía). Ya tenemos 47 tests pass / 0 fail.
- Cuando cierren BRIEF-011 y BRIEF-016, la Fase 0 se destraba.

---

## 2026-09-20 — Post-revisión externa: 9 briefs nuevos y Fase 0 aplazada

**Qué hice:**
- Ingerí la revisión externa del 2026-09-20 (6 problemas confirmados, 3 de ellos nuevos que se me habían pasado a mí).
- Reconocí los 3 que se me pasaron: (a) race condition en el dashboard que puede responder al cliente equivocado; (b) bug del "6" como interés en el resumen; (c) falta del campo "Necesidad" que estaba en el pedido original del proyecto y me lo perdí desde el día 2.
- Redacté 7 briefs nuevos: 011, 012, 013, 014, 015, 016, 017, 018, 019 (algunos con esqueleto mínimo, los 4 pre-Fase 0 con detalle completo).
- Actualicé TAREAS.md con la reorganización: nueva sección "P0 fixes críticos pre-Fase 0" con el orden acordado (014 → 011 → 012+015 → 016).
- Puse BRIEF-010 (Fase 0) en BLOQUEADO hasta cierre de los 6 pre-Fase 0.
- Agregué en BRIEF-010 la precondición de HMAC activo (`APP_SECRET` cargado + `NODE_ENV≠development`) para que la Fase 0 corra con el mismo código de producción, no con seguridad relajada.

**Archivos tocados:**
- `docs/briefs/BRIEF-011-envios-fallidos.md` (nuevo)
- `docs/briefs/BRIEF-012-textos-y-datos-validados.md` (nuevo, fusiona el 012 original con lo del negocio)
- `docs/briefs/BRIEF-013-atribucion-anuncio.md` (nuevo)
- `docs/briefs/BRIEF-014-dashboard-race-condition.md` (nuevo)
- `docs/briefs/BRIEF-015-resumen-unificado.md` (nuevo)
- `docs/briefs/BRIEF-016-tests-verdes.md` (nuevo)
- `docs/briefs/BRIEF-017-necesidad.md` (nuevo)
- `docs/briefs/BRIEF-018-dashboard-hardening.md` (nuevo)
- `docs/briefs/BRIEF-019-limpieza-docs-openai.md` (nuevo)
- `docs/briefs/BRIEF-010-fase0-smoke-test.md` (BLOQUEADO + precondiciones)
- `docs/TAREAS.md` (reorg completa)

**Problemas encontrados:**
- Como orquestador, dejé pasar 3 problemas críticos en las revisiones anteriores. La revisión externa los detectó. Reconocido en el chat.
- Regla nueva a partir de acá: **toda entrega de brief que toque código debe cerrar con `npm test` verde**. Se documenta en `CONVENCIONES.md` como parte de BRIEF-016.

**Decisiones tomadas (algunas mías, otras del humano):**
- BRIEF-015 sube a P0 pre-Fase 0 (no queda para V1.1) — decisión del humano.
- BRIEF-017 (Necesidad) es P0 pre-Fase 0. Fallback `"Por confirmar"` acordado con el humano.
- HMAC activo también en Fase 0.
- BRIEF-013 (atribución) queda P0 pre-Railway pero NO bloquea Fase 0 (los testers amigos no vienen de anuncios).
- Un responsable por archivo compartido. Codex toma 014 primero, después 011.

**Siguiente paso sugerido:**
- Codex arranca BRIEF-014 en solitario (no chocar en `dashboard.html`).
- Yo puedo arrancar en paralelo BRIEF-015 + BRIEF-017 (mismos archivos, mismo dueño).
- BRIEF-012 espera respuestas del humano al cuestionario del negocio.
- BRIEF-016 va al final para cubrir las regresiones de los otros.

---

## 2026-09-19 — Sincronización de tablero + BRIEF-009 y BRIEF-010 abiertos

**Qué hice:**
- Sincronicé `TAREAS.md`: puse BRIEF-001 y BRIEF-004 en HECHO (Antigravity los cerró en sus briefs pero olvidó actualizar el tablero maestro).
- Normalicé el estado "DONE" → "HECHO" en los briefs 001 y 004 (convención violada por Antigravity).
- Creé BRIEF-009 (HMAC warning fix) asignado a Antigravity para cerrar los huecos residuales de BRIEF-001: falta de warning en dev y el hueco cuando `NODE_ENV` no está seteado.
- Creé BRIEF-010 (Fase 0 smoke test local + Cloudflared) asignado al humano con Claude de copiloto. Paso a paso completo: setup Cloudflared en Windows, comandos, actualización del webhook en Meta, los 10 escenarios adversariales, la prueba de concurrencia bonus, tabla de resultados y Definition of Done.

**Archivos tocados:**
- `docs/TAREAS.md` (sincronizado)
- `docs/briefs/BRIEF-001-hmac-hardening.md` (DONE → HECHO)
- `docs/briefs/BRIEF-004-health-endpoint.md` (DONE → HECHO)
- `docs/briefs/BRIEF-009-hmac-warning-fix.md` (nuevo)
- `docs/briefs/BRIEF-010-fase0-smoke-test.md` (nuevo)

**Problemas encontrados:**
- Antigravity rompió la convención de estados y no actualizó el tablero maestro. Lo corregí yo como orquestador. Si vuelve a pasar, hay que llamarle la atención directo.

**Decisiones tomadas:**
- BRIEF-009 no bloquea BRIEF-010: en Fase 0 corremos sin `NODE_ENV=production`, así que el hueco actual no afecta la prueba. Pero sí debe estar cerrado antes de BRIEF-007 (deploy a Railway).
- La Fase 0 se reencuadró siguiendo la sugerencia del revisor: objetivo = "romperlo", no "demostrar que funciona". Se agregaron los 10 escenarios adversariales y la prueba de concurrencia crítica para nuestra arquitectura con estado en BD.
- Logs verbosos con `LOG_LEVEL=debug` quedaron fuera de BRIEF-010 para no atrasar la prueba. Si el humano ve que le falta visibilidad durante Fase 0, se abre un mini-brief después.

**Siguiente paso sugerido:**
- Humano arranca BRIEF-010 en cuanto tenga 3-5 testers coordinados.
- En paralelo, Antigravity puede tomar BRIEF-009 (10 líneas de trabajo real).

---

## 2026-09-19 — BRIEF-003 + BRIEF-005 cerrados (migraciones + housekeeping)

**Qué hice:**
- Copié los 5 SQL sueltos (`schema.sql`, `seed.sql`, `trafico.sql`, `estados.sql`, `resumenes.sql`) a `sql/migrations/` con nombres `001_..05_*.sql`.
- Escribí `scripts/migrate.js` con tracking en `schema_migrations`, transacciones por migración, y exit code 1 si falla (para que corte el Pre-Deploy de Railway).
- Probé el migrador contra la Neon: primera corrida aplicó las 5, segunda corrida marcó todas como salteadas.
- Endurecí `.gitignore` con `.env.*`, `!.env.example`, IDEs y basura de OS.
- Verifiqué que `openai` está fuera del árbol (`npm ls openai` → empty).
- Pinneé `engines.node` a `"22.x"`.
- Agregué el script `db:migrate` a `package.json`.
- Creé `.env.example` con las 12 claves esperadas, incluyendo el `APP_SECRET` que aún no está en el `.env` local (marca de bloqueo para BRIEF-001/007).

**Archivos tocados:**
- `sql/migrations/001_schema.sql`, `002_seed.sql`, `003_trafico.sql`, `004_estados.sql`, `005_resumenes.sql` (nuevos, copias)
- `scripts/migrate.js` (nuevo)
- `.gitignore` (reescrito)
- `.env.example` (nuevo)
- `package.json` (agregado `db:migrate` y `engines.node`)
- `docs/TAREAS.md`, `docs/briefs/BRIEF-003-*.md`, `docs/briefs/BRIEF-005-*.md` (actualizados a HECHO)

**Problemas encontrados:**
- El `package.json` había cambiado entre briefs (alguien —¿Antigravity o el humano?— ya había desinstalado `openai` y agregado `engines: ">=18.0.0"`). El Write inicial me falló con "file has been modified"; re-leí y usé Edit puntuales. Sin problema real, pero anoto el pattern: **siempre re-leer un archivo compartido antes de reescribirlo entero**.
- El driver `pg` avisa que en la próxima major va a cambiar la interpretación de `sslmode=require` — no bloqueante, pero conviene actualizar el `DATABASE_URL` a `sslmode=verify-full` en algún brief futuro para no llevarse una sorpresa.

**Decisiones tomadas:**
- No borré `init-db.js`. El brief pedía dejarlo por ahora como alias. Cuando se confirme que `db:migrate` es el flujo canónico en Railway, se deprecará con un brief chico.
- Las migraciones son **copias literales** de los SQL originales (renombradas). No hice ninguna edición al contenido, tal como pedía el alcance del brief.

**Siguiente paso sugerido:**
- **Codex está desbloqueado** para BRIEF-002 (dedup por `wamid`). La nueva migración será `sql/migrations/006_wamid_dedup.sql` y el patrón ya está aceitado.
- Antigravity y OpenCode pueden arrancar en paralelo sus briefs (001, 004, 006).

---

## 2026-09-19 — Montaje del sistema de coordinación multi-agente

**Qué hice:**
- Creé toda la estructura de `docs/`: README, V1_OBJETIVOS, EQUIPO, CONVENCIONES, TAREAS.
- Creé las bitácoras para las 4 IAs (con entradas retroactivas para OpenCode, Antigravity y yo).
- Escribí los 8 briefs iniciales (BRIEF-001 a BRIEF-008) cubriendo Fases 1, 2 y 3 del roadmap V1.
- Asigné dueños y prioridades a cada brief.

**Archivos tocados:**
- `docs/README.md` (nuevo)
- `docs/V1_OBJETIVOS.md` (nuevo)
- `docs/EQUIPO.md` (nuevo)
- `docs/CONVENCIONES.md` (nuevo)
- `docs/TAREAS.md` (nuevo)
- `docs/bitacoras/BITACORA-*.md` (nuevos)
- `docs/briefs/BRIEF-00*.md` (nuevos)

**Problemas encontrados:**
- Ninguno.

**Decisiones tomadas:**
- Adopté un formato de brief liviano (encabezado + secciones fijas). Alternativa era GitHub Issues, pero como el equipo son IAs que trabajan sobre el filesystem, los archivos MD locales son más fáciles de mantener sin dependencias externas.
- Los estados son solo 4 (TODO / EN PROGRESO / BLOQUEADO / HECHO). No agregué "REVIEW" porque en el equipo actual la revisión la hago yo y ocurre al mismo tiempo que la aceptación.

**Siguiente paso sugerido:**
- Arrancar por BRIEF-003 (migraciones versionadas) porque bloquea BRIEF-002 (wamid dedup de Codex).

---

## 2026-09-18 — Handoff summary: persistencia + endpoints

**Qué hice:**
- Diseñé la tabla `resumenes_atencion` con campos denormalizados + JSONB.
- Extendí `messages.service.js` con `buildHandoffSummary`, `saveHandoffSummary`, `getLatestHandoffSummary` y `listHandoffSummaries`.
- Hooké `replyDeriveToHuman` en `state.service.js` para generar y guardar el resumen automáticamente al pasar a `PAUSED_HUMAN`.
- Agregué endpoints REST + evento SSE `handoff` en `dashboard.js`.
- Detector de modelo (`MODEL_PATTERNS`) y color (`COLOR_KEYWORDS`) para poblar los campos denormalizados.

**Archivos tocados:**
- `sql/resumenes.sql` (nuevo)
- `src/init-db.js` (modificado)
- `src/services/messages.service.js` (modificado)
- `src/services/state.service.js` (modificado)
- `src/routes/dashboard.js` (modificado)

**Problemas encontrados:**
- OpenCode había implementado en paralelo su propio `buildHandoffSummary` on-demand en `dashboard.js`. No hay colisión de rutas y ambos enfoques son complementarios (mío persistido + auditable; suyo fresco contra el estado actual). Se mantuvieron los dos.

**Decisiones tomadas:**
- Persistir el resumen en lugar de reconstruirlo on-demand fue explícito del pedido ("se genere y guarde un JSON"). Vale la pena la fila extra.
- Detector de modelo/color por regex, no por IA. Se puede endurecer con LLM en V1.1 si los logs muestran que se pierden muchos.

---

## 2026-09-18 — Glowdown de V0 (IA generativa) a V1 (árbol de 7 rutas)

**Qué hice:**
- Reescribí `state.service.js` para incluir constantes de estado (`ORGANIC`, `MENU`, `CATALOG`, `PAUSED_HUMAN`), parser de opciones (número/id/palabra clave) y las 7 rutas del árbol.
- Reescribí `app.js`: eliminé el path con OpenAI, dejé el flujo enrutando por estado + opción del menú.
- Eliminé `src/services/agent.service.js`.
- Creé `sql/estados.sql` con la columna `estado_conversacion` sobre `clientes_whatsapp`.
- Actualicé `init-db.js` para incluir el nuevo SQL.

**Archivos tocados:**
- `src/services/state.service.js` (reescrito; se preservó el bloque de OpenCode)
- `src/app.js` (reescrito)
- `src/services/agent.service.js` (eliminado)
- `sql/estados.sql` (nuevo)
- `src/init-db.js` (modificado)

**Problemas encontrados:**
- `state.service.js` ya existía (creado por OpenCode para tráfico). Se preservó su bloque intacto y se agregó el mío debajo, con firmas separadas.

**Decisiones tomadas:**
- Mantuve la persistencia de mensajes exactamente igual que la V0 para no romper el dashboard existente.
- El árbol acepta 3 formas de selección (id interactivo, número "1"-"7", palabra clave) para ser robusto ante clientes que no tocan la lista.
