# Cecilia Tedin Bot — Reporte de Proyecto

> ⚠️ **REPORTE DESACTUALIZADO (refleja la V0)**
>
> Este documento fue escrito antes del glowdown a V1 (2026-09-18). La V1
> eliminó el agente generativo. El estado actual del proyecto se sigue en:
> - [`docs/V1_OBJETIVOS.md`](docs/V1_OBJETIVOS.md)
> - [`docs/TAREAS.md`](docs/TAREAS.md) (tablero vivo)
> - [`docs/bitacoras/`](docs/bitacoras/) (bitácoras por agente)
>
> Se conserva por memoria histórica. — [ByClaude] (BRIEF-019) 2026-09-20.

> Documento que resume desde dónde empezamos, qué hay hoy, y hacia dónde vamos.
> **Última actualización:** viernes 18 de septiembre de 2026 (sesión 2 — agente implementado).

---

## 1. Qué es este proyecto

Un **bot de WhatsApp para la marca de ropa Cecilia Tedin** que funciona sobre la
**WhatsApp Cloud API de Meta**. La meta es un **agente de IA** que atienda clientes
automáticamente (catálogo, precios, tallas, colores, disponibilidad) y derive a
humano cuando corresponda.

---

## 2. Cómo está armado (estado actual)

| Componente | Detalle |
|---|---|
| **Lenguaje / runtime** | Node.js v24 (CommonJS) + Express 5 |
| **Base de datos** | PostgreSQL en **Neon** (nube), vía `DATABASE_URL` |
| **WhatsApp** | Meta Cloud API, Graph `v25.0` |
| **IA** | **OpenAI** (`openai` v7) — `gpt-4o-mini` por defecto |
| **Puerto local** | **3001** (el 3000 lo usa otro proyecto, Oasis/Next.js) |

### Doble modo de funcionamiento
El bot ahora tiene **dos modos**, y elige uno según exista o no `OPENAI_API_KEY`:

1. **Modo AGENTE (nuevo, si hay `OPENAI_API_KEY`):** OpenAI entiende el mensaje y
   decide qué hacer (enviar catálogo, responder precios/tallas, derivar a humano).
   Guarda el historial de conversación en la BD.
2. **Modo FALLBACK (viejo, si NO hay key):** comportamiento original por palabras
   clave (catálogo a clientes nuevos, y catálogo si piden "modelos/ofertas/etc.").
   Esto evita que el bot se caiga mientras no se carga la API key.

---

## 3. Qué se implementó en esta sesión ✅

1. **Paquete `openai`** instalado (v7.18.0).
2. **Tablas nuevas en Neon** (sin tocar `clientes_whatsapp`):
   - `productos` — nombre, descripción, precio, categoría, disponible, imagen_key.
   - `producto_variaciones` — talla, color, stock por producto.
   - `mensajes` — historial de conversación (origen: cliente/bot).
   - Script `npm run init-db` (lee `sql/schema.sql` + `sql/seed.sql`).
   - Seed inicial: los 4 productos ya conocidos (Modelo 1, 2, 3 y Oferta del día)
     con **precio en 0 = "por definir"** (hay que cargarlos reales).
3. **Servicios nuevos:**
   - `src/services/db.js` — pool de conexión compartido.
   - `src/services/products.service.js` — consultar productos y disponibilidad.
   - `src/services/messages.service.js` — guardar/leer historial.
   - `src/services/agent.service.js` — **el agente**: prompt de sistema, loop con
     OpenAI y herramientas (tools).
4. **Herramientas del agente:**
   - `enviar_catalogo` → dispara las 4 imágenes + textos.
   - `consultar_productos` → lista productos.
   - `verificar_disponibilidad` → busca stock por producto/talla/color.
   - `derivar_a_humano` → marca la conversación para un asesor.
5. **`src/app.js`** conectado: usa el agente si hay key; si no, mantiene el flujo
   viejo. También maneja mensajes que no son texto (audio/imagen) avisando que un
   humano responderá.
6. **Puerto cambiado a 3001** y placeholders agregados al `.env`:
   `OPENAI_API_KEY=` y `OPENAI_MODEL=gpt-4o-mini`.
