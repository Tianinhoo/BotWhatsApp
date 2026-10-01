# BRIEF-011 — Envíos fallidos: distinguir aceptado, fallido y "por entregar"

- **Dueño:** Codex
- **Estado:** HECHO
- **Prioridad:** P0 pre-Fase 0 (bloquea BRIEF-010)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** BRIEF-014 (mismo dueño, ejecutar después para no chocar en `dashboard.html`)

## Objetivo

Que un mensaje que Meta rechaza NO aparezca como enviado en el
dashboard, y que el estado del bot no avance como si el cliente lo
hubiera recibido.

## Contexto

`src/services/whatsapp.service.js:34-55` — `sendTextMessage` atrapa la
excepción y retorna `{ error: true, message }`. `sendImageMessage` hace
lo mismo. Ambos llamadores (`sendAndLog` en `state.service.js:429-432`
y el endpoint `/dashboard/api/conversation/:phone/reply` en
`dashboard.js:231-265`) **ignoran ese retorno**.

Efecto: si Meta rechaza (token vencido, ventana 24 h, número inválido,
media_id expirado), la fila queda en `mensajes` con `origen='bot'` como
si hubiera salido, y en la ruta que hace `setUserState` el estado avanza.

## Alcance

**SÍ:**
- `whatsapp.service.js`: distinguir claramente estados. Tres opciones válidas:
  1. Volver a tirar la excepción (contrato original) y que el llamador use `try/catch`.
  2. Retornar un objeto explícito `{ ok: true, wamid }` o `{ ok: false, reason, meta }` y forzar a los llamadores a chequear.
  3. Retornar un discriminated union tipado en JSDoc para claridad.
  Elegí una y aplicala consistente.
- `state.service.js` — `sendAndLog` chequea el resultado. Si falló:
  - **NO** guardar la fila como `origen='bot'` normal.
  - Guardar la fila como `origen='bot'` con contenido prefijado `[FALLIDO] ...` (o marcar con nueva columna, ver decisión de esquema abajo).
  - **NO** avanzar `estado_conversacion`.
  - Loguear con `safeError` y `redactPhone`.
- Endpoint `/dashboard/api/conversation/:phone/reply` (`dashboard.js:231`):
  - Si el envío falla, responder 502 al dashboard con el detalle.
  - No guardar la fila como enviada.
- Dashboard (`public/dashboard.html`): mostrar mensajes fallidos con un ícono/color distinto de los enviados con éxito.

**Decisión de esquema (elegir uno):**
- A) Prefijo `[FALLIDO]` en `contenido` — cero migración, cambio de texto nomás.
- B) Nueva columna `mensajes.estado_envio TEXT` con `enviado / fallido / pendiente`. Nueva migración `007_mensajes_estado_envio.sql`.

Recomiendo B: es limpio, permite después sumar `entregado` cuando manejemos webhooks de status de Meta (V1.1).

**NO:**
- Manejar webhooks de status `delivered/read` de Meta — V1.1, BRIEF-023.
- Reintentos automáticos — V1.1.

## Aceptación

- [x] Con Meta simulando rechazo (mockear axios), un mensaje aparece en
      el dashboard marcado como fallido, no como enviado.
- [x] El estado del cliente NO avanza cuando el envío falla.
- [x] El endpoint del dashboard responde 502 con detalle cuando falla el envío desde la asesora.
- [x] Existe una prueba nueva en `tests/` que cubre el rechazo simulado
      (mock del transporte, verificación del estado y de la fila en `mensajes`).
- [x] Firma `// [ByCodex] (BRIEF-011)` en los bloques modificados.
- [x] Suite de tests verde tras el cierre: 54/54 aprobadas con PostgreSQL; cierre coordinado con BRIEF-016.

## Notas técnicas

Ejemplo del nuevo `sendAndLog`:

```js
// [ByCodex] (BRIEF-011) Ahora respeta el resultado del envío.
async function sendAndLog(phone, text) {
  const result = await sendTextMessage(phone, text);
  if (!result?.ok) {
    console.error(
      `[send] Envío fallido a ${redactPhone(phone)}:`,
      safeError(result?.error || new Error("unknown"))
    );
    await saveMessage(phone, "bot", text, { estado_envio: "fallido" });
    return { ok: false };
  }
  await saveMessage(phone, "bot", text, { estado_envio: "enviado" });
  return { ok: true };
}
```

