# BRIEF-025 — Selección de prenda persistente + sub-estado post-catálogo

- **Dueño:** por asignar (candidato: Claude + Codex)
- **Estado:** TODO
- **Prioridad:** P1 (post críticos pre-Fase 0)
- **Creado:** 2026-09-30
- **Depende de:** B1 del `02-Escaner-Vulnerabilidades` RESUELTO antes.
- **Bloquea:** nueva Fase 0 orientada al recorrido completo (ver §Orden abajo).

## Objetivo

Cerrar la brecha de UX detectada por revisión externa: hoy, cuando la
clienta escribe algo como *"quiero el modelo 2 en talla M negro"* después del
catálogo, el bot responde con el menú principal otra vez y pierde el contexto
de la prenda. BRIEF-025 implementa la continuidad del árbol — después del
catálogo, la clienta elige una prenda, el bot la recuerda, y las rutas de
información (3/4) y la derivación (6) usan esa prenda.

## Contexto

Plan V1 vigente (reproducido del plan del humano, 2026-09-30):

> "Después del catálogo, el bot debe preguntar algo concreto: *¿Qué prenda te
> interesa?*, con opciones seleccionables. La selección debe recordar la
> prenda durante la conversación. Un número escrito debe interpretarse según
> el paso actual: elegir *2* entre prendas no debería abrir accidentalmente
> la opción 2 del menú principal."

Hoy el árbol V1 tiene:
- Estados: `ORGANIC`, `MENU`, `CATALOG`, `PAUSED_HUMAN`.
- Rutas 1 (catálogo) y 2 (modelos) dejan al cliente en `CATALOG` pero no
  piden selección.
- Rutas 3, 4, 6 responden genéricamente ("tocá opción 6 para que te confirmen").

## Alcance

### SÍ

1. **Nuevo sub-estado `WAITING_PRODUCT_SELECTION`.**
   - Agregarlo al enum `STATES` de `state.service.js`.
   - Agregarlo al CHECK constraint de la columna `estado_conversacion`
     en `clientes_whatsapp` (migración nueva `010_waiting_product_selection.sql`
     con DO $$...$$ que droppea y recrea el constraint para incluir el
     nuevo valor; preservar que PostgreSQL < 15 no soporta ADD CONSTRAINT
     IF NOT EXISTS igual que BRIEF-004).
   - **Importante:** solo agregar la columna no alcanza. Si el CHECK no
     admite el valor, `setUserState('WAITING_PRODUCT_SELECTION')` falla y
     la clienta queda en estado inconsistente.

2. **Columna `prenda_seleccionada_id` en `clientes_whatsapp`.**
   - Tipo: `INTEGER REFERENCES productos(id) ON DELETE SET NULL` (NO guardar
     solo el nombre o número — guardar el ID canónico de la tabla
     `productos` ya existente de migración 001).
   - Guardar el **identificador del producto existente**, no un string.
     Así el bot puede joinear con `productos` para recuperar precio,
     descripción, variaciones de talla/color desde `producto_variaciones`.
   - Nullable: la clienta puede estar en `WAITING_PRODUCT_SELECTION` sin
     haber elegido aún.