7. **Verificado:** la BD creó las tablas y devuelve los 4 productos; el servidor
   arranca y responde `200 Cecilia Tedin Bot funcionando ✅` (probado en puerto libre).

---

## 4. Pendiente del usuario (para mañana)

1. **Poner la API key real** en `.env`:
   `OPENAI_API_KEY=sk-...`  (sin esto el bot sigue en modo viejo).
2. **Cargar los datos reales de productos**: precio, tallas, colores y stock.
   - Opción rápida: editar `sql/seed.sql` y volver a correr `npm run init-db`.
   - Opción directa: hacer `INSERT` en las tablas `productos` y `producto_variaciones`.
3. Confirmar que las imágenes del `.env` (`IMAGE_MODELO_1..3`, `IMAGE_OFERTA_DIA`)
   siguen vigentes.
4. Probar en WhatsApp real: escribir "hola", "precio del modelo 1", "talla M",
   "quiero comprar" y ver que el agente responde/deriva bien.

---

## 5. Estructura de archivos (actualizada)

```
cecilia-tedin-bot/
├── .env                     ← Config (tokens, IDs, OPENAI_API_KEY). NO se sube a git.
├── package.json             ← Scripts: dev / start / init-db
├── sql/
│   ├── schema.sql           ← Tablas nuevas (productos, variaciones, mensajes)
│   └── seed.sql             ← Productos iniciales (precios por definir)
├── data/
│   └── catalog-state.json   ← RESIDUO viejo, ya no se usa (la BD manda).
├── media/                   ← Imágenes originales + versiones -fixed.jpg
└── src/
    ├── app.js               ← Express + webhook + enrutado agente/fallback
    ├── init-db.js           ← Crea tablas y carga seed
    ├── services/
    │   ├── db.js                    ← Pool de conexión compartido
    │   ├── whatsapp.service.js      ← Envío de mensajes (texto e imagen)
    │   ├── catalog-state.service.js ← clientes_whatsapp (memoria de catálogo)
    │   ├── products.service.js      ← Consultas de productos/disponibilidad
    │   ├── messages.service.js      ← Historial de conversación
    │   └── agent.service.js         ← Agente OpenAI + herramientas
    ├── subscribe-waba.js    ← Utilidad: suscribir app al WABA
    ├── upload-all-images.js ← Utilidad: subir imágenes a Meta
    ├── upload-image.js      ← Utilidad: subir una imagen
    ├── fix-all-images.js    ← Utilidad: corregir rotación EXIF (todas)
    └── fix-image.js         ← Utilidad: corregir una imagen
```

---

## 6. Notas técnicas / advertencias

- **No inventar datos:** el prompt del sistema instruye a la IA a NO inventar
  precios ni stock. Mientras los precios sean 0, el agente dirá "precio por definir".
- `data/catalog-state.json` es **código muerto**: se puede borrar.
- Los scripts de `media/` son utilidades manuales (no se corren con `npm`).
- El pool de Postgres es **compartido**; si se usa en scripts sueltos, cerrarlo con
  `pool.end()` (como hace `init-db.js`).
- Aviso de `pg` sobre SSL modes: es solo una advertencia de versión futura, no rompe nada.
- El `.env` viaja en blanco en el repo por seguridad (está en `.gitignore`).

---

## 7. Cómo correr el proyecto

```bash
npm install       # instalar dependencias
npm run init-db   # crear tablas y cargar productos (una vez)
npm run dev       # desarrollo (nodemon) — puerto 3001
npm start         # producción
```

- Webhook de verificación: `GET /webhook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=...`
- `GET /` responde `Cecilia Tedin Bot funcionando ✅` si está vivo.

---

## 8. Cómo probar el flujo de WhatsApp local

El webhook de Meta necesita una URL pública (ngrok, Cloudflare Tunnel, etc.).
Sugerencia: exponer el puerto **3001** y apuntar el webhook de Meta ahí.
Para simular sin WhatsApp:
```bash
# Enviar un POST manual al webhook (revisar logs de consola):
curl -X POST http://localhost:3001/webhook -H "Content-Type: application/json" -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"59100000000","type":"text","text":{"body":"hola, precio del modelo 1"}}]}]}]}'
```