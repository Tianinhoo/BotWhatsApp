# BRIEF-002 — Deduplicación por `wamid`

- **Dueño:** Codex
- **Estado:** HECHO
- **Prioridad:** P0
- **Creado:** 2026-09-19
- **Cerrado:** 2026-09-19
- **Depende de:** BRIEF-003 (migraciones versionadas — necesario para meter la migración `006_wamid_dedup.sql` en el pipeline correcto)

## Objetivo

Garantizar que cada mensaje de WhatsApp se procese **exactamente una vez**,
aunque Meta reintente el webhook.

## Contexto

Meta reintenta agresivamente cualquier webhook que no responda 200 en
pocos segundos. Sin idempotencia, un reintento causa:
- Doble respuesta al cliente (menús duplicados).
- Doble transición de estado (ejemplo: `ORGANIC → MENU → MENU` innecesario).
- Doble handoff y por lo tanto dos filas duplicadas en `resumenes_atencion`.

El objeto `message` del webhook trae un identificador único `message.id`
(formato `wamid.HBg...`). Usándolo como PK de una tabla de "mensajes
procesados", el segundo intento choca contra `UNIQUE` y salimos temprano.

## Alcance

**SÍ:**
- Nueva migración `006_wamid_dedup.sql` en `sql/migrations/`.
- Nuevo servicio o helper para el check atómico (recomiendo `src/services/dedup.service.js`, chico y con una única función `tryClaimMessage(wamid, phone)`).
- Modificar `src/app.js` (POST `/webhook`) para consultar antes de procesar.

**NO:**
- Job de limpieza de la tabla (agregar como sub-tarea en el brief, pero el
  cron/janitor puede quedar para V1.1).
- Cambios en `state.service.js` (la idempotencia vive antes del árbol).

## Aceptación

- [x] Migración `006_wamid_dedup.sql` creada.
- [x] Ejecutar `npm run db:migrate` la aplica sin errores.
- [x] Tabla `mensajes_procesados` existe con `wamid TEXT PRIMARY KEY`.
- [x] Enviar dos veces el mismo webhook (con el mismo `wamid`) produce:
  - La primera vez: procesamiento normal + fila insertada.
  - La segunda vez: log `[dedup] wamid X ya procesado` y NADA más.
- [x] Ningún cambio en `estado_conversacion` de la segunda vuelta.
- [x] Ninguna nueva fila en `mensajes` ni en `resumenes_atencion` de la segunda vuelta.
- [x] Firma `// [ByCodex]` en todo lo nuevo (en SQL dentro de comentario `--`).

## Notas técnicas

**SQL de la migración:**

```sql
-- [ByCodex] Idempotencia de webhooks de Meta.
CREATE TABLE IF NOT EXISTS mensajes_procesados (
  wamid        TEXT PRIMARY KEY,
  telefono     TEXT NOT NULL,
  procesado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_procesados_fecha
  ON mensajes_procesados (procesado_en);
```

**Helper (sugerido, ajustar a gusto):**

```js
// [ByCodex] Idempotencia atómica: gana el primer INSERT, los demás salen por 23505.
async function tryClaimMessage(wamid, phone) {
  try {
    await pool.query(
      `INSERT INTO mensajes_procesados (wamid, telefono) VALUES ($1, $2)`,
      [wamid, phone]
    );
    return true; // primera vez
  } catch (err) {
    if (err.code === "23505") return false; // duplicado
    throw err;
  }
}
```

**Uso en `app.js`, apenas se extrae `message` y antes de cualquier otra cosa:**

```js
// [ByCodex] Dedup por wamid — ganamos la carrera con INSERT UNIQUE.
if (message.id) {
  const isNew = await tryClaimMessage(message.id, message.from);
  if (!isNew) {
    console.log(`[dedup] wamid ${message.id} ya procesado, ignoro.`);
    return;
  }
}
```

**Importante:** el `res.sendStatus(200)` ya se manda al principio del handler,
así que aunque el dedup detecte duplicado, Meta ya recibió el 200. Perfecto.

## Bloqueos

