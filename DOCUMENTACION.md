# Documentación Técnica Completa — Cecilia Tedin Bot

> ⚠️ **DOCUMENTO DESACTUALIZADO (refleja la V0)**
>
> Este documento describe el estado del proyecto **antes del glowdown a V1**
> del 2026-09-18. La V1 eliminó el agente generativo y lo reemplazó por un
> árbol conversacional fijo de 7 rutas.
>
> Para el estado actual del proyecto, ver:
> - [`docs/V1_OBJETIVOS.md`](docs/V1_OBJETIVOS.md) — qué buscamos con la V1.
> - [`docs/TAREAS.md`](docs/TAREAS.md) — tablero vivo del equipo.
> - [`docs/EQUIPO.md`](docs/EQUIPO.md), [`docs/CONVENCIONES.md`](docs/CONVENCIONES.md) — cómo trabajamos.
> - `docs/briefs/BRIEF-*.md` — cada tarea con detalle.
>
> Este archivo se conserva como memoria histórica hasta que se reescriba una
> versión "V1" nueva (fuera del alcance de BRIEF-019). — [ByClaude] 2026-09-20.

**Proyecto:** `cecilia-tedin-bot`
**Ubicación:** `C:\Users\HP\Desktop\PROYECTOS\AgenteIA\cecilia-tedin-bot`
**Tipo:** Agente de IA para automatizar la atención de WhatsApp de una marca de ropa.
**Autor de esta documentación:** asistente de IA (sesión del 18/09/2026).
**Versión del documento:** 2.0 (documentación exhaustiva).
**Estado (V0, DESACTUALIZADO):** Funcional en modo "bot por palabras clave"; el agente OpenAI está implementado y listo para activarse al cargar la API key y los datos reales de productos.

> Este documento es intencionalmente exhaustivo. Recorre **todo** lo que existe en el
> proyecto: cada archivo, cada función, cada tabla, cada variable de entorno, el flujo
> completo de un mensaje, qué se creó, qué se modificó, qué funciona y qué falta.

---