2.b. **Columna `last_shown_products INTEGER[]` en `clientes_whatsapp`.**
   - Guarda, en orden ordinal, los `productos.id` que el bot presentó en la
     última lista interactiva.
   - Se escribe junto con el envío del catálogo / modelos.
   - **Es la fuente de verdad para resolver ordinales plano a IDs.**
     Cuando la clienta escribe `"2"` en estado `WAITING_PRODUCT_SELECTION`,
     NO se asume `productId = 2`; se mapea a `last_shown_products[1]`
     (0-based). Si el array está vacío o el índice está fuera de rango,
     se trata como entrada inválida y se re-envía la lista.
   - Se limpia al transicionar a `PAUSED_HUMAN` y al confirmar una
     selección exitosa (ver #6b).

3. **Lista interactiva post-catálogo.**
   - Al final de `replyCatalog` y `replyNewModels`, en lugar de dejar en
     `CATALOG`, enviar un `interactive list_message` con los modelos como
     opciones (`list_reply.id = producto:<id>`).
   - Setear estado = `WAITING_PRODUCT_SELECTION`.

4. **Nuevo parser contextual en `extractSelection` / `app.js`.**
   - Si estado = `WAITING_PRODUCT_SELECTION`, un `list_reply.id` con prefijo
     `producto:<id>` se interpreta como selección directa del producto `<id>`.
     El `<id>` recibido se valida contra `last_shown_products` antes de
     aceptarlo (defensa contra ids inyectados).
   - Si estado = `WAITING_PRODUCT_SELECTION`, un texto plano "1", "2", "3"
     se **resuelve contra `last_shown_products[ordinal - 1]`**, NO contra
     la opción del menú principal. (Resolución dependiente del contexto.)
   - Palabras clave `menu`, `volver`, `inicio` regresan al menú principal
     visualmente pero **NO limpian `prenda_seleccionada_id`**. La
     selección se preserva mientras el cliente siga la misma conversación.
     Esto respeta el requisito del plan V1: *"la selección debe recordar la
     prenda durante la conversación"*.

5. **Rutas 3, 4, 6 enteradas de la prenda.**
   - `replyPricesAndSizes`: si `prenda_seleccionada_id` existe, cargar
     el precio y tallas de esa prenda específica desde `productos` y
     `producto_variaciones`. SOLO mostrar los datos **si están confirmados**
     (ver #5.b). Si no hay prenda elegida, responder como hoy.
   - `replyStock`: si prenda elegida, consultar `producto_variaciones` para
     stock por talla/color. SOLO mostrar stock numérico **si está
     confirmado** (ver #5.b). Si no, derivar al humano como hoy.
   - `replyDeriveToHuman`: pasar la `prenda_seleccionada_id` a
     `buildHandoffSummary` para que el resumen tenga la prenda confirmada
     desde la BD, no inferida por regex.

5.b. **Regla concreta de "dato confirmado".**
   El esquema actual (`001_schema.sql`) tiene:
   ```sql
   precio NUMERIC(10,2) NOT NULL DEFAULT 0,
   stock INTEGER NOT NULL DEFAULT 0,
   ```
   Un producto recién sembrado tiene `precio=0, stock=0`. Si el bot responde
   literalmente "este modelo cuesta Bs 0" la clienta entiende "gratis", y
   "stock 0" se entiende "agotado". Ambos incorrectos cuando lo que ocurre
   es que el negocio aún no cargó los datos.

   **Correción 2026-09-30 tras tercera revisión externa:** la propuesta
   anterior de `UPDATE productos SET precio = NULL WHERE precio = 0` es
   DESTRUCTIVA. El cero NO siempre es "sin cargar": también puede ser
   "agotado confirmado" (stock) o "muestra gratuita" (precio).

   **Opción A (preferida — cambio de tipo sin UPDATE masivo):**
   - Migración `011_precios_stock_nullable.sql` cambia **solo el tipo**:
     ```sql
     ALTER TABLE productos
       ALTER COLUMN precio DROP DEFAULT,
       ALTER COLUMN precio DROP NOT NULL;

     ALTER TABLE producto_variaciones
       ALTER COLUMN stock DROP DEFAULT,
       ALTER COLUMN stock DROP NOT NULL;
     ```
   - **NO hay UPDATE masivo**. Las filas existentes mantienen su valor
     (0 o lo que tengan).
   - La limpieza es **manual, fila por fila**, por el negocio: cada
     producto con `precio=0` o `stock=0` se revisa y se decide:
     (a) es "sin confirmar" → se setea a `NULL` explícitamente;
     (b) es un valor legítimo → se deja en `0` y se documenta por qué.
   - Para facilitar: un script `scripts/audit-pending-data.js` que
     lista todos los productos/variaciones con 0 para que el negocio
     los revise antes del deploy.
   - A partir de la migración, el default pasa a ser `NULL` (nuevos
     productos empiezan sin confirmar explícitamente).

   **Opción B (fallback si el negocio no puede hacer la limpieza
   manual):** agregar columnas booleanas:
   ```sql
   ALTER TABLE productos
     ADD COLUMN precio_confirmado BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE producto_variaciones
     ADD COLUMN stock_confirmado BOOLEAN NOT NULL DEFAULT FALSE;
   ```
   - Pros: no toca datos existentes, decisión 100% en el flag.
   - Contras: dos fuentes de verdad por valor; el código tiene que
     leer ambas columnas en cada consulta.
   - El bot responde "Por confirmar" si el flag es `FALSE`,
     independientemente del valor numérico.

   **Decisión final queda pendiente del negocio:** ¿pueden hacer la
   limpieza manual con el script o prefieren el flag? Sin esa respuesta,
   NO arranca este sub-ítem.

6. **Cambio de prenda explícito.**
   - Si cliente escribe algo que resuelve a otro producto distinto al ya
     seleccionado, se actualiza `prenda_seleccionada_id` y se confirma por
     chat: *"Cambié a Modelo 2. ¿Querés precio, talla o hablar con asesora?"*.

6.b. **Qué pasa inmediatamente después de elegir (flujo del plan V1).**
   - Al confirmar la selección, el bot responde con una lista interactiva
     corta: *"Elegiste Modelo X. ¿Querés precio y tallas, disponibilidad o
     hablar con una asesora?"* con 3 botones (`precios`, `stock`, `asesor`).
   - **Transición:** `WAITING_PRODUCT_SELECTION → MENU` **conservando**
     `prenda_seleccionada_id`.
   - **Limpieza de `prenda_seleccionada_id`:** solo ocurre en 3 casos:
     - (a) La asesora reactiva el bot después de `PAUSED_HUMAN`
       (`resumeBotForClient` limpia la selección).
     - (b) El cliente pide explícitamente ver otra prenda y la elige
       en una nueva lista interactiva.
     - (c) Transcurren más de N minutos de inactividad (opcional,
       configurable; dejar fuera de alcance de este brief).

   Importante: **NO** se limpia por escribir "menú" ni "volver". El cliente
   puede volver al menú principal, mirar envíos, volver, y la prenda sigue
   seleccionada. Eso es lo que el plan V1 pide.

7. **Derivación directa a asesora desde la selección.**
   - En el flujo `WAITING_PRODUCT_SELECTION`, agregar opción visible
     "Hablar con asesora" que invoque `replyDeriveToHuman` con la prenda
     ya seleccionada embebida en el summary.

8. **Prevenir que un catálogo en vuelo sobrescriba `PAUSED_HUMAN`.**
   - Dentro de las rutas 1 y 2, antes del `setUserState(CATALOG)` final,
     re-leer el estado actual y abortar la escritura si cambió a
     `PAUSED_HUMAN`.
   - Mejor: implementar antes B1 del escáner (lock por teléfono o
     `SELECT FOR UPDATE`). BRIEF-025 depende de esa corrección.

### NO (fuera de alcance de este brief)

- Carrito, agregar múltiples prendas en una conversación.
- Pagos.
- Reservas de stock.
- Integración con sistema de inventario externo.

## Aceptación

- [ ] Migración `010_waiting_product_selection.sql` agrega estado al
      CHECK y agrega columna `prenda_seleccionada_id`.
- [ ] `STATES.WAITING_PRODUCT_SELECTION` en `state.service.js`.
- [ ] Lista interactiva se envía al final de rutas 1 y 2.
- [ ] Un cliente que toca el ítem "Modelo 2" en la lista queda con
      `prenda_seleccionada_id` = el `productos.id` **real** de ese modelo
      (resuelto contra `last_shown_products`, NO asumido como `= 2`).
- [ ] Un cliente que escribe "3" **en estado** `WAITING_PRODUCT_SELECTION`
      selecciona el 3er producto de `last_shown_products`, **no** abre
      precios y tallas del menú principal.
- [ ] Un cliente que escribe "menú" en estado `WAITING_PRODUCT_SELECTION`
      vuelve al menú principal visualmente **PRESERVANDO**
      `prenda_seleccionada_id`. El contexto de la prenda sobrevive.
      La limpieza ocurre solo en los 3 casos de §6.b.
- [ ] `replyPricesAndSizes` con prenda elegida muestra datos SOLO si están
      confirmados en `productos` y `business.js`. Si no, "Por confirmar".
- [ ] `replyStock` con prenda elegida muestra stock desde
      `producto_variaciones`.
- [ ] `replyDeriveToHuman` guarda en `resumenes_atencion` el
      `prenda_seleccionada_id` y el nombre resuelto desde `productos`.
- [ ] Un flujo "catálogo + derivación casi simultáneos" NO deja estado
      `CATALOG` sobre `PAUSED_HUMAN` (requiere B1 cerrado antes).
- [ ] Tests nuevos:
  - FSM: ORGANIC → MENU → CATALOG → WAITING_PRODUCT_SELECTION →
    MENU (vuelta por palabra clave).
  - Un cliente que elige Modelo 1 y después Modelo 2 queda con Modelo 2
    (regresión del extractor de modelo).
  - Un cliente en `WAITING_PRODUCT_SELECTION` que escribe "3" NO abre
    la opción 3 del menú principal.
  - Un cliente en `PAUSED_HUMAN` nunca es "despertado" por un setState
    tardío de otra rama.
- [ ] Firma `// [By<autor>] (BRIEF-025)`.
- [ ] `npm test` verde (incluye los nuevos tests).

## Notas técnicas sugeridas

**Migración 010 (ejemplo):**

```sql
-- Agregar nuevo valor al CHECK existente
DO $$
BEGIN
  ALTER TABLE clientes_whatsapp
    DROP CONSTRAINT IF EXISTS clientes_whatsapp_estado_check;

  ALTER TABLE clientes_whatsapp
    ADD CONSTRAINT clientes_whatsapp_estado_check
    CHECK (estado_conversacion IN (
      'ORGANIC', 'MENU', 'CATALOG', 'PAUSED_HUMAN',
      'WAITING_PRODUCT_SELECTION'
    ));
END
$$;

-- Nueva columna
ALTER TABLE clientes_whatsapp
  ADD COLUMN IF NOT EXISTS prenda_seleccionada_id INTEGER
  REFERENCES productos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_prenda
  ON clientes_whatsapp (prenda_seleccionada_id)
  WHERE prenda_seleccionada_id IS NOT NULL;
```

**Parser contextual (pseudocódigo CORREGIDO 2026-09-30).**
Nota: el ordinal "2" NO se interpreta como `productId = 2`. Se resuelve
contra `last_shown_products` que es la lista efectivamente presentada:

```js
function extractSelection(message, state, cliente) {
  const interactive = message.interactive;
  if (interactive?.type === 'list_reply') {
    const id = interactive.list_reply.id;
    if (state === STATES.WAITING_PRODUCT_SELECTION && id.startsWith('producto:')) {
      const productId = Number(id.slice('producto:'.length));
      // Defensa: solo aceptar productos que efectivamente ofrecimos
      if (cliente.last_shown_products?.includes(productId)) {
        return { kind: 'product', productId };
      }
      return null; // ID inyectado o stale → ignorar y re-mostrar
    }
    return { kind: 'menu_option', raw: id };
  }
  const text = message.text?.body?.trim();
  if (!text) return null;

  // En WAITING_PRODUCT_SELECTION, un número plano es ORDINAL de la última
  // lista mostrada, NO una opción del menú principal.
  if (state === STATES.WAITING_PRODUCT_SELECTION && /^[1-9]$/.test(text)) {
    const ordinal = Number(text) - 1;
    const list = cliente.last_shown_products || [];
    const productId = list[ordinal];
    if (productId !== undefined) {
      return { kind: 'product', productId };
    }
    return null; // ordinal fuera de rango → re-mostrar la lista
  }

  return { kind: 'menu_option', raw: text };
}
```

## Bloqueos

- Requiere que **B1 (lock por teléfono)** esté cerrado antes de arrancar
  BRIEF-025, porque el requerimiento #8 depende de serialización por cliente.
- Requiere que el negocio haya **confirmado al menos los IDs de los 3 modelos
  + oferta** en la tabla `productos`. Si están vacíos no hay qué listar.

## Orden recomendado para llegar a Fase 0 (propuesto por revisión externa)

1. **Cerrar fallos críticos** del escáner de vulnerabilidades:
   - B1 (lock por teléfono) — habilita BRIEF-025.
   - C1 (timeout Meta) — fácil, barato, impacto alto.
   - A1 (media entrante) o al menos un fallback honesto.
   - G2 (SIGTERM handler) — barato.
2. **BRIEF-025** — la selección de prenda persistente que cierra la UX.
3. **Fase 0** — recorrido completo (orgánico + anuncio + handoff + reanudación)
   con 3-5 testers reales sobre el bot que de verdad va a correr en producción.

## Bitácora del brief

- 2026-09-30 — Brief creado por Claude tras revisión externa que detectó
  (a) la brecha de UX de "texto libre → menú otra vez" y
  (b) 4 divergencias del simulador que exponían el riesgo real
  (B1 reproducible, resumen con modelo equivocado).
  Scope ajustado por sugerencias de la segunda revisión externa:
  guardar `producto_id` (no string), actualizar CHECK (no solo columna),
  mostrar precios solo si confirmados, cambio de prenda explícito,
  prevenir pisado de PAUSED_HUMAN.

- 2026-10-09 — [ByClaude] Decisiones de orquestación (prevalecen sobre §SÍ donde difieran):
  1. Se parte en 025-A (selección + persistencia + parser) y 025-B (rutas 3/4/6 + resumen + limpieza al reactivar).
  2. Migración 011 (precio/stock nullable) queda FUERA de 025: depende de la entrega 2.
     Regla V1: precio se publica solo si `> 0`; stock numérico NUNCA se publica; resto "Por confirmar".
  3. Ordinales planos ("2") solo en `WAITING_PRODUCT_SELECTION`. El patrón determinista
     `modelo <N>` / `oferta` se resuelve contra `last_shown_products` en cualquier estado no pausado
     (cubre "quiero modelo 2 talla M negro"; talla/color quedan en el historial para el resumen).
  4. `last_shown_products` NO se limpia al seleccionar (permite cambiar de prenda); única limpieza
     de ambas columnas: `resumeBotForClient`.
  5. La lista se arma desde `productos` filtrando por `imagen_key` en el mismo orden de las imágenes.
     Sin filas → comportamiento actual (outro + `CATALOG`).
  6. §8 (catálogo pisando PAUSED_HUMAN) se considera cubierto por BRIEF-026 (cola por teléfono).
  7. `prenda_seleccionada_id` va en el JSONB del resumen; sin columna nueva en `resumenes_atencion`.

<!-- [ByCodex] 2026-10-01: 009 aplicada por BRIEF-027; selección reserva 010 y datos confirmados 011, sujetas a verificar el máximo al implementarlas. No se crearon estas migraciones aún. -->
