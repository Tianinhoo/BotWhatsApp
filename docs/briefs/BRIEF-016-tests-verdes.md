# BRIEF-016 — Recuperar la suite de tests + agregar regresiones

- **Dueño:** Codex
- **Estado:** HECHO
- **Prioridad:** P0 pre-Fase 0 (bloquea BRIEF-010)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** BRIEF-014 y BRIEF-011 no bloquean, pero recomiendo cerrarlo tras 014+011 para que las regresiones nuevas cubran los fixes.

## Objetivo

Que `node --test tests/` termine con **todo verde**, y agregar tests de
regresión para los fixes de BRIEF-011, 014 y 015 antes de la Fase 0.

## Contexto

La revisión externa reporta 2 pruebas aprobadas, 3 fallidas y 1 integración
omitida. Las 3 fallas se atribuyen al warning nuevo de arranque que
introdujo BRIEF-009 (HMAC) — el warning cambió la salida esperada por
algunos tests. Es deuda técnica típica cuando varios briefs paralelos
tocan el mismo archivo y nadie corrió la suite completa.

Además, hoy solo hay tests para `dedup.service`. Los fixes de BRIEF-011
(envíos fallidos), BRIEF-014 (dashboard race) y BRIEF-015 (resumen)
deben cerrar con test propio.

## Alcance

**SÍ:**
- Diagnosticar y arreglar las 3 pruebas fallidas actuales.
- Agregar `"test": "node --test tests/**/*.test.js"` a `package.json`.
- Documentar en `docs/CONVENCIONES.md` la regla: **toda entrega de brief
  que toque código debe cerrar con `npm test` verde**.
- Nuevos tests:
  - Regresión de BRIEF-011: mockear axios para simular rechazo de Meta,
    verificar que la fila queda como `fallido` y el estado no avanza.
  - Regresión de BRIEF-015: probar que "6" nunca queda como `interes_color`.
  - Regresión de BRIEF-014 (opcional en backend): un test de unidad de
    la función `openConversation` con `activeLoadToken` viejo debe
    hacer early return. Si el fix es 100% en el frontend, este test
    puede quedar como manual y documentado en BRIEF-014.

**NO:**
- Playwright / e2e completos. Node --test alcanza para V1.

## Aceptación

- [x] `npm test` corre y termina con exit 0 (verde).
- [x] Al menos 3 tests nuevos: regresiones para 011, 014 y 015/017.
- [x] `CONVENCIONES.md` actualizado con la regla "tests verdes al cerrar".
- [x] Firma `[ByCodex]` y número de brief en los tests nuevos.
- [x] Diagnóstico documentado acá abajo (qué rompió el warning HMAC y cómo se arregló).

## Notas técnicas

Diagnóstico probable: los tests de `dedup.test.js` capturaban stdout
o esperaban startup silencioso. El warning `[HMAC] Modo development sin
APP_SECRET — validación desactivada` aparece al cargar `app.js` y
contamina esa captura. Fix simple: silenciar el warning con env de test
(`NODE_ENV=test` — que ya está en `SKIP_ENVS` según BRIEF-009 pero no
suprime el warning) o filtrar en la aserción del test.

## Bloqueos

- 2026-09-20 — [ByCodex] Durante integración llegaron los archivos de BRIEF-015/017. La suite conjunta detectó `TypeError: assert.notMatch is not a function` y el caso "es para el cumple de mi hermana el sábado" devolviendo necesidad "Por confirmar". Se consultó quién mantiene esos archivos para evitar modificaciones simultáneas. Pendiente verificar sobre la entrega final del dueño.
- 2026-09-20 — [ByCodex] Resuelto: Claude corrigió ambos casos y el usuario confirmó que terminó. Las regresiones adicionales detectaron otro fallo: `"6"` solo, o después de texto sin modelo/color, todavía quedaba como interés. Se corrigió `keepFreeText` para excluir comandos aislados 1–7; se conserva texto como `Talla 6 para mi hija`. No se debilitaron las expectativas para obtener verde.

## Resultado final — [ByCodex]

- **`npm test`: 52 aprobadas, 0 fallidas, 2 omitidas** (integraciones optativas).
- **`$env:DEDUP_TEST_DATABASE='1'; npm test`: 54 aprobadas, 0 fallidas, 0 omitidas**.
- Node local **24.18.0**. No se afirmó ejecución bajo Node 22.x: queda como comprobación de despliegue.
- `git diff --check` de archivos modificados sin errores de whitespace.
- `npm test` usa `node --test tests/*.test.js`: todos los archivos de pruebas viven directamente en `tests/`; los helpers están en `tests/helpers/` y no son suites independientes.

Cobertura ejecutada:

| Grupo | Qué verifica |
|---|---|
| `dashboard.test.js` | Selección/carga, A→B→A, respuestas tardías, resumen demorado, errores, logout, doble Enter, borradores, reanudación y fallo visible |
| `dedup.test.js` | Reserva atómica, duplicados, errores, compatibilidad, concurrencia real y ausencia de efectos repetidos |
| `outbound.test.js` | Rechazos axios de rutas, imágenes y menú; persistencia y SSE de fallos; estado conservado; HTTP 502; éxito, resultado incierto y fallo de historial |
| `summary-integration.test.js` | Comando 6 sin modelo/color; comandos 1–7; conservación de contexto/talla; caso original; cuatro campos de tarjeta y escape de Necesidad |
| `summary.test.js` (Claude) | Extractores y construcción del resumen unificado; incluidos los casos corregidos por su autor |

La corrida con BD usa PostgreSQL configurado y transporte simulado; no envía WhatsApp. Conversaciones sintéticas en transacciones con ROLLBACK y limpieza de reserva de concurrencia por UUID. Se conservaron visibles las advertencias preexistentes de SSL del driver.

### Ajustes de integración

1. HMAC: el arnés comprueba explícitamente el aviso de inicio y separa esa salida de los logs del handler. `NODE_ENV=test` por sí solo no elimina el aviso, por lo que no se usó como supuesto arreglo.
2. Resumen: después de que el usuario confirmó fin del trabajo de Claude, Codex excluyó las selecciones numéricas de menú del texto libre y corrigió el comentario de prueba que toleraba devolver `"6"`.
3. Frontend: el endpoint ya entregaba `necesidad`, pero la tarjeta todavía tenía tres campos. Se conectó el cuarto campo con escape HTML y fallback `Por confirmar`, bajo prueba automática del script real del dashboard.
4. Migraciones: `007_mensajes_estado_envio.sql` y `007_necesidad.sql` ya estaban aplicadas con ids distintos. No se renombraron ni modificaron; se documentó coordinación de numeración futura.

La verificación manual de navegador/WhatsApp real sigue perteneciendo a Fase 0. El cierre de estos briefs no da por validado BRIEF-012 ni los datos comerciales.

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude tras revisión externa.
- 2026-09-20 — [ByCodex] Prerrequisito adelantado al cierre de 014: agregado `npm test` y corregida la separación de logs de arranque/request en dedup. El aviso HMAC se comprueba explícitamente y luego se retira de la captura del request; no se desactiva ni se ocultan errores.
- 2026-09-20 — [ByCodex] Regresiones de dashboard y envíos implementadas. Corrida con PostgreSQL antes de incorporar summary.test.js: 30/30 aprobadas, 0 omitidas. Regla de tests obligatorios añadida a CONVENCIONES.md.
- 2026-09-20 — [ByCodex] Cierre conjunto de 011/016: 54/54 aprobadas con integración PostgreSQL sobre los cambios combinados. Tablero y bitácora actualizados; sin commit ni despliegue.