## ÍNDICE

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Glosario](#2-glosario)
3. [Arquitectura general](#3-arquitectura-general)
4. [Stack tecnológico y dependencias](#4-stack-tecnológico-y-dependencias)
5. [Estructura de carpetas y archivos](#5-estructura-de-carpetas-y-archivos)
6. [Variables de entorno (.env)](#6-variables-de-entorno-env)
7. [Base de datos](#7-base-de-datos)
8. [Flujo de mensajes de punta a punta](#8-flujo-de-mensajes-de-punta-a-punta)
9. [El agente de IA (OpenAI)](#9-el-agente-de-ia-openai)
10. [Servicios (uno por uno)](#10-servicios-uno-por-uno)
11. [Scripts utilitarios de media y WABA](#11-scripts-utilitarios-de-media-y-waba)
12. [Scripts y archivos de base de datos](#12-scripts-y-archivos-de-base-de-datos)
13. [Catálogo de imágenes y media IDs](#13-catálogo-de-imágenes-y-media-ids)
14. [Historial de cambios: qué se creó y qué se modificó](#14-historial-de-cambios-qué-se-creó-y-qué-se-modificó)
15. [Estado actual: funciona / no funciona](#15-estado-actual-funciona--no-funciona)
16. [Pendientes y roadmap](#16-pendientes-y-roadmap)
17. [Cómo instalar, correr, probar y desplegar](#17-cómo-instalar-correr-probar-y-desplegar)
18. [Troubleshooting / problemas conocidos](#18-troubleshooting--problemas-conocidos)
19. [Seguridad](#19-seguridad)
20. [Anexos](#20-anexos)

---

## 1. Resumen ejecutivo

`cecilia-tedin-bot` es un servidor **Node.js/Express** que se conecta a la
**WhatsApp Cloud API de Meta** para atender clientes de la marca de ropa
**Cecilia Tedin**. Recibe mensajes por webhook y responde automáticamente.

Tiene **dos modos de funcionamiento**, que se eligen solos según exista o no una
clave de OpenAI:

| Modo | Cuándo se activa | Qué hace |
|---|---|---|
| **Modo AGENTE** (nuevo) | Si `OPENAI_API_KEY` tiene valor | Un LLM (GPT) entiende el mensaje y decide la acción: enviar catálogo, responder sobre productos, verificar stock o derivar a un humano. Guarda el historial de la conversación. |
| **Modo FALLBACK** (viejo) | Si `OPENAI_API_KEY` está vacía | Comportamiento original: envía el catálogo si el cliente es nuevo o si escribe una palabra clave ("catálogo", "modelos", "ofertas"...). Lo demás queda para atención humana. |

**Qué existe hoy en concreto:**
- Un servidor Express con webhook de Meta verificado y funcional.
- Envío de mensajes de texto e imágenes por la API de WhatsApp.
- Persistencia en **PostgreSQL (Neon)** de: qué clientes recibieron el catálogo,
  mensajes de la conversación, y (a partir de esta sesión) productos y variantes.
- Un **agente de IA** completo con 4 herramientas, listo pero **desactivado** hasta
  que se cargue la API key.
- Un catálogo de 4 imágenes (3 modelos + oferta del día) ya subidas a Meta, con sus
  `media_id` guardados en el `.env`.

**Lo que aún NO está listo para producción con IA:**
- Falta la `OPENAI_API_KEY`.
- Faltan los **datos reales** de productos (precio, tallas, colores, stock); hoy los
  4 productos tienen precio 0 = "por definir".

---

## 2. Glosario

- **Bot:** programa que responde automáticamente. En este proyecto, es el modo
  fallback por palabras clave.
- **Agente (de IA):** el bot + un modelo de lenguaje que razona y decide qué hacer.
  Es el objetivo del proyecto.
- **Webhook:** URL pública de este servidor a la que Meta envía (hace `POST`) cada vez
  que llega un mensaje de WhatsApp.
- **Cloud API:** la API oficial de WhatsApp para empresas (antes "Business API").
- **WABA:** *WhatsApp Business Account*. La cuenta de empresa de WhatsApp.
- **`media_id`:** identificador que Meta asigna a un archivo (imagen) subido. Se usa
  para enviar esa imagen por WhatsApp sin tener que subirla cada vez.
- **Tool / herramienta (function calling):** una función del sistema que el LLM puede
  pedir ejecutar; el programa la corre y le devuelve el resultado al modelo.
- **LLM:** *Large Language Model* (modelo de lenguaje grande), como GPT.
- **Fallback:** plan B. Aquí, el modo viejo si no hay IA disponible.
- **EXIF:** metadatos de una foto (incluye la orientación). Si no se corrige, las
  fotos de celular pueden salir giradas.
- **N8N / n8n:** (mencionado solo como referencia teórica) plataforma de automatización.
  **No se usa en este proyecto.**
- **Neon:** servicio de PostgreSQL gestionado en la nube.
- **Pool (de conexiones):** conjunto reutilizable de conexiones a la base de datos.

---

## 3. Arquitectura general

```
                     ┌──────────────────────────────────────────────┐
                     │                 META / WHATSAPP                │
                     │        (Cloud API  ·  Graph v25.0)            │
                     └───────────────┬───────────────┬──────────────┘
                                     │               ▲
                     POST mensaje    │               │  Envía mensajes
                     (webhook)       │               │  (texto/imagen)
                                     ▼               │
        ┌────────────────────────────────────────────────────────────┐
        │                    NUESTRO SERVIDOR (Node.js)               │
        │                      Express  ·  puerto 3001                 │
        │                                                              │
        │   src/app.js                                                 │
        │     • GET  /                → healthcheck (texto plano)      │
        │     • GET  /webhook         → verificación de Meta           │
        │     • POST /webhook         → recepción de mensajes          │
        │                                                              │
        │     ¿Hay OPENAI_API_KEY?                                     │
        │        │                                                     │
        │        ├── SÍ  →  agent.service.js  →  OpenAI (GPT)          │
        │        │              │              + herramientas          │
        │        │              │              (catálogo, productos,   │
        │        │              │               disponibilidad, humano)│
        │        │              │                                      │
        │        └── NO  →  lógica por palabras clave (sendCatalog)    │
        │                                                              │
        │   services/                                                  │
        │     • whatsapp.service.js   → habla con Meta                 │
        │     • catalog-state.service.js → clientes_whatsapp           │
        │     • products.service.js   → productos / variaciones        │
        │     • messages.service.js   → historial de conversación      │
        │     • db.js                 → pool de PostgreSQL             │
        └───────────────────────────┬──────────────────────────────────┘
                                     │
                                     ▼
                     ┌──────────────────────────────────────────────┐
                     │              POSTGRESQL (NEON)                │
                     │   clientes_whatsapp · productos ·             │
                     │   producto_variaciones · mensajes             │
                     └──────────────────────────────────────────────┘
```

**Puntos clave de la arquitectura:**
- Todo el backend es **un solo proceso Node**: no hay colas, ni workers, ni microservicios.
- La respuesta HTTP a Meta se envía **de inmediato** (`200`) y el procesamiento del
  mensaje ocurre después, para no pasarse del tiempo de espera de Meta.
- El estado del cliente vive en **PostgreSQL**, no en memoria. Si el servidor se
  reinicia, no se pierde quién recibió el catálogo ni el historial.
- Las imágenes no se almacenan en la BD: solo se guardan sus **`media_id` de Meta** en
  el `.env`.

---

## 4. Stack tecnológico y dependencias

### 4.1 Runtime
| Elemento | Versión detectada |
|---|---|
| Node.js | v24.18.0 |
| npm | 11.16.0 |
| Sistema operativo de desarrollo | Windows (PowerShell 5.1) |
| Módulos | CommonJS (`"type": "commonjs"` en `package.json`) |

### 4.2 Dependencias de producción (`package.json` → `dependencies`)
| Paquete | Versión | Para qué se usa |
|---|---|---|
| `express` | ^5.2.1 | Servidor HTTP y rutas (webhook, healthcheck). |
| `axios` | ^1.20.0 | Cliente HTTP para llamar a la API de Meta y a OpenAI. |
| `dotenv` | ^17.4.2 | Carga las variables del archivo `.env` a `process.env`. |
| `pg` | ^8.23.0 | Cliente de PostgreSQL. |
| `form-data` | ^4.0.6 | Construir formularios `multipart` para subir imágenes a Meta. |
| `sharp` | ^0.35.4 | Procesar imágenes (corregir rotación EXIF, recomprimir a JPG). |
| `openai` | ^7.18.0 | SDK oficial de OpenAI (agregado en esta sesión). |

### 4.3 Dependencias de desarrollo (`devDependencies`)
| Paquete | Versión | Para qué |
|---|---|---|
| `nodemon` | ^3.1.14 | Reinicia el servidor solo al cambiar el código (`npm run dev`). |

### 4.4 Scripts de npm
| Script | Comando | Descripción |
|---|---|---|
| `npm run dev` | `nodemon src/app.js` | Desarrollo con recarga automática. |
| `npm start` | `node src/app.js` | Ejecución normal / producción. |
| `npm run init-db` | `node src/init-db.js` | **Nuevo.** Crea las tablas y carga el seed. |

> `package.json` **no** tiene script de `test` ni de `lint`: el proyecto no usa
> framework de tests ni linter. La verificación se hace con `node --check` y pruebas
> manuales (ver §17).

---

## 5. Estructura de carpetas y archivos

```
cecilia-tedin-bot/
│
├── .env                          # Variables sensibles y configuración. NO va a git.
├── .gitignore                    # Ignora node_modules/, .env, data/, media/
├── package.json                  # Metadatos, dependencias y scripts.
├── package-lock.json             # Árbol exacto de dependencias (generado).
├── REPORTE-PROYECTO.md           # Reporte resumido de avance (sesión previa).
├── DOCUMENTACION.md              # ESTE documento.
│
├── data/
│   └── catalog-state.json        # RESIDUO de versión vieja. Código muerto. Se puede borrar.
│
├── media/                        # Imágenes locales del catálogo.
│   ├── modelo1.jpg               # Original (foto tal como llegó).
│   ├── modelo1-fixed.jpg         # Corregida (rotación EXIF) — la que se sube a Meta.
│   ├── modelo2.png               # Original.
│   ├── modelo2-fixed.jpg         # Corregida.
│   ├── modelo3.png               # Original.
│   ├── modelo3-fixed.jpg        # Corregida.
│   ├── oferta-dia.png            # Original.
│   └── oferta-dia-fixed.jpg      # Corregida.
│
├── sql/                          # NUEVO (esta sesión)
│   ├── schema.sql                # Definición de tablas nuevas.
│   └── seed.sql                  # Datos iniciales de productos.
│
└── src/
    ├── app.js                    # Servidor + webhook + enrutado agente/fallback.
    ├── init-db.js                # NUEVO. Script que ejecuta schema.sql + seed.sql.
    │
    ├── services/
    │   ├── db.js                 # NUEVO. Pool de conexión compartido a Postgres.
    │   ├── whatsapp.service.js   # Envío de mensajes de texto e imagen vía Meta.
    │   ├── catalog-state.service.js  # clientes_whatsapp (memoria de catálogo).
    │   ├── products.service.js   # NUEVO. Consultas de productos y disponibilidad.
    │   ├── messages.service.js   # NUEVO. Guardar/leer historial de conversación.
    │   └── agent.service.js      # NUEVO. El agente de IA con OpenAI.
    │
    ├── subscribe-waba.js         # Utilidad: suscribe la app al WABA.
    ├── upload-all-images.js      # Utilidad: sube las 4 imágenes a Meta.
    ├── upload-image.js           # Utilidad: sube una imagen (modelo1-fixed.jpg).
    ├── fix-all-images.js         # Utilidad: corrige rotación EXIF de las 4.
    └── fix-image.js              # Utilidad: corrige una imagen (modelo1.jpg).
```

**Leyenda:** "NUEVO" = creado íntegramente en la sesión del 18/09/2026.

### 5.1 Carpetas ignoradas por git (`.gitignore`)
```
node_modules/
.env
data/
media/
```
Esto significa que **no se versionan** las credenciales, las imágenes ni el JSON muerto.
Consecuencia práctica: en otro equipo hay que reinstalar dependencias y recrear el `.env`
y la carpeta `media/` a mano.

---

## 6. Variables de entorno (.env)

El archivo `.env` (en la raíz, ignorado por git) contiene toda la configuración
sensible. Estado actual:

| Variable | Valor actual | Obligatoria | Descripción |
|---|---|---|---|
| `PORT` | `3001` | Sí | Puerto del servidor Express. **Cambiado de 3000 a 3001** porque el 3000 lo ocupa otro proyecto (Oasis/Next.js). |
| `VERIFY_TOKEN` | `TU_VERIFY_TOKEN_LOCAL` | Sí | Cadena secreta que Meta envía al verificar el webhook. Debe coincidir con la configurada en Meta. |
| `OPENAI_API_KEY` | *(vacío)* | No (pero sí para IA) | Clave de OpenAI. Mientras esté vacía, el bot usa el modo fallback. **El usuario la cargará.** |
| `OPENAI_MODEL` | `gpt-4o-mini` | No | Modelo de OpenAI a usar. Si se omite, el código usa `gpt-4o-mini` por defecto. |
| `DATABASE_URL` | `postgresql://...@ep-floral-truth-...neon.tech/neondb?...` | Sí | Cadena de conexión a PostgreSQL de Neon. Incluye credenciales. |
| `WHATSAPP_TOKEN` | `EAAY...ZDZD` | Sí | Token de acceso de Meta para enviar mensajes. |
| `PHONE_NUMBER_ID` | `1331451463382373` | Sí | ID del número de WhatsApp emisor en Meta. |
| `GRAPH_API_VERSION` | `v25.0` | Sí | Versión de la Graph API de Meta. |
| `WABA_ID` | `1790632752052686` | Sí | ID de la WhatsApp Business Account. |
| `IMAGE_MODELO_1` | `1413196734042061` | Sí | `media_id` de la imagen del Modelo 1. |
| `IMAGE_MODELO_2` | `927028067148240` | Sí | `media_id` de la imagen del Modelo 2. |
| `IMAGE_MODELO_3` | `1388267412848389` | Sí | `media_id` de la imagen del Modelo 3. |
| `IMAGE_OFERTA_DIA` | `1452748440009158` | Sí | `media_id` de la imagen de la oferta del día. |

**Notas importantes:**
- `dotenv` **no sobreescribe** variables ya presentes en el entorno. Por eso, para
  probar en otro puerto se puede hacer `$env:PORT=3100; node src/app.js` en PowerShell
  sin tocar el `.env`.
- Si `OPENAI_API_KEY` tiene un valor no vacío, `agent.isConfigured()` devuelve `true`
  y se activa el agente. Con cadena vacía `""`, devuelve `false` (modo fallback).
- **Rotar credenciales:** el `WHATSAPP_TOKEN` y `DATABASE_URL` son secretos reales.
  Si este `.env` se compartió por error, conviene regenerarlos.

---

## 7. Base de datos

### 7.1 Conexión
- Motor: **PostgreSQL** alojado en **Neon**.
- Driver: `pg` (node-postgres).
- Configuración (`src/services/db.js`):
  ```js
  const { Pool } = require("pg");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  module.exports = pool;
  ```
- **Un único pool compartido** por todos los servicios (`db.js`). Antes, el pool estaba
  dentro de `catalog-state.service.js`; en esta sesión se extrajo para reutilizarlo.
- `ssl.rejectUnauthorized: false` permite el certificado de Neon sin validar la CA
  (habitual y suficiente para muchos despliegues, aunque no es lo más estricto).
- Aviso de `pg` sobre *SSL modes*: es una **advertencia de versión futura**, no un error.
  Para silenciarla en el futuro se usaría `sslmode=verify-full` en la URL.

### 7.2 Diagrama de tablas

```
clientes_whatsapp                 productos
(EXISTENTE, no se tocó)           (NUEVA)
├── id (bigint, PK)               ├── id (serial, PK)
├── telefono (varchar, unique*)   ├── nombre (text, unique, NOT NULL)
├── catalogo_enviado (bool)       ├── descripcion (text)
├── fecha_catalogo (timestamptz)  ├── precio (numeric, default 0)
├── created_at (timestamptz)      ├── categoria (text)
└── updated_at (timestamptz)      ├── disponible (bool, default true)
                                  ├── imagen_key (text)
                                  ├── created_at (timestamptz)
        productos (1) ───< (N)    └── updated_at (timestamptz)
        producto_variaciones
                                  producto_variaciones
                                  (NUEVA)
                                  ├── id (serial, PK)
                                  ├── producto_id (int, FK → productos.id ON DELETE CASCADE)
                                  ├── talla (text)
                                  ├── color (text)
                                  └── stock (int, default 0)
                                  UNIQUE(producto_id, talla, color)

mensajes (NUEVA, independiente)
├── id (bigint, PK)
├── telefono (text, NOT NULL)
├── origen (text, CHECK: 'cliente' | 'bot')
├── contenido (text)
└── created_at (timestamptz)
```

> \* En `clientes_whatsapp`, `telefono` tiene una restricción `UNIQUE` (necesaria para el
> `ON CONFLICT (telefono)` que usa el código). El esquema exacto se confirmó consultando
> `information_schema`.

### 7.3 Tabla `clientes_whatsapp` (existente — NO se modifica)

Es la **memoria de catálogo**. Guarda qué número ya recibió el catálogo.

| Columna | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | bigint | NO | `nextval(...)` | Clave primaria. |
| `telefono` | varchar | NO | — | Número de WhatsApp del cliente (formato internacional, sin `+`). Debe ser único. |
| `catalogo_enviado` | boolean | NO | `false` | `true` si ya se le envió el catálogo. |
| `fecha_catalogo` | timestamptz | SÍ | — | Cuándo se le envió por última vez. |
| `created_at` | timestamptz | NO | `now()` | Alta del registro. |
| `updated_at` | timestamptz | NO | `now()` | Última actualización. |

**Dato actual:** existe cargado el teléfono `59177331659` (de `data/catalog-state.json`,
que corresponde a una prueba previa).

### 7.4 Tabla `productos` (NUEVA)

Catálogo de prendas. Una fila por producto.

| Columna | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | integer (serial) | NO | `nextval(...)` | Clave primaria. |
| `nombre` | text | NO | — | Nombre del producto. **Único.** |
| `descripcion` | text | SÍ | — | Descripción libre. |
| `precio` | numeric(10,2) | NO | `0` | Precio. **0 = "por definir"**. |
| `categoria` | text | SÍ | — | Categoría (ej.: "vestidos", "blusas"). Hoy todos `indefinida`. |
| `disponible` | boolean | NO | `true` | Si está activo para vender. |
| `imagen_key` | text | SÍ | — | Nombre de la variable del `.env` con el `media_id` (ej. `IMAGE_MODELO_1`). |
| `created_at` | timestamptz | NO | `now()` | Alta. |
| `updated_at` | timestamptz | NO | `now()` | Actualización. |

### 7.5 Tabla `producto_variaciones` (NUEVA)

Combinaciones de talla + color + stock de cada producto.

| Columna | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | integer (serial) | NO | `nextval(...)` | Clave primaria. |
| `producto_id` | integer | NO | — | FK a `productos.id`, `ON DELETE CASCADE`. |
| `talla` | text | SÍ | — | Talla (S, M, L, 38...). |
| `color` | text | SÍ | — | Color. |
| `stock` | integer | NO | `0` | Unidades disponibles. |

Restricción: `UNIQUE (producto_id, talla, color)` — evita duplicar la misma combinación.

### 7.6 Tabla `mensajes` (NUEVA)

Historial de conversación. Permite que el agente tenga **contexto** de los últimos
mensajes de cada cliente.

| Columna | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | bigint (serial) | NO | `nextval(...)` | Clave primaria. |
| `telefono` | text | NO | — | Cliente. |
| `origen` | text | NO | — | `'cliente'` o `'bot'` (con `CHECK`). |
| `contenido` | text | SÍ | — | Texto del mensaje. |
| `created_at` | timestamptz | NO | `now()` | Momento del mensaje. |

Índice: `idx_mensajes_telefono` sobre `(telefono, created_at)` — acelera traer los
últimos mensajes de un cliente.

### 7.7 Consultas clave que ejecuta el código

**¿El cliente ya recibió el catálogo?** (`catalog-state.service.js`)
```sql
SELECT catalogo_enviado FROM clientes_whatsapp
WHERE telefono = $1 LIMIT 1;
```

**Marcar catálogo enviado (alta o actualización):**
```sql
INSERT INTO clientes_whatsapp
  (telefono, catalogo_enviado, fecha_catalogo, created_at, updated_at)
VALUES ($1, true, now(), now(), now())
ON CONFLICT (telefono)
DO UPDATE SET catalogo_enviado = true, fecha_catalogo = now(), updated_at = now();
```

**Listar productos con sus variantes** (`products.service.js`):
```sql
SELECT p.id, p.nombre, p.descripcion, p.precio, p.categoria, p.disponible,
       COALESCE(
         json_agg(json_build_object('talla', v.talla, 'color', v.color, 'stock', v.stock))
         FILTER (WHERE v.id IS NOT NULL), '[]'
       ) AS variaciones
FROM productos p
LEFT JOIN producto_variaciones v ON v.producto_id = p.id
GROUP BY p.id
ORDER BY p.id;
```

**Verificar disponibilidad por producto/talla/color:**
```sql
SELECT p.nombre, p.precio, p.disponible, v.talla, v.color, v.stock
FROM productos p
INNER JOIN producto_variaciones v ON v.producto_id = p.id
WHERE p.disponible = true
  AND (p.nombre ILIKE '%' || $1 || '%')
  AND ($2 IS NULL OR v.talla  ILIKE '%' || $2 || '%')
  AND ($3 IS NULL OR v.color  ILIKE '%' || $3 || '%')
  AND v.stock > 0
ORDER BY p.nombre, v.talla, v.color;
```

**Guardar un mensaje:**
```sql
INSERT INTO mensajes (telefono, origen, contenido) VALUES ($1, $2, $3);
```

**Traer los últimos N mensajes (en orden cronológico):**
```sql
SELECT origen, contenido FROM mensajes
WHERE telefono = $1
ORDER BY created_at DESC
LIMIT $2;
-- El código hace .reverse() para devolverlos del más viejo al más nuevo.
```

---

## 8. Flujo de mensajes de punta a punta

### 8.1 Healthcheck — `GET /`
- Ruta en `src/app.js:171`.
- Responde el texto plano: `Cecilia Tedin Bot funcionando ✅`.
- Sirve para comprobar que el servidor está vivo. (Probado: devuelve `200`.)

### 8.2 Verificación del webhook — `GET /webhook`
- Ruta en `src/app.js:184`.
- Meta llama a esta URL al configurar el webhook. Envía tres parámetros:
  - `hub.mode` (debe ser `subscribe`)
  - `hub.verify_token` (debe coincidir con `VERIFY_TOKEN`)
  - `hub.challenge` (una cadena que hay que devolver tal cual)
- Si todo coincide: responde `200` con el `challenge`.
- Si no: responde `403`.

### 8.3 Recepción — `POST /webhook`
Ruta en `src/app.js:224`. Pasos exactos:
1. **Responde `200` a Meta inmediatamente** (`res.sendStatus(200)`), antes de procesar.
   Esto evita timeouts y reenvíos.
2. Extrae `message` de `req.body.entry[0].changes[0].value.messages[0]`.
3. Si no hay `message` (p. ej., es un estado de entrega/lectura), **termina**.
4. Extrae `phone = message.from`.
5. Extrae `rawText = message.text?.body?.trim() || ""` y `text = rawText.toLowerCase()`.
6. Loguea el mensaje recibido en consola.

Luego bifurca:

### 8.4a Modo AGENTE (si `agent.isConfigured()` es `true`)
- Si hay texto (`rawText`): llama a `agent.handleMessage(phone, rawText)`.
- Si **no** hay texto (audio, imagen, sticker, etc.): llama a
  `agent.handleNonTextMessage(phone, message.type)`.
- Termina.

### 8.4b Modo FALLBACK (si NO hay API key)
1. Consulta `hasReceivedCatalog(phone)`.
2. Detecta si el mensaje pide catálogo con `requestedCatalog(text)` (busca palabras clave).
3. **Cliente nuevo** (`!alreadyReceivedCatalog`) → `sendCatalog(phone, true)` (mensaje de
   bienvenida + 4 imágenes + cierre). Termina.
4. **Cliente ya conocido pero pide catálogo** (`wantsCatalog`) → `sendCatalog(phone, false)`
   (mensaje de "te mostramos nuevamente..." + 4 imágenes + cierre). Termina.
5. **Cualquier otro mensaje** → solo loguea "queda para atención humana". No responde.

### 8.5 ¿Qué hace exactamente `sendCatalog`? (fallback)
Definida en `src/app.js:71`. En orden:
1. Guard anti-duplicados: si ya se está enviando a ese teléfono (`catalogInProgress`),
   no hace nada.
2. Marca el teléfono como "en progreso".
3. Si es primer contacto: envía el saludo de bienvenida; si no, el de "nuevamente".
4. Envía 4 imágenes con sus títulos:
   - `IMAGE_MODELO_1` → "Modelo 1 ✨"
   - `IMAGE_MODELO_2` → "Modelo 2 ✨"
   - `IMAGE_MODELO_3` → "Modelo 3 ✨"
   - `IMAGE_OFERTA_DIA` → "🔥 Oferta del día"
5. Envía el mensaje de cierre invitando a preguntar por colores/tallas/disponibilidad.
6. `markCatalogSent(phone)` en la base de datos.
7. En el `finally`, libera el guard. Los errores se capturan y se loguean (no rompen el server).

### 8.6 Diagrama de decisión resumido

```
Mensaje entrante
      │
      ▼
¿OPENAI_API_KEY? ──SÍ──► ¿Tiene texto? ──SÍ──► handleMessage() ──► OpenAI + tools
      │                                     └─NO──► handleNonTextMessage()
      │
      └──NO──► ¿Cliente nuevo? ──SÍ──► sendCatalog(primera vez)
                     │
                     └─NO──► ¿Pide catálogo? ──SÍ──► sendCatalog(nuevamente)
                                   │
                                   └─NO──► "queda para atención humana"
```

---

## 9. El agente de IA (OpenAI)

Archivo: `src/services/agent.service.js` (creado en esta sesión).

### 9.1 Configuración del cliente OpenAI
- `isConfigured()` → `Boolean(process.env.OPENAI_API_KEY)`. Decide el modo.
- `getClient()` → crea el cliente OpenAI **una sola vez** (lazy singleton) con la key del
  entorno.
- Modelo: `process.env.OPENAI_MODEL || "gpt-4o-mini"`.
- Parámetros de la llamada: `temperature: 0.4`, `tool_choice: "auto"`.
- Bucle máximo: **5 turnos** por mensaje (evita bucles infinitos).

### 9.2 Prompt del sistema (texto exacto)

```
Eres el asistente virtual de 'Cecilia Tedin', una marca de ropa.
Atiendes clientes por WhatsApp en español, de forma cordial, breve y natural.
Puedes usar emojis con moderación, acordes al tono cercano de una marca de ropa.

TUS TAREAS:
1. Si el cliente pide ver el catálogo, modelos, ofertas o promociones, usa la herramienta 'enviar_catalogo'.
2. Si pregunta por productos, precios, tallas o colores, usa 'consultar_productos'.
3. Si pregunta si hay disponibilidad de un modelo en una talla/color, usa 'verificar_disponibilidad'.
4. Si el cliente quiere comprar, coordinar envío/pago, reclama, se enoja, o pide algo que no puedes resolver,
   usa 'derivar_a_humano' y avísale amablemente que un asesor lo atenderá.

REGLAS IMPORTANTES:
- NUNCA inventes precios, stock, tallas ni colores. Si el dato no está en la información de abajo,
  dilo con honestidad y ofrece derivar a un humano.
- No repitas el catálogo si el cliente no lo pide otra vez.
- Responde en máximo 2 o 3 frases cortas. Es WhatsApp, no un email.
- Si el mensaje no tiene relación con la marca, responde amablemente y ofrece ayuda.

INFORMACIÓN ACTUAL DE PRODUCTOS:
<catalogInfo>
```

`<catalogInfo>` se genera en cada mensaje con `formatProductsForAgent(getAllProducts())`,
es decir, la lista real de la BD. Ejemplo de cómo se ve hoy:
```
- Modelo 1 (Disponible) — Precio por definir
- Modelo 2 (Disponible) — Precio por definir
- Modelo 3 (Disponible) — Precio por definir
- Oferta del día (Disponible) — Precio por definir
```

### 9.3 Herramientas (tools) del agente

| Nombre | Parámetros | Qué devuelve al modelo | Efecto real |
|---|---|---|---|
| `enviar_catalogo` | *(ninguno)* | "Catálogo enviado al cliente correctamente." | **Sí envía** los 4 mensajes de imagen por WhatsApp y marca el catálogo como enviado en la BD. |
| `consultar_productos` | *(ninguno)* | Lista de productos formateada. | Consulta la BD. |
| `verificar_disponibilidad` | `producto` (req.), `talla` (opc.), `color` (opc.) | Líneas tipo "Modelo 1 — talla M / rojo — 3 disponible(s)" o "No hay stock...". | Consulta la BD. |
| `derivar_a_humano` | `motivo` (req.) | "Conversación derivada a atención humana. Motivo: ..." | Solo loguea en consola (no hay aviso real a un humano todavía). |

**Detalle JSON de las definiciones** (resumen):
- `enviar_catalogo`: objeto sin propiedades `required`.
- `verificar_disponibilidad`: requiere `producto`; `talla` y `color` opcionales.
- `derivar_a_humano`: requiere `motivo`.

### 9.4 Bucle de ejecución (`runAgent`)
Pseudocódigo exacto:
```
history = getLastMessages(phone, 10)
productos = getAllProducts()  → catalogInfo
messages = [ {system: prompt}, ...history mapeado a user/assistant, {user: texto} ]

para turno = 1..5:
    completion = openai.chat.completions.create(model, messages, tools, tool_choice:auto, temp 0.4)
    message = completion.choices[0].message
    messages.push(message)

    si message NO tiene tool_calls:
        finalText = message.content || ""
        romper bucle

    para cada tool_call:
        args = JSON.parse(tool_call.function.arguments || "{}")  (con try/catch)
        result = executeTool(tool_call.function.name, args, phone)
        messages.push({ role:"tool", tool_call_id: tool_call.id, content: result })

devolver finalText
```

### 9.5 Envío de la respuesta y manejo de errores
- `handleMessage(phone, text)`:
  1. Trae historial.
  2. Guarda el mensaje del cliente (`origen='cliente'`).
  3. Ejecuta `runAgent`.
  4. Si hay `reply` no vacío: lo envía por WhatsApp y lo guarda (`origen='bot'`).
- `handleNonTextMessage(phone, type)`: guarda `[tipo]`, responde que solo lee texto y que
  un humano responderá, guarda la respuesta.
- Si una herramienta falla, `executeTool` captura el error y devuelve un texto
  ("Error ejecutando X: ...") en vez de tumbar el flujo.
- Si la llamada a OpenAI falla, la excepción sube a `app.js`, que la captura y loguea
  ("Error procesando webhook: ...").

### 9.6 Cómo interpretar "modo agente" respecto al catálogo
- En modo agente **no** se envía el catálogo automáticamente al primer mensaje; lo envía
  solo si el LLM decide llamar a `enviar_catalogo`. Esto es un cambio de comportamiento
  frente al modo fallback (que sí lo manda a cualquier cliente nuevo).
- Si quieres mantener el envío automático al primer contacto también con IA, hay que
  agregar esa regla en `app.js` o en el prompt (pendiente, no implementado).

---

## 10. Servicios (uno por uno)

### 10.1 `src/services/db.js` (NUEVO)
- **Rol:** exponer un único `Pool` de PostgreSQL compartido.
- **Exporta:** `pool`.
- **Por qué:** antes cada servicio creaba su propio pool; ahora todos comparten uno,
  evitando agotar conexiones.

### 10.2 `src/services/whatsapp.service.js`
- **Rol:** hablar con la API de WhatsApp de Meta.
- **Funciones:**
  - `sendTextMessage(to, text)` → POST a
    `https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/messages`
    con `type: "text"`. Devuelve `response.data`.
  - `sendImageMessage(to, imageId, caption = "")` → mismo endpoint, `type: "image"`,
    usando `image.id = imageId` y `image.caption = caption`.
- **Autorización:** header `Authorization: Bearer ${WHATSAPP_TOKEN}`.
- **Detalle curioso:** en el archivo, el `module.exports` aparece **antes** de la
  definición de `sendImageMessage`. Funciona porque las *function declarations* se
  elevan (hoisting). No es un bug, pero es un estilo raro; se podría reordenar.

### 10.3 `src/services/catalog-state.service.js`
- **Rol:** memoria de catálogo en la tabla `clientes_whatsapp`.
- **Funciones:**
  - `hasReceivedCatalog(phone)` → `true/false` según `catalogo_enviado`.
  - `markCatalogSent(phone)` → alta o actualización (`ON CONFLICT`) con `catalogo_enviado=true`.
- **Cambio de esta sesión:** ahora usa `require("./db")` en lugar de crear su propio `Pool`.

### 10.4 `src/services/products.service.js` (NUEVO)
- **Rol:** consultar productos y disponibilidad.
- **Funciones:**
  - `getAllProducts()` → array de productos, cada uno con `variaciones` (JSON agregado).
  - `checkAvailability(productName, talla, color)` → filas con stock > 0 que coinciden.
  - `formatProductsForAgent(products)` → **texto** legible para el LLM. Formatea precio
    como `Bs X.XX` o "Precio por definir" si es 0. Lista solo variantes con stock > 0.

### 10.5 `src/services/messages.service.js` (NUEVO)
- **Rol:** historial de conversación.
- **Funciones:**
  - `saveMessage(telefono, origen, contenido)`.
  - `getLastMessages(telefono, limit = 10)` → últimos N en orden cronológico.

### 10.6 `src/services/agent.service.js` (NUEVO)
- **Rol:** orquestar el agente de IA.
- **Exporta:** `isConfigured`, `handleMessage`, `handleNonTextMessage`, `sendCatalogToClient`.
- **Interno:** `getClient`, `buildSystemPrompt`, `tools`, `executeTool`, `runAgent`.
- **Reutiliza** `whatsapp.service` y `catalog-state.service` para el catálogo, y los
  servicios nuevos para productos e historial.
- Contiene su propio guard `catalogInProgress` (Set) para no duplicar catálogos.

---

## 11. Scripts utilitarios de media y WABA

Todos en `src/`, se ejecutan manualmente con `node src/<archivo>.js`. **No** forman parte
del servidor; son herramientas de un solo uso.

### 11.1 `subscribe-waba.js`
- Suscribe la aplicación al WABA para que Meta empiece a enviar webhooks.
- POST a `https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/subscribed_apps`.
- Loguea el resultado o el error.

### 11.2 `upload-all-images.js`
- Sube las 4 imágenes `*-fixed.jpg` a Meta y **imprime los `media_id`** listos para pegar
  en el `.env`.
- Endpoint: `POST .../{PHONE_NUMBER_ID}/media`, `multipart` con `messaging_product=whatsapp`
  y `file`.
- Array de entrada: `IMAGE_MODELO_1 → modelo1-fixed.jpg`, `IMAGE_MODELO_2 → modelo2-fixed.jpg`,
  `IMAGE_MODELO_3 → modelo3-fixed.jpg`, `IMAGE_OFERTA_DIA → oferta-dia-fixed.jpg`.
- Al final imprime un bloque de `KEY=valor` para copiar al `.env`.

### 11.3 `upload-image.js`
- Igual que el anterior pero sube **una sola** imagen (`./media/modelo1-fixed.jpg`).
- Imprime `MEDIA_ID: ...`. Es la versión "de prueba" del script.

### 11.4 `fix-all-images.js`
- Usa `sharp` para corregir la rotación EXIF y recomprimir a JPG de calidad 95.
- Entrada: `modelo1`, `modelo2`, `modelo3`, `oferta-dia` (busca extensión
  `.jpg/.jpeg/.png/.webp`).
- Salida: `media/<nombre>-fixed.jpg`.
- **Nota:** usa rutas relativas `"./media/..."`, así que debe ejecutarse **desde la raíz
  del proyecto**.

### 11.5 `fix-image.js`
- Versión "de prueba": corrige solo `modelo1.jpg` → `modelo1-fixed.jpg`.

> Importante: las imágenes del `.env` (`IMAGE_*`) apuntan a los `media_id` de Meta, NO a
> los archivos locales. Volver a subir imágenes genera **nuevos** `media_id`, que hay que
> reemplazar en el `.env`.

---

## 12. Scripts y archivos de base de datos

### 12.1 `src/init-db.js` (NUEVO)
- Carga `dotenv`, lee los archivos SQL y los ejecuta **en orden**:
  1. `sql/schema.sql`
  2. `sql/seed.sql`
- Luego imprime la tabla de productos actuales con `console.table`.
- Cierra el pool con `pool.end()` al terminar (buena práctica).
- Se ejecuta con `npm run init-db`.
- **Idempotente:** usa `CREATE TABLE IF NOT EXISTS` y `ON CONFLICT DO NOTHING`, así que
  correrlo varias veces no rompe ni duplica.

### 12.2 `sql/schema.sql` (NUEVO)
- Define `productos`, `producto_variaciones` y `mensajes`, más el índice
  `idx_mensajes_telefono`.
- **No toca** `clientes_whatsapp`.

### 12.3 `sql/seed.sql` (NUEVO)
- Inserta 4 productos base (Modelo 1, Modelo 2, Modelo 3, Oferta del día), con
  `precio = 0`, `categoria = 'indefinida'` y `imagen_key` apuntando a la variable del `.env`.
- `ON CONFLICT (nombre) DO NOTHING` para no duplicar.
- **Pendiente:** reemplazar por datos reales.

### 12.4 Estado de la BD tras `init-db` (verificado)
```
┌─────────┬────┬──────────────────┬────────┬────────────┐
│ (index) │ id │ nombre           │ precio │ disponible │
├─────────┼────┼──────────────────┼────────┼────────────┤
│ 0       │ 1  │ 'Modelo 1'       │ '0.00' │ true       │
│ 1       │ 2  │ 'Modelo 2'       │ '0.00' │ true       │
│ 2       │ 3  │ 'Modelo 3'       │ '0.00' │ true       │
│ 3       │ 4  │ 'Oferta del día' │ '0.00' │ true       │
└─────────┴────┴──────────────────┴────────┴────────────┘
```

---

## 13. Catálogo de imágenes y media IDs

| Producto | Archivo original | Archivo corregido | Variable `.env` | `media_id` |
|---|---|---|---|---|
| Modelo 1 | `media/modelo1.jpg` | `media/modelo1-fixed.jpg` | `IMAGE_MODELO_1` | `1413196734042061` |
| Modelo 2 | `media/modelo2.png` | `media/modelo2-fixed.jpg` | `IMAGE_MODELO_2` | `927028067148240` |
| Modelo 3 | `media/modelo3.png` | `media/modelo3-fixed.jpg` | `IMAGE_MODELO_3` | `1388267412848389` |
| Oferta del día | `media/oferta-dia.png` | `media/oferta-dia-fixed.jpg` | `IMAGE_OFERTA_DIA` | `1452748440009158` |

- Los archivos originales pesan más (varios MB); las versiones `-fixed` están corregidas y
  recomprimidas.
- Los `media_id` son los que efectivamente se usan para enviar por WhatsApp.

---

## 14. Historial de cambios: qué se creó y qué se modificó

### 14.1 Historia de git (antes de esta sesión)
```
8ede7fe  Use Neon database for WhatsApp catalog state
a774ca4  Initial Cecilia Tedin WhatsApp bot
```
- Commit 1: bot inicial.
- Commit 2: migración del estado a la base de datos Neon.

### 14.2 Trabajo de la sesión del 18/09/2026

**ARCHIVOS CREADOS (9):**
| Archivo | Propósito |
|---|---|
| `REPORTE-PROYECTO.md` | Reporte resumido de avance. |
| `DOCUMENTACION.md` | Este documento (documentación exhaustiva). |
| `sql/schema.sql` | Tablas nuevas. |
| `sql/seed.sql` | Productos iniciales. |
| `src/init-db.js` | Script de inicialización de BD. |
| `src/services/db.js` | Pool compartido de Postgres. |
| `src/services/products.service.js` | Consultas de productos/disponibilidad. |
| `src/services/messages.service.js` | Historial de conversación. |
| `src/services/agent.service.js` | Agente de IA con OpenAI. |

**ARCHIVOS MODIFICADOS (4):**
| Archivo | Cambio |
|---|---|
| `src/app.js` | Import del agente; bifurcación modo agente / fallback; captura de texto original; maneja mensajes no-texto. |
| `src/services/catalog-state.service.js` | Ahora usa el pool compartido (`require("./db")`). |
| `package.json` | Agregada dependencia `openai` y script `init-db`. |
| `package-lock.json` | Actualizado por `npm install`. |
| `.env` | `PORT` 3000→3001; agregadas `OPENAI_API_KEY` (vacía) y `OPENAI_MODEL`; comentarios. |

**BASE DE DATOS (Neon):**
- Se crearon las tablas `productos`, `producto_variaciones`, `mensajes` y el índice
  `idx_mensajes_telefono`.
- Se insertaron 4 productos base.
- **No se modificó** `clientes_whatsapp`.

**VERIFICACIONES REALIZADAS:**
- `node --check` en todos los archivos: SINTAXIS OK.
- `npm run init-db`: tablas creadas y seed cargado correctamente.
- Consulta a `products.service`: devuelve los 4 productos con formato correcto.
- `agent.isConfigured()`: devuelve `false` (aún sin key), como se espera.
- Arranque del servidor en puerto libre: `GET /` → `200 Cecilia Tedin Bot funcionando ✅`.

---

## 15. Estado actual: funciona / no funciona

### 15.1 Funciona (verificado)
- [x] Servidor Express arranca y responde healthcheck.
- [x] Verificación del webhook de Meta (código listo; requiere URL pública para Meta).
- [x] Recepción de mensajes y parseo del payload.
- [x] Envío de texto e imágenes (ya usado con éxito con anterioridad: hay clientes en BD).
- [x] Modo fallback por palabras clave.
- [x] Guard anti-duplicados de catálogo.
- [x] Conexión a PostgreSQL de Neon.
- [x] Tablas nuevas creadas y seed cargado.
- [x] Consultas de productos y disponibilidad.
- [x] Historial de conversación (guardar/leer).
- [x] Agente de IA implementado (código completo, con herramientas y prompt).

### 15.2 No funciona / no verificado todavía
- [ ] **El agente no está activo**: falta `OPENAI_API_KEY` en el `.env`.
- [ ] **No se ha probado un mensaje real contra OpenAI** (necesita la key).
- [ ] **No hay datos reales de productos** (precios/tallas/colores en 0/indefinido).
- [ ] **No hay verificación de firma del webhook** (`X-Hub-Signature-256`). Meta lo
  recomienda; hoy no se valida. Riesgo: cualquiera que conozca la URL podría inyectar
  mensajes falsos. (Pendiente de seguridad.)
- [ ] **`derivar_a_humano` solo loguea**: no avisa a ningún asesor real.
- [ ] No hay tests automatizados ni linter.
- [ ] No hay manejo de audio/imagen con IA (solo avisa que un humano responderá).

---

## 16. Pendientes y roadmap

### 16.1 Acciones inmediatas (usuario)
1. **Cargar `OPENAI_API_KEY`** en `.env` (el usuario la tiene).
2. **Cargar datos reales de productos**:
   - Vía `sql/seed.sql` + `npm run init-db`, o
   - Vía `INSERT` directo a `productos` y `producto_variaciones`.
3. Confirmar que los `media_id` de las imágenes siguen vigentes.
4. Exponer el puerto **3001** con un túnel público (ngrok/Cloudflare) y apuntar el webhook
   de Meta ahí, para probar en WhatsApp real.

### 16.2 Mejoras sugeridas (corto plazo)
- [ ] Validar la firma `X-Hub-Signature-256` del webhook (seguridad).
- [ ] Implementar un aviso real al derivar a humano (correo, WhatsApp interno, n8n, etc.).
- [ ] Almacenar el nombre del cliente (`value.contacts[0].profile.name`) para personalizar.
- [ ] Reglas de horario (responder distinto fuera de horario de atención).
- [ ] Comandos de administración (cargar/editar productos desde WhatsApp o panel).
- [ ] Logs estructurados y persistencia de errores.
- [ ] Tests (por ejemplo con `node:test` o Jest) para servicios y flujo.

### 16.3 Mejoras de mediano plazo
- [ ] Enviar imágenes de productos dinámicamente desde la BD (no solo las 4 fijas).
- [ ] Flujo de pedido: capturar producto/talla/color/cantidad y registrar el pedido.
- [ ] Integración con pasarela de pago o registro de pedidos.
- [ ] Panel web o bot de administración.
- [ ] Soporte de audio (transcripción con Whisper) e imágenes entrantes.

---

## 17. Cómo instalar, correr, probar y desplegar

### 17.1 Instalación
```bash
cd cecilia-tedin-bot
npm install
```

### 17.2 Configurar `.env`
Usar la plantilla del Anexo 20.3 y completar `OPENAI_API_KEY`.

### 17.3 Inicializar la base de datos (una vez)
```bash
npm run init-db
```

### 17.4 Correr
```bash
npm run dev     # desarrollo (nodemon)
npm start       # producción
```
El servidor queda en `http://localhost:3001`.

### 17.5 Probar sin WhatsApp
Healthcheck:
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/" -UseBasicParsing
```
Simular un mensaje entrante (revisar la consola del servidor):
```bash
curl -X POST http://localhost:3001/webhook -H "Content-Type: application/json" -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"59100000000\",\"type\":\"text\",\"text\":{\"body\":\"hola, precio del modelo 1\"}}]}}]}]}"
```
> Ojo: en modo agente esto llamará a OpenAI (consume crédito y requiere la key). En modo
> fallback solo logueará.

### 17.6 Desplegar en producción
- El código no está atado a Windows; puede correr en cualquier host con Node 18+.
- Necesita: variables del `.env`, salida a internet, y una **URL pública** para el webhook.
- Opciones de host: Railway, Render, Fly.io, VPS, etc.
- El puerto real en producción lo da la plataforma (normalmente vía `process.env.PORT`).

### 17.7 Configurar el webhook en Meta
1. Exponer el puerto con un túnel HTTPS público.
2. En Meta (WhatsApp → Configuración → Webhooks): URL `https://TU_DOMINIO/webhook`,
   token de verificación = `VERIFY_TOKEN`.
3. Suscribir los eventos de mensajes (y con `subscribe-waba.js` si hace falta).

---

## 18. Troubleshooting / problemas conocidos

**1. El servidor arranca pero `GET /` muestra otra cosa (una página de Next.js).**
Causa: el puerto 3000 estaba ocupado por el proyecto **Oasis** (Next.js). Solución:
se cambió `PORT` a **3001**. No volver a 3000 en esta máquina.

**2. El bot no usa IA aunque hay herramientas.**
Causa: `OPENAI_API_KEY` vacía. Es el comportamiento esperado (modo fallback).
Solución: cargar la key.

**3. Respuestas con "Precio por definir".**
Causa: los productos tienen `precio = 0`. Solución: cargar precios reales (y el prompt
del sistema prohíbe inventarlos, por eso no da cifras).

**4. Las fotos salen giradas en WhatsApp.**
Causa: orientación EXIF de la foto original. Solución: correr `fix-all-images.js` y
volver a subir con `upload-all-images.js` (genera nuevos `media_id`).

**5. Aviso de `pg` sobre "SSL modes".**
No es error. Es una advertencia de una futura versión de `pg`/`pg-connection-string`.
Se puede ignorar; a futuro usar `sslmode=verify-full`.

**6. `data/catalog-state.json` no se usa.**
Es residuo de una versión anterior a la migración a Neon. Se puede borrar.

**7. Timeout de Meta / mensajes duplicados.**
El código responde `200` de inmediato para evitarlo. Si aún se duplican, revisar
reintentos de Meta y el guard `catalogInProgress`.

---

## 19. Seguridad

- **`.env` ignorado por git** (`.gitignore`): no se versionan credenciales.
- **Secretos presentes:** `DATABASE_URL`, `WHATSAPP_TOKEN`, `VERIFY_TOKEN`, y (futuro)
  `OPENAI_API_KEY`. Si el repo se comparte, **rotar** estos valores.
- **Verificación del webhook:** implementada solo para el `GET` de alta. **Falta** validar
  la firma de los `POST` (`X-Hub-Signature-256`), lo que permitiría a un tercero con la URL
  inyectar mensajes. Se recomienda implementarlo.
- **Prompt injection:** un cliente podría intentar manipular al LLM. Mitigaciones
  actuales: el prompt prohíbe inventar datos y las acciones sensibles pasan por
  herramientas con parámetros acotados. Se puede endurecer si hace falta.
- **Costos:** el modo agente consume tokens de OpenAI por mensaje. Conviene poner límites
  y monitorear.

---

## 20. Anexos

### 20.1 Payload de ejemplo: mensaje entrante de Meta
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "1790632752052686",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "591XXXXXXXX",
              "phone_number_id": "1331451463382373"
            },
            "contacts": [
              { "profile": { "name": "Cliente" }, "wa_id": "59100000000" }
            ],
            "messages": [
              {
                "from": "59100000000",
                "id": "wamid.XXXX",
                "timestamp": "1700000000",
                "type": "text",
                "text": { "body": "Hola, quiero ver el catálogo" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

### 20.2 Consultas SQL útiles
```sql
-- Ver todos los clientes y si recibieron catálogo
SELECT telefono, catalogo_enviado, fecha_catalogo FROM clientes_whatsapp ORDER BY updated_at DESC;

-- Ver productos con conteo de variantes
SELECT p.nombre, p.precio, COUNT(v.id) AS variantes
FROM productos p LEFT JOIN producto_variaciones v ON v.producto_id = p.id
GROUP BY p.id ORDER BY p.id;

-- Ver últimas conversaciones
SELECT telefono, origen, contenido, created_at
FROM mensajes ORDER BY created_at DESC LIMIT 50;

-- Agregar una variante de ejemplo
INSERT INTO producto_variaciones (producto_id, talla, color, stock)
VALUES (1, 'M', 'Rojo', 3)
ON CONFLICT (producto_id, talla, color)
DO UPDATE SET stock = EXCLUDED.stock;

-- Actualizar precio real de un producto
UPDATE productos SET precio = 150.00, updated_at = now() WHERE nombre = 'Modelo 1';
```

### 20.3 Plantilla de `.env`
```
PORT=3001
VERIFY_TOKEN=TU_VERIFY_TOKEN_LOCAL

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

DATABASE_URL=postgresql://USUARIO:PASSWORD@HOST/neondb?sslmode=require
WHATSAPP_TOKEN=TU_TOKEN_DE_META
PHONE_NUMBER_ID=1331451463382373
GRAPH_API_VERSION=v25.0
WABA_ID=1790632752052686
IMAGE_MODELO_1=1413196734042061
IMAGE_MODELO_2=927028067148240
IMAGE_MODELO_3=1388267412848389
IMAGE_OFERTA_DIA=1452748440009158
```

### 20.4 Comandos rápidos (PowerShell)
```powershell
# Instalar
npm install

# Inicializar BD
npm run init-db

# Correr en desarrollo
npm run dev

# Healthcheck
Invoke-WebRequest -Uri "http://localhost:3001/" -UseBasicParsing

# Ver qué ocupa un puerto
Get-NetTCPConnection -LocalPort 3001 -State Listen

# Ver sintaxis de un archivo
node --check src/app.js
```

### 20.5 Flujo de decisión del agente (resumen para no técnicos)
1. Llega un mensaje.
2. Si hay IA configurada, la IA lo lee y decide:
   - ¿Pide fotos? → manda el catálogo.
   - ¿Pide precios/tallas? → consulta los productos.
   - ¿Pide un modelo específico disponible? → verifica stock.
   - ¿Quiere comprar o tiene un problema? → avisa que un humano lo atenderá.
3. La IA nunca inventa datos: si no los tiene, lo dice.
4. Todo se guarda para dar contexto en los siguientes mensajes.

---

**Fin del documento.**

---

## 21. Sesión 18/09/2026 (tarde) — Resumen para Atención humana [ByOpenCode][ByClaude]

> Esta sección documenta el trabajo de la colaboración Claude + OpenCode sobre
> el **handoff a asesor humano** del Piloto V1. Todo lo marcado como
> `[ByOpenCode] (Reasignado)` fue escrito/reasignado por OpenCode.

### 21.1 Qué se construyó

Cuando un cliente elige la opción **"Hablar con un asesor"** (opción 6 del menú),
el bot lo pasa a estado `PAUSED_HUMAN` y deja de responderle. Para que la
asesora humana atienda sin releer todo el historial, se muestra una **tarjeta
fijada "Resumen para Atención"** con tres campos: **Origen**, **Modelo** e
**Interés**.

### 21.2 Responsabilidades

| Quién | Qué hizo |
|---|---|
| **Claude** | Tabla `resumenes_atencion` (`sql/resumenes.sql`), columna `estado_conversacion` (`sql/estados.sql`), árbol conversacional V1 en `state.service.js`, `resumeBotForClient()`. |
| **OpenCode** | Endpoints del dashboard + tarjeta del frontend que consume esa data. |

### 21.3 Backend (`src/routes/dashboard.js`)

- **`GET /dashboard/api/conversation/:phone/handoff-summary`**
  - Fuente principal: última fila de `resumenes_atencion` (origen_trafico,
    modelo_seleccionado, interes_color y JSONB `resumen` con motivo/último mensaje).
  - Fuente de respaldo (si no hay fila): `trafico_clientes` (origen/referral) y
    detección en el historial de `mensajes` (menciones a "Modelo N"/"Oferta del
    día" y última opción del menú `[Opción del menú: X]`).
  - Devuelve: `{ telefono, estado, es_pausa_humana, origen, modelos[],
    interes, resumen, resumen_fecha }`.
- **`POST /dashboard/api/conversation/:phone/resume`**
  - Llama a `resumeBotForClient()` (Claude) → vuelve al estado `MENU`.
- Firmas: `// [ByOpenCode] (Reasignado)` y comentarios explicativos en cada función.

### 21.4 Frontend (`public/dashboard.html`)

- Tarjeta `#handoff-card` (CSS sticky + HTML) dentro del panel del hilo.
- **Solo se muestra** cuando `es_pausa_humana === true` (`PAUSED_HUMAN`).
- Muestra chips de **Origen** (📣 Anuncio / 🌱 Orgánico), **Modelos** e **Interés**,
  pill "BOT EN PAUSA" y botón **"▶ Reanudar bot"** (POST resumen → oculta la tarjeta).
- Se recarga automágicamente al abrir el chat (`loadThread` → `loadHandoff`) y al
  llegar un mensaje nuevo por SSE.
- Firmas: `// [ByOpenCode] (Reasignado)` en el HTML/JS/CSS añadido.

### 21.5 Base de datos

- Migraciones aplicadas con `npm run init-db` (idempotente):
  `trafico.sql`, `estados.sql`, `resumenes.sql` ✅.
- Tabla `resumenes_atencion`: `telefono`, `origen_trafico`, `modelo_seleccionado`,
  `interes_color`, `resumen` (JSONB), `created_at`, índice por `(telefono, created_at DESC)`.

### 21.6 Verificación (probado de punta a punta)

- Cliente `PAUSED_HUMAN` + fila en `resumenes_atencion` → el summary devuelve
  Origen/Modelo/Interés + JSON de resumen correctamente.
- `POST /resume` → estado pasa a `MENU` y `es_pausa_humana` baja a `false`.
- Cliente `PAUSED_HUMAN` **sin** fila de resumen (fallback) → endpoint arma el
  resumen desde `trafico_clientes` + `mensajes` (orgánico, Modelo 3, "Precios y tallas").
- Datos de prueba eliminados después de cada corrida.

**Fin del documento (v3).** Al retomar: 1) correr `npm run init-db`, 2) revisar el
dashboard en `http://localhost:3001/dashboard`, 3) probar el webhook con túnel público.
