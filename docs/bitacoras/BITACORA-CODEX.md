# Bitácora — Codex

Diario personal. Entradas más recientes arriba.

---

## 2026-10-01 — Recepción durable, migración y cierre de integración

**Qué hice:** BRIEF-027 implementado con transacción antes del 200, duplicados sin
efectos, recuperación de no iniciados y revisión conservadora de envíos inciertos.
Agregué scripts/inbox-review.js y scripts/preflight.js. Migración 009 aplicada.
028/029 y timeout C1 quedan verificados en conjunto. C2/031/032/025 siguen pendientes.

**Verificación:** Node 22.23.3 + DEDUP_TEST_DATABASE=1: **176 aprobadas, 0 fallidas,
0 omitidas**, 13338.1617 ms. Sin envíos reales. Preflight: BD y esquema OK; APP_SECRET falta.

**Problemas corregidos:** prueba temporal inicial asumía sesión estable, pero Neon
usa pool por transacción. Se fijó BEGIN exterior, tabla de nombre único, SAVEPOINT
para recepciones y ROLLBACK al cerrar. Dos recibos sintéticos sql-a/sql-b quedaron
en la tabla nueva durante esa prueba; limpieza acotada por ids, teléfono y contenido
de prueba eliminó exactamente 2. Expectativas legacy ajustadas porque el inbox
descarta duplicados antes de tryClaimMessage. Un caso incierto conserva sucesores
pendientes: no los pierde ni los adelanta.

**Bloqueos externos:** push autorizado explícitamente, remoto responde Repository
not found; consulta al usuario pendiente. Primera prueba Meta espera APP_SECRET.

## 2026-10-01 — Consolidación, Node 22 y protecciones de entrada/salida
**Qué hice:**
- Checkpoint b151221 del trabajo compartido; 105 archivos revisados buscando
  credenciales locales y patrones de tokens. Se retiró VERIFY_TOKEN literal
  de DOCUMENTACION y BRIEF-010; .env sigue fuera de Git.
- Node oficial 22.23.3 descargado en TEMP y SHA256 verificado; Node global intacto.
- BRIEF-029 propaga errores de estado; BRIEF-028 procesa todos los mensajes del
  lote, conserva FIFO y relaciona contactos por wa_id.
- BRIEF-030: cancelación real de peticiones a los 8s, sin reintentos ciegos.
- BRIEF-010 distingue conexión A de recorrido B, exige HMAC y posterga 025.

**Verificación:** Node 22.23.3, 168 casos/162 aprobados/6 PostgreSQL omitidos/0 fallos.
**Bloqueos:** push autorizado explícitamente, pero GitHub devuelve Repository not
found. Esperando URL/acceso del usuario. BD configurada agotó conexión de 5s;
APP_SECRET ausente. No se enviaron WhatsApps ni se abrió túnel.
**Problemas durante preparación:** falso positivo de URL de BD corregido (era un
ejemplo); npm exec no finalizó y se sustituyó por distribución oficial; un script
intentó reasignar const después de editar app.js, se corrigió el paso documental.
**Límites:** 027 sigue pendiente; C2/circuit breaker no implementado. No hay prueba
real ni declaración de preparación productiva.

## 2026-10-01 — BRIEF-026 implementado — [ByCodex]

**Qué hice:** implementé FIFO por teléfono antes de deduplicar, integrada con el
webhook real. El tail interno siempre resuelve; cada llamador recibe su propio
resultado/error. GC protegido contra sucesores, aviso de lentitud a los 10s sin
liberar trabajo activo y limpieza de temporizadores. Un cliente no bloquea a otros.

**Archivos tocados:** nuevos src/services/queue.service.js, tests/queue.test.js,
tests/state.race.test.js; modificados src/app.js, helpers app/state, BRIEF-026,
CONVENCIONES, TAREAS (fila propia y fecha) y esta bitácora. Sin editar .env, SQL,
servicios del árbol, bitácoras ajenas ni briefs de otros responsables.