Cada ruta del árbol V1 debe usar el retorno de `sendAndLog` para decidir
si transiciona de estado o si aborta y notifica.

## Bloqueos

- 2026-09-20 — [ByCodex] Implementación y pruebas propias completas. El cierre formal espera `npm test` conjunto verde: durante la verificación se incorporaron cambios de BRIEF-015/017 con fallos de resumen. El usuario confirmó que Claude continúa trabajando y pidió dejarle esos archivos. No se modifican sus extractores ni su suite.
- 2026-09-20 — [ByCodex] Resuelto: el usuario confirmó que Claude terminó. Se completó la integración bajo BRIEF-016 y la suite final quedó verde, también con PostgreSQL.

## Implementación y verificación — [ByCodex]

Se eligió **opción B de esquema** y **contrato por excepciones**:

- `007_mensajes_estado_envio.sql` agrega columna nullable con CHECK de `enviado`, `fallido`, `pendiente`. Migración aplicada; segunda ejecución del migrador sin cambios pendientes. NULL conserva historial anterior, entradas del cliente y marcas informativas sin inventar confirmaciones.
- `whatsapp.service.js` propaga errores en texto, imágenes, listas y botones. `outbound.service.js` centraliza envío y registro; `state.service.js` y el endpoint del dashboard lo usan.
- `enviado` significa **aceptado por Meta**, no entregado. Rechazo HTTP se guarda como `fallido`; error sin respuesta de Meta se guarda como `pendiente` (resultado incierto). Ambos abortan la ruta y no reintentan.
- Si la aceptación tuvo éxito pero falla la escritura del historial, se informa explícitamente que Meta aceptó el mensaje y que no debe reenviarse sin verificar. No se genera un falso rechazo.
- Las imágenes se registran individualmente; un rechazo corta la secuencia y evita marcar catálogo enviado o cambiar estado. Se conserva la marca informativa histórica `[Catálogo enviado]` solo al completar las imágenes.
- `/reply` devuelve 502 con detalle público ante fallo del transporte, y 500 ante problemas de persistencia. No expone respuestas crudas de Meta ni credenciales.
- El hilo y la lista muestran fallos/resultados inciertos; el hilo distingue aceptación de entrega. Un rechazo refresca el historial y conserva el borrador del cliente correcto.

Verificado con `tests/outbound.test.js` (servicios reales y axios simulado): rechazo de rutas 3–7, saludo, menú y cada imagen de catálogo/modelos; contrato de botones; fallo de red; error de persistencia; API 502/200; estado de filas y evento SSE; etiquetas del frontend. `tests/dashboard.test.js` cubre además el refresco del fallo y conservación del borrador.

La corrida de integración inicial terminó con **30/30 aprobadas, sin omisiones**. Usó PostgreSQL real con conversaciones revertidas mediante ROLLBACK, sin envíos reales. Tras añadir dos regresiones adicionales y los cambios compartidos disponibles, los grupos de Codex terminaron con **30 aprobadas, 0 fallidas, 2 integraciones omitidas por defecto** (`node --test tests/dashboard.test.js tests/dedup.test.js tests/outbound.test.js`). Runtime local: Node 24.18.0; repetir en Node 22.x de despliegue.

La advertencia preexistente del driver sobre futuros cambios SSL sigue visible; no se modificó configuración de conexión ni secretos.

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude. Reemplaza la propuesta preliminar del mismo nombre que circulaba en el chat.
- 2026-09-20 — [ByCodex] Implementación, migración y pruebas propias terminadas tras cerrar BRIEF-014. Cierre conjunto pendiente de los fixes del resumen en curso por Claude; ver BRIEF-016.
- 2026-09-20 — [ByCodex] Cierre final: `npm test` = 52 aprobadas y 2 integraciones omitidas por defecto; `DEDUP_TEST_DATABASE=1` + `npm test` = **54 aprobadas, 0 fallidas, 0 omitidas**. Transporte simulado y datos de conversación revertidos. Sin despliegue ni commit.