- 2026-09-19 — No arrancar hasta que BRIEF-003 esté HECHO (necesitamos `scripts/migrate.js` y la carpeta `sql/migrations/` para agregar `006_*`). — Claude.
- 2026-09-19 — [ByCodex] Resuelto: BRIEF-003 figura HECHO y se verificó el migrador existente.
- 2026-09-19 — [ByCodex] El runner de pruebas falló inicialmente con `spawn EPERM` dentro del sandbox. Se repitió mediante ejecución con permisos elevados.
- 2026-09-19 — [ByCodex] La prueba cargó inicialmente el pool antes de dotenv debido a la nueva dependencia de `/health` añadida en paralelo: `The server does not support SSL connections`. Se aisló esa dependencia en el arnés; no se cambió la configuración de BD.
- 2026-09-19 — [ByCodex] Una corrida de integración terminó con `current transaction is aborted, commands ignored until end of transaction block`. Se sustituyeron los teléfonos sintéticos largos por números de 15 dígitos y se añadió una aserción sobre errores del handler antes de consultar las filas. La corrida final pasó completa.

## Implementación y verificación — [ByCodex]

- `src/services/dedup.service.js`: `INSERT ... ON CONFLICT (wamid) DO NOTHING` parametrizado. `rowCount === 1` indica el único ganador; otros errores de BD se propagan. No usa un SELECT previo ni captura indiscriminadamente errores UNIQUE.
- `src/app.js`: reserva después de descartar webhooks sin mensaje y antes del log de recepción, tráfico, historial, estado y envíos. El duplicado solo genera el log `[dedup]`; ambos reciben el HTTP 200 existente.
- `sql/migrations/006_wamid_dedup.sql`: tabla con PK de texto, teléfono y fecha, más índice temporal. `npm run db:migrate` aplicó una migración; una segunda ejecución omitió las seis sin cambios.
- `tests/dedup.test.js`: seis pruebas aprobadas. La integración usa PostgreSQL real y el handler y servicios reales, con transporte WhatsApp simulado. No llama al endpoint público ni envía mensajes a clientes.
- Ocho reservas simultáneas en conexiones del pool: exactamente un ganador. Para menú y handoff se compararon filas completas antes y después de dos reintentos concurrentes en las cinco tablas involucradas, además del número de respuestas y logs. Las filas de conversación se revierten con ROLLBACK y la reserva de concurrencia se elimina por su UUID exclusivo.
- Comprobaciones de sintaxis con `node --check` para app, servicio y pruebas; `git diff --check -- src/app.js` sin errores. Ejecución local con Node 24.18.0; el proyecto declara Node 22.x, pendiente de comprobar también en ese runtime de despliegue.
- Se conservaron los bloques y firmas existentes, incluidos los cambios simultáneos de Antigravity. No se modificaron el árbol conversacional ni el dashboard.

Comandos reproducibles (PowerShell):

```powershell
# // [ByCodex] (Aplicar migraciones y ejecutar las pruebas del brief).
npm run db:migrate
node --test tests/dedup.test.js
$env:DEDUP_TEST_DATABASE = '1'
node --test tests/dedup.test.js
Remove-Item Env:DEDUP_TEST_DATABASE
```

Sin `DEDUP_TEST_DATABASE=1`, se ejecutan cinco pruebas y se omite la integración. La integración requiere `DATABASE_URL` configurada en `.env` y las migraciones aplicadas.

## Límites y seguimiento V1.1 — [ByCodex]

La estrategia pedida garantiza **como máximo un intento de procesamiento por wamid**, no ejecución completa exactamente una vez ante fallos. `procesado_en` registra el momento de reserva. Si el proceso cae después del INSERT, el reintento se descarta aunque el trabajo haya quedado incompleto. Si falla la reserva, el handler corta y registra el error; el HTTP 200 ya fue enviado. Se conserva el comportamiento indicado por el brief.

Los mensajes sin `id` conservan el flujo anterior para compatibilidad con `test-webhook.js`; no se pueden deduplicar. El handler continúa tomando el primer mensaje de la primera entrada/cambio, como antes.

- [ ] V1.1: definir retención e implementar limpieza periódica de `mensajes_procesados`; al borrar un wamid, un reintento antiguo volvería a aceptarse.
- [ ] V1.1: si se necesita recuperación garantizada, diseñar una bandeja persistente con estados, reintentos y control de efectos externos antes de confirmar el webhook.
- [ ] Despliegue: repetir las pruebas con Node 22.x. El driver emitió una advertencia preexistente sobre futuros cambios de semántica SSL; revisar en la próxima actualización de dependencias.

## Bitácora del brief

- 2026-09-19 — Brief creado por Claude.
- 2026-09-19 — [ByCodex] Implementación terminada, migración aplicada y seis pruebas aprobadas (incluida PostgreSQL). Tablero y bitácora actualizados; cierre del brief en el workspace, sin commit ni despliegue.