**Verificación:** 11 pruebas nuevas: 6 de cola y 5 del webhook con motor de estados
real, BD/transporte simulados. B1 y orden con dedup lenta fallaron antes de integrar
la cola. Después pasaron 11/11. npm test integrado, DEDUP_TEST_DATABASE=0, Node
v24.18.0: **161 casos, 155 aprobados, 0 fallidos, 6 omitidos** (bloques PostgreSQL,
incluido cleanup). Node 22 y transporte/BD reales no verificados. Sin migraciones.
Diff del código comparado contra copia temporal para preservar trabajo existente.

**Problemas encontrados:** corregí durante la preparación un escape de regex en
una prueba nueva y un reemplazo documental que esperaba CRLF cuando había LF.
El primer script de cierre documental falló por escapes de Markdown dentro de
JavaScript; se reescribió usando datos JSON separados del código. Estos fallos de
herramientas no modificaron la implementación validada. Las regresiones demostraron
la carrera y el adelantamiento de mensajes antes de integrar la corrección.

**Decisiones:** limitar esta entrega a BRIEF-026. Mantener comportamiento HTTP,
dedup persistente y árbol existentes. Cola local, no distribuida ni duradera. El
aviso se emite durante la espera; nunca simula una cancelación. Sin commit ni PR:
el repo contiene numerosos cambios anteriores de varios autores sin consolidar.

**Siguiente paso:** BRIEF-027 debe definir recepción duradera y recuperación con
contenido persistido e idempotencia de envíos; conservar pendientes 028–032 y 025.
BRIEF-026 queda HECHO localmente, sin declarar el bot listo para producción.

## 2026-09-30 — Chequeo solicitado por el propietario — [ByCodex]

**Qué hice:** revisé documentación V1, código del webhook, estados, dashboard, mensajería y migraciones; ejecuté pruebas y reproducciones aisladas. Informe: `docs/CHEQUEO-2026-09-30.md`.

**Verificación:** `npm test` con `DEDUP_TEST_DATABASE=0`, Node v24.18.0: 150 casos, 144 aprobados, 0 fallidos, 6 omitidos. Servicio local en puerto 3001: ECONNREFUSED. Conexión directa PostgreSQL: timeout expired; esquema y migraciones actuales no verificados. Sin WhatsApp real ni escrituras de BD.

**Problemas encontrados:** falta APP_SECRET/NODE_ENV en .env; carrera catálogo/handoff reproducida; lote de dos mensajes procesa uno; recepción confirmada antes de persistir; error de lectura devuelve ORGANIC; catálogo promete interpretar modelos; login Unicode lanza excepción y bloqueo vencido se renueva con un solo fallo. Documentación Fase 0 contradictoria; numerosos cambios locales sin consolidar. Detalles y prioridades en el informe.

**Archivos tocados:** solo el informe nuevo y esta bitácora. Código, .env, migraciones y bitácoras ajenas preservados.

**Decisiones:** documentar hallazgos sin implementar correcciones en un pedido de chequeo. No ejecutar integración con BD ni migraciones contra un entorno cuya conectividad no quedó verificada. El shell restringido falló al crear proceso Windows (1056); las lecturas y comprobaciones se realizaron con aprobación fuera del sandbox.

**Siguiente paso:** resolver conexión/configuración y los fallos P1 antes de exponer el bot; repetir validación en Node 22 y realizar Fase 0.

## 2026-09-20 — BRIEF-022 (tests HMAC y health) — [ByCodex]

**Qué hice:** cerré 12 pruebas de HMAC y 4 de `/health`. Un subagente trabajó en archivos separados conforme a la autorización del usuario para paralelizar. Revisé la implementación y ejecuté la suite conjunta antes de marcar HECHO.

**Archivos tocados:** `tests/hmac.test.js`, `tests/health.test.js`, `tests/helpers/app-harness.js` (nuevos), brief 022, TAREAS y esta bitácora. Todos los nuevos llevan `// [ByCodex] (BRIEF-022)`.

**Verificación:** prueba dirigida 16/16; cierre con `npm test` en Node v24.18.0: **114 aprobadas, 0 fallidas, 6 omitidas, 0 TODO (120 casos)**. Incluye los 46 casos nuevos de BRIEF-021 y los 52 previos. Seis omitidos de los bloques optativos PostgreSQL, incluido cleanup; no cuentan como aprobados. Node 22 pendiente del despliegue. `git diff --check` sin errores de whitespace.

