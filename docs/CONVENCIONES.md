# Convenciones del equipo

Reglas mínimas para que 4 IAs distintas puedan trabajar sobre el mismo repo
sin pisarse ni perder trazabilidad.

## 1. Firma en código (obligatoria)

Todo bloque de código **nuevo o modificado** lleva la firma de su autor,
como comentario en la línea que introduce el bloque (o en la primera línea
del archivo si es un archivo nuevo).

| Autor | Firma |
|---|---|
| Claude | `// [ByClaude]` |
| Codex | `// [ByCodex]` |
| Antigravity | `// [ByAntigravity]` |
| OpenCode | `// [ByOpenCode]` |

**Si una IA modifica código ya firmado por otra**, agrega su firma sin
borrar la del autor original. Ejemplo:

```js
// [ByOpenCode] función original
// [ByClaude] agregué el parámetro `origen` y el fallback
async function registerTraffic(phone, origen, referral = null) { ... }
```

Si el trabajo es una re-asignación de tareas (una IA termina lo que otra
dejó a medio), se agrega la etiqueta `(Reasignado)`. Ejemplo:

```js
// [ByClaude] (Reasignado) tomé este bloque de Codex, quedaba pendiente
```

## 2. Formato de brief

Cada tarea vive en `docs/briefs/BRIEF-NNN-nombre-corto.md` con este
encabezado:

```markdown
# BRIEF-NNN — Título breve

- **Dueño:** [Claude / Codex / Antigravity / OpenCode / Humano]
- **Estado:** TODO / EN PROGRESO / BLOQUEADO / HECHO
- **Prioridad:** P0 (bloquea deploy) / P1 (importante) / P2 (nice to have)
- **Creado:** YYYY-MM-DD
- **Cerrado:** YYYY-MM-DD (cuando termina)
- **Depende de:** BRIEF-XXX, BRIEF-YYY (o "ninguna")

## Objetivo
Una o dos frases.

## Contexto
Por qué se necesita, qué problema resuelve, qué pasa si no se hace.

## Alcance
- SÍ: qué archivos/funciones/tablas se pueden tocar.
- NO: qué queda explícitamente fuera de este brief.

## Aceptación
Checklist verificable:
- [ ] Test manual X pasa.
- [ ] `npm run ...` corre sin error.
- [ ] Archivo Y contiene la firma correcta.

## Notas técnicas
Snippets, comandos, archivos relevantes.

## Bloqueos
Solo se completa si aparece un bloqueo. Formato:
- YYYY-MM-DD — descripción del bloqueo — quién lo reporta.

## Bitácora del brief
- YYYY-MM-DD — evento — quién.
```

## 3. Bitácora personal

Cada IA mantiene su bitácora en `docs/bitacoras/BITACORA-<NOMBRE>.md`.

Formato de entrada:

```markdown
## YYYY-MM-DD — BRIEF-NNN (título)

**Qué hice:**
- Punto 1.
- Punto 2.

**Archivos tocados:**
- `path/to/file.js` (nuevo / modificado)

**Problemas encontrados:**
- (si hubo, describir con precisión; si no, "ninguno")

**Decisiones tomadas:**
- (si hubo trade-offs, explicar el razonamiento)

**Siguiente paso sugerido:**
- (opcional, para la próxima sesión o el siguiente dueño)
```

Las entradas se agregan **al principio del archivo** (más nuevas arriba)
para leer rápido el estado actual.

## 4. Ciclo de vida de una tarea

```
TODO           → brief escrito, dueño asignado, aún no arrancó
EN PROGRESO    → el dueño está trabajando en él
BLOQUEADO      → hay algo externo o dependencia que impide avanzar
HECHO          → aceptación completa, verificada, mergeada
```

El dueño actualiza `TAREAS.md` cuando cambia el estado.

## 5. Reportar problemas

**Los problemas SIEMPRE se documentan**. Si algo no salió, se agrega al
brief bajo "Bloqueos" y a la bitácora personal bajo "Problemas encontrados".

Formato mínimo:
- Qué se intentó.
- Qué salió mal (mensaje de error literal si aplica).
- Qué se propone para desbloquear.

Ocultar un problema es peor que reportarlo tarde.

## 6. Un brief a la vez por IA