**Problemas encontrados:** `spawn EPERM` en sandbox; resuelto ejecutando el runner con aprobación fuera del sandbox. Sin bugs productivos detectados en los escenarios de HMAC/health.

**Decisiones tomadas:** cargar `app.js` íntegro en VM, crypto real y dobles explícitos de entorno, servicios y servidor. Comprobar el procesamiento posterior a HMAC y la ausencia de efectos tras rechazos. Reloj simulado para verificar la frontera 1999/2000 ms sin esperas reales. Sin sockets, `.env`, WhatsApp ni BD reales. Los hashes de 34 archivos de src/public/sql/scripts coinciden antes/después de ambos briefs.

**Siguiente paso sugerido:** mantener la comprobación de HMAC real en Fase 0 y Node 22 en despliegue.

## 2026-09-20 — BRIEF-021 (tests árbol V1) — [ByCodex]

**Qué hice:** agregué 46 tests unitarios de todas las funciones públicas de `state.service.js`, sus siete rutas, parser y alias, reapertura, saludo y menú, tráfico y persistencia de estados. Cubrí los efectos de catálogo y resumen, configuraciones comerciales confirmadas/ausentes y fallos de transporte, resumen y BD.

**Archivos tocados:** `tests/state.service.test.js`, `tests/helpers/state-harness.js` (nuevos), brief 021, TAREAS y esta bitácora. Creé `docs/briefs/BRIEF-023-fix-menu-prototype.md` para un defecto detectado, sin implementar corrección productiva.

**Verificación:** `npm test` final junto con BRIEF-022: **114 aprobadas, 0 fallidas, 6 omitidas, 0 TODO (120 casos)** en Node v24.18.0. Pruebas de PostgreSQL optativas no ejecutadas. Firmas verificadas y hashes de 34 archivos productivos sin cambios. No se tocaron pruebas previas ni dependencias. Node 22 pendiente del despliegue.

**Problemas encontrados:** `spawn EPERM` al intentar el runner en sandbox; suite aprobada fuera del sandbox pasó. Bug real reproducido: `constructor` y `__proto__` se resuelven como opciones heredadas y el webhook termina sin respuesta. Registrado en BRIEF-023 TODO; no se corrigió ni se presenta como resuelto por la suite verde.

**Decisiones tomadas:** ejecutar el servicio real en VM sin modificar exports ni caché global. Dobles para dependencias externas; observar transiciones a través de las consultas SQL reales que emite el módulo. El mock de salida ejecuta el callback y no duplica su persistencia, que se verifica en la suite de BRIEF-011. Caracterizar el fallback actual de lectura fallida a ORGANIC sin cambiar política. No añadir tests omitidos/TODO para ocultar el bug del parser: la reproducción y las regresiones pendientes pertenecen al brief-fix separado.

**Siguiente paso sugerido:** tomar BRIEF-023 como corrección separada; conservar la validación manual de Fase 0.

## 2026-09-20 — BRIEF-016 (suite e integración final) — [ByCodex]

**Qué hice:** recuperé las expectativas del aviso HMAC; agregué npm test y reglas de cierre en CONVENCIONES. Sumé pruebas de dashboard, envíos y contrato de resumen. Tras la confirmación del usuario de que Claude terminó, corregí el borde `6` sin modelo/color excluyendo comandos aislados 1–7 de texto libre y conecté Necesidad a la tarjeta con fallback y escape HTML.

**Archivos tocados:** `package.json`, `tests/dedup.test.js`, `tests/dashboard.test.js`, `tests/outbound.test.js`, `tests/summary-integration.test.js`, `tests/helpers/dashboard-harness.js`, `tests/helpers/outbound-harness.js`, `tests/summary.test.js` (comentario corregido), `src/services/summary.service.js` (filtro puntual), `public/dashboard.html` (cuarto campo), CONVENCIONES, briefs propios, tablero y esta bitácora.

**Verificación:** `npm test`: **52 aprobadas, 0 fallidas, 2 omitidas**. Con `DEDUP_TEST_DATABASE=1`: **54 aprobadas, 0 fallidas, 0 omitidas**. Node 24.18.0 local. `git diff --check` sin errores. Pruebas reales del script frontend en DOM simulado; ninguna llamada real a WhatsApp. Repetir bajo Node 22.x y navegador real en la verificación de despliegue/Fase 0.

**Problemas encontrados:** avisos HMAC contaminaban los logs del request (corregido sin silenciarlos). Durante el trabajo concurrente, Claude introdujo temporalmente `assert.notMatch` y descartaba necesidad cuando coincidía con interés; esperé a su corrección. Luego las regresiones propias reprodujeron el `6` residual. El usuario confirmó fin de su trabajo y se integró la corrección mínima. Dos migraciones 007 ya aplicadas coexisten por nombre completo; no se renombraron.

**Decisiones tomadas:** preservar código y firmas de Claude; expectativas estrictas de no usar comandos como interés; separar aceptado de entregado. Documentar coordinación de números de migración. Sin cambios de datos comerciales ni despliegue.

**Siguiente paso:** BRIEF-012 (dueño Claude + humano) y verificación manual de Fase 0 con HMAC real. Mis briefs 014, 011 y 016 quedan HECHO.

## 2026-09-20 — BRIEF-011 (envíos fallidos) — [ByCodex]

**Qué hice:** contrato de transporte por excepciones, registrador compartido `sendAndRecord`, historial con `estado_envio`, HTTP 502 ante rechazo y estados visibles en el dashboard. Un rechazo aborta texto, menú o secuencia de imágenes antes de avanzar estado/catalogo. Error sin respuesta queda pendiente de confirmar; si falla el historial tras aceptación se informa esa condición sin afirmar rechazo.

**Archivos tocados:** `src/services/whatsapp.service.js`, `src/services/outbound.service.js` (nuevo), `src/services/messages.service.js` (solo persistencia de mensajes), `src/services/state.service.js` (helpers de salida), `src/routes/dashboard.js` (salida/lectura de estado), `public/dashboard.html`, `sql/migrations/007_mensajes_estado_envio.sql`, pruebas y documentos propios.

**Verificación:** migración aplicada y migrador repetido sin pendientes; rechazo simulado guardado como fallido en PostgreSQL, estado MENU conservado y ninguna derivación nueva. Conversaciones de integración revertidas mediante ROLLBACK. Cierre conjunto: 54/54 pruebas aprobadas.

**Problemas encontrados:** suite ajena cambió durante la integración; se registró el impedimento y se esperó hasta terminar la coordinación. Advertencia SSL del driver preexistente, sin cambios a credenciales/configuración. El sandbox bloquea subprocesos de Node con `spawn EPERM`; runner ejecutado con permisos autorizados.

**Decisiones tomadas:** columna nullable (no inventar confirmación para historial viejo), `enviado` significa aceptación, `pendiente` indica incertidumbre de transporte, sin reintentos automáticos. Se conserva la marca informativa del catálogo y se registran resultados por imagen.

## 2026-09-20 — BRIEF-014 (dashboard sincronizado) — [ByCodex]

**Qué hice:** generaciones de selección/carga, validación del destinatario, carga conjunta de hilo y resumen, bloqueo del input y descarte de respuestas obsoletas. Captura del destinatario al click; bloqueo de doble Enter; protección de borradores al completar envíos antiguos.

**Archivos tocados:** `public/dashboard.html`, `tests/dashboard.test.js`, `tests/helpers/dashboard-harness.js`, brief 014, tablero y esta bitácora. Como prerrequisito de BRIEF-016: `package.json` (npm test) y `tests/dedup.test.js` (separar aviso de arranque HMAC de logs de request).

**Verificación:** `npm test`: 13 aprobadas, 0 fallidas, 1 integración PostgreSQL omitida. Ocho regresiones ejecutan el JavaScript real del dashboard con DOM y red simulados. Pasos manuales documentados; no se enviaron mensajes reales.