Salvo tareas triviales (< 15 min), cada IA trabaja en **un solo brief** a la
vez. Esto evita PRs mezcladas y hace más fácil revisar.

## 7. Archivos que NO se tocan sin brief

- `sql/migrations/*.sql` una vez aplicados en producción (crear nueva migración en su lugar).
- `.env` (nunca se commitea, cada IA usa el suyo local).
- Bitácoras ajenas (cada uno escribe en la suya).

## 8. Cambios "urgentes"

Si algo se rompe en producción y hay que arreglarlo YA:
1. La IA que ve el problema abre un brief P0 con etiqueta `HOTFIX`.
2. Arranca a arreglar SIN esperar aprobación.
3. Al terminar, actualiza el brief y la bitácora igual que siempre.

La disciplina del brief se mantiene incluso en hotfix — solo se paraleliza.

## 9. Pruebas obligatorias al cerrar — [ByCodex] (BRIEF-016)

Toda entrega de brief que toque código debe cerrar con **`npm test` verde**,
ejecutado sobre los archivos actuales después de integrar cambios compartidos.
`node --check` comprueba sintaxis y no reemplaza las pruebas de comportamiento.

- Cada corrección de comportamiento incluye una regresión que reproduzca el fallo.
- Registrar comando, resultado, runtime y pruebas omitidas en el brief/bitácora.
- La suite predeterminada simula transporte y BD; no envía WhatsApp real.
- Para cambios de persistencia, aplicar las migraciones y ejecutar también la
  integración optativa con `DEDUP_TEST_DATABASE=1`. En PowerShell:

```powershell
# // [ByCodex] (BRIEF-016) Integración con PostgreSQL; transporte siempre simulado.
$env:DEDUP_TEST_DATABASE = '1'
npm test
Remove-Item Env:DEDUP_TEST_DATABASE
```

Las integraciones revierten las conversaciones sintéticas con ROLLBACK y limpian
la reserva de concurrencia por su UUID exclusivo. Las migraciones sí son cambios
persistentes. Una prueba omitida no cuenta como aprobada.

Los avisos de arranque se verifican separadamente de los logs de cada request;
no silenciar errores reales ni relajar una expectativa para disimular un fallo.
Si otro brief rompe la suite, documentar el caso y coordinar con su dueño antes
de cerrar. El frontend puede probarse con su JavaScript real y DOM/red simulados;
las verificaciones manuales de navegador deben identificarse como tales.

## 10. Numeración de migraciones — [ByCodex] (cierre de integración)

Antes de crear una migración, reservar su número y nombre en el brief y comprobar
los archivos actuales de `sql/migrations/`. Para esta ronda existen dos archivos
`007_*` ya aplicados: el migrador usa el nombre completo como id y ambas operaciones
son independientes. **No renombrarlos ni modificarlos después de aplicados**.
La próxima migración debe usar un número superior al máximo existente y coordinarse
con el resto del equipo antes de empezar.

## 11. Serialización por teléfono — [ByCodex] (BRIEF-026)

El webhook usa queue.service.processInOrder antes de esperar la deduplicación.
Todos los efectos de cada mensaje permanecen dentro del turno: tráfico, historial,
estado, envíos y resumen. Un fallo se informa al llamador sin saltarse los mensajes
siguientes. Un aviso de lentitud NO libera un trabajo que todavía puede escribir.

La cola es local a **una instancia/proceso Node**. Antes de escalar horizontalmente
o permitir procesos solapados durante despliegues, implementar coordinación
distribuida (p. ej., locks apropiados o cola compartida). La configuración del plan
de hosting por sí sola no garantiza exclusión entre procesos.

No hay durabilidad ni recuperación tras reinicio. BRIEF-027 debe conservar los
mensajes y coordinar reintentos; BRIEF-032 debe drenar la cola antes de cerrar la BD.
Las escrituras administrativas no quedan serializadas automáticamente: cualquier
nuevo flujo que modifique el estado debe evaluar su coordinación por teléfono.

Al modificar la cola, verificar FIFO, clientes independientes, fallo seguido de
trabajos pendientes, GC con un sucesor activo, aviso sin liberación, dedup lenta y
regresión catálogo/handoff. Las pruebas de espera usan un reloj controlado/gates.