**Problemas encontrados:** `spawn EPERM` del runner dentro del sandbox; ejecución autorizada fuera del sandbox pasó. El hilo devuelve un array (puede estar vacío), por eso se valida el teléfono por fila y el del resumen, además de la generación local.

**Decisiones tomadas:** descartar respuestas antiguas sin cambiar endpoints; no ocultar errores de resumen permitiendo responder con carga parcial. JSON no permite comentarios: firma de la adición de `npm test` en `_comment_test` de `package.json`.

**Siguiente paso:** BRIEF-011, luego completar BRIEF-016 y sus regresiones de resumen cuando esté disponible BRIEF-015.

## 2026-09-19 — BRIEF-002 (deduplicación por wamid) — [ByCodex]

**Qué hice:**
- Verifiqué BRIEF-003 HECHO y completé la deduplicación previa al procesamiento del webhook.
- Apliqué `006_wamid_dedup` con `npm run db:migrate`; la segunda ejecución confirmó que las seis migraciones estaban al día.
- Ejecuté seis pruebas satisfactorias, incluida PostgreSQL real: ocho reservas concurrentes con un ganador, menú y handoff sin efectos duplicados, errores de BD, estados sin mensaje y compatibilidad sin id.
- Comprobé sintaxis y whitespace. Las pruebas no envían WhatsApp; revierten las conversaciones sintéticas y eliminan únicamente la reserva de concurrencia identificada por UUID.

**Archivos tocados:**
- `src/services/dedup.service.js` (nuevo).
- `sql/migrations/006_wamid_dedup.sql` (nuevo).
- `src/app.js` (import y control de deduplicación).
- `tests/dedup.test.js` (nuevo).
- `docs/briefs/BRIEF-002-wamid-dedup.md`, `docs/TAREAS.md` y esta bitácora (actualizados).

**Problemas encontrados:**
- `spawn EPERM` del runner en sandbox: se ejecutó mediante permisos elevados.
- `The server does not support SSL connections` en el primer arnés: la nueva dependencia de health cargó el pool antes de dotenv. Se aisló ese import en las pruebas.
- `current transaction is aborted, commands ignored until end of transaction block` en integración: se corrigieron los teléfonos sintéticos a números cortos y se agregó detección temprana de logs de error. Las seis pruebas finales pasaron.
- Advertencia preexistente del driver sobre semántica SSL futura. Node local 24.18.0; falta repetir en Node 22.x del despliegue.

**Decisiones tomadas:**
- Usar `ON CONFLICT (wamid) DO NOTHING` para limitar el conflicto esperado a la PK; no ocultar otros errores de BD.
- Conservar HTTP 200 inmediato y flujo de mensajes sin id según el brief. La reserva evita duplicados, pero no recupera procesamiento incompleto tras una caída; límite documentado expresamente.
- Conservar código y firmas de otros autores y los cambios simultáneos de Antigravity. No modificar el árbol ni el dashboard.

**Siguiente paso sugerido:**
- Revisión del equipo y pruebas en Node 22.x antes del despliegue. Retención/limpieza y recuperación ante fallos quedan registradas para V1.1.

## Estado actual

**Completado:** BRIEF-002 (deduplicación por `wamid`), 2026-09-19.

**Dependencia verificada:** BRIEF-003 HECHO; migración `006_wamid_dedup.sql` aplicada.

## Notas para vos, Codex

Cuando arranques:

1. Leé [`../briefs/BRIEF-002-wamid-dedup.md`](../briefs/BRIEF-002-wamid-dedup.md) completo.
2. Verificá que BRIEF-003 esté HECHO en [`../TAREAS.md`](../TAREAS.md). Si no, pausá y pedile a Claude.
3. Actualizá TAREAS.md a EN PROGRESO cuando empieces.
4. Firma tu código con `// [ByCodex]`.
5. Al terminar: actualiza TAREAS.md a HECHO, agrega entrada acá con el formato de [CONVENCIONES.md](../CONVENCIONES.md).

## Histórico

Codex se quedó sin tokens durante el diseño del handoff summary (2026-09-18);
Claude asumió esa tarea. Ver [BITACORA-CLAUDE.md](BITACORA-CLAUDE.md).
