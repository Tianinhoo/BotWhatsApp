# Luka.bo — Esqueleto y análisis estructural

> Documento de referencia externa. NO es parte del sistema Cecilia.
> Sirve para comparar arquitectura, UX y modelo de negocio con nuestro V1.
> Fuente: exploración pública de `https://luka.bo` el 2026-09-21.
> Firmado: `// [ByClaude]`

---

## 1. Identidad del producto

| Campo | Valor |
|---|---|
| Nombre comercial | **Luka** |
| Dominio | `luka.bo` |
| Tagline | *"Paga fácil y seguro"* |
| Propuesta | *"Hacer un pago nunca fue tan simple"* |
| Canal principal | **WhatsApp** (chatbot) |
| Canal secundario | Sitio web + aplicación web |
| Número WhatsApp | +591 7777 5677 |
| Facebook | facebook.com/HolaLuka |
| Soporte | soporte@luka.bo |

---

## 2. Estructura legal / corporativa

| Capa | Entidad |
|---|---|
| Marca | **Luka** |
| Titular internacional | **Luka Pay, Inc.** |
| Operador local (Bolivia) | **LPAYINC Servicios Digitales S.A.** |
| Dominios asociados | `luka.bo`, `HolaLuka.com`, `facebook.com/HolaLuka` |

Notar la doble capa: entidad extranjera (Inc.) que licencia la marca a una S.A. boliviana. Es el patrón típico de fintech que quiere blindaje jurídico + operación local.

---

## 3. Credenciales técnicas y regulatorias

| Sello | Significado |
|---|---|
| **Meta Business Partner** | Meta reconoce a Luka como partner oficial → acceso preferencial a WhatsApp Business API, soporte directo con Meta, cupos altos de mensajes |
| **PCI DSS** | Cumple el estándar de seguridad para manejo de datos de tarjetas de crédito/débito. Es requisito para procesar pagos con Visa/Master |

**Implicancia para Cecilia:** ambos sellos son metas a largo plazo si Cecilia escala. No aplican para V1 (no procesamos pagos ni somos Meta Partner formal).

---

## 4. Cobertura — categorías y verticales

Luka agrupa a las empresas destinatarias del pago en **8 categorías**. Cada empresa tiene su propia página `/empresas/<slug>`.

| # | Categoría | Descripción oficial | Empresas | Ejemplos |
|---|---|---|---|---|
| 1 | **TV & Telecom** | Recargas, postpago, internet, TV satelital | 5 | COTAP, Entel, Tuves-Inter, Tigo, Viva |
| 2 | **Servicios básicos** | Agua, gas y luz | **21** | EPSAS, SAGUAPAC, Semapa, ELFEC, Delapaz, ENDE (Beni/Corp/Oruro), ELAPAS, CAPAG, Coopaguas, Cooplan, Cosaalt, Cosaju, Cospail, EMAPAV, EMDELL, EMTAGAS, EPSA Cobija, Sepsa, Setar |
| 3 | **Seguros** | Pagos de pólizas y SOAT | 8 | BISA, Fortaleza, Fortaleza Vida, LBC, Nacional, Seguros Mercantil Santa Cruz, Univida, La Vitalicia |
| 4 | **Educación** | Colegios y universidades | 10 | EMI, Kinda Golden Lion, Nur, Saint Andrew's, SCCS, UABJB, UAGRM, Univalle, UPDS, USFA |
| 5 | **Ventas directas** | Ventas por catálogo | 3 | Azzorti, Tupperware, Yanbal |
| 6 | **Créditos y bienes raíces** | Cuotas, terrenos, cementerios | 7 | Campos del Este, Clara Serrano, Memorial Park, Parque de los Recuerdos, Terreno Urbanizaciones, Urubó Village, Villa Real |
| 7 | **Parqueo municipal** | Parqueo tarifado en vía pública | 2 | Parqueo para Todos (La Paz), SEM Cochabamba |
| 8 | **Comercios** | Cemento y otros | 1 | SOBOCE |

**Total: ~57 empresas integradas.**

Observación clave: **la vertical "Ventas directas" incluye Yanbal / Azzorti / Tupperware** — venta por catálogo, MISMO nicho de Cecilia (mujeres, productos de belleza / hogar / lifestyle). Es la vertical donde Cecilia podría eventualmente integrarse (V3+).

---

## 5. Entry points (UX de entrada)

### 5.1 Web
- `/` — homepage con grid de las 8 categorías
- `/empresas/<slug>` — página por empresa (57 páginas)
- `/usuario/ingresar` — login
- `/terminos` — términos y condiciones

### 5.2 WhatsApp
- Link universal: `https://wa.me/59177775677?text=Menú`
- Palabra clave: **"Menú"** (idéntica mecánica a la nuestra con opciones 1-7)

### 5.3 Login (métodos de autenticación)
- Continuar con **WhatsApp**
- Continuar con **Google**
- Continuar con **Facebook**
- Correo + contraseña
- Enlace "Crear nueva cuenta" y "Olvidé la contraseña"

**Comparación con Cecilia:** nosotros no tenemos login de clienta (no lo necesita para V1). Solo hay login **de asesora** al dashboard. Luka necesita login porque persiste métodos de pago.

---

## 6. Flow funcional (inferido de términos)

### 6.1 Registro
1. La clienta escribe al WhatsApp de Luka
2. Se le pide registrarse (mayor de 18)
3. Datos: identidad + credenciales de las Empresas de Servicios + datos de tarjeta/cuenta
4. Se genera PIN

### 6.2 Consulta y pago
1. Luka **se conecta al sistema de la Empresa de Servicio** en nombre del usuario (con las credenciales guardadas)
2. **Extrae la factura pendiente**
3. Muestra el monto al usuario
4. Usuario autoriza el cobro
5. Un **procesador de pagos aliado** (no Luka directamente) hace el cargo a la tarjeta/QR
6. El pago va **directo a la cuenta de la Empresa de Servicios** (no pasa por Luka)

### 6.3 Rol de Luka
Luka NO:
- procesa transacciones de pago (lo hace un tercero)
- toma posesión del dinero
- respalda deudas ante la Empresa de Servicios

Luka SÍ:
- guarda credenciales del usuario
- guarda info de tarjeta
- automatiza el flujo de consulta y pago
- factura al usuario (opcionalmente, se reserva ese derecho)

---

## 7. Data model (inferido)

Entidades que Luka necesariamente maneja:

| Entidad | Campos probables |
|---|---|
| **Usuario** | id, teléfono, email, PIN hash, fecha_registro, datos_personales |
| **CuentaPago** | id, usuario_id, tipo (Visa/Mastercard/QR), token (nunca el número plano, por PCI DSS), alias |
| **EmpresaServicio** | id, slug, nombre, categoria, logo, api_endpoint, formato_credencial |
| **CredencialUsuarioEmpresa** | id, usuario_id, empresa_id, credencial_encriptada (número de contrato / medidor / NIT / etc.) |
| **Factura** | id, credencial_id, mes, monto, fecha_vencimiento, estado (pendiente/pagada) |
| **Transaccion** | id, usuario_id, factura_id, cuenta_pago_id, monto, estado, procesador_ref, timestamp |
| **Sesion / Conversacion WhatsApp** | wamid, teléfono, estado del menú, contexto actual |

Notar el paralelo con nuestro `trafico_clientes` / `mensajes` / `resumenes_atencion`: mismo patrón (contexto de conversación + estado + persistencia), pero orientado a transacción en vez de handoff.

---

## 8. Stack técnico (inferido)

Solo se puede inferir de comportamiento externo:

| Capa | Observación |
|---|---|
| **Bot engine** | WhatsApp Business Cloud API oficial (implícito por sello Meta Business Partner) |
| **Backend** | No visible desde fuera — probablemente Node.js, Python o Go |
| **Web app** | SPA (el HTML de landing es estático pero al navegar a rutas internas no se cargan páginas nuevas) — probablemente React/Vue/Next |
| **Autenticación** | OAuth (Google, Facebook, WhatsApp) + email/pass propio |
| **Procesador de pagos** | Terceros (no revelado) — típicamente BISA Pagos, Tigo Money, o similar |
| **Compliance** | PCI DSS certificado — implica tokenización de tarjetas, no almacenamiento plano |

---

## 9. Modelo de negocio

Del Art. 7 de Términos:
> *"Luka se reserva el derecho, a nuestra completa discreción, de cobrar tarifas de servicio bajo un modelo de suscripción y/o cobranza efectiva o transacción."*

Actualmente **gratis para el usuario final**. Ingresos probables:
1. **Fee por transacción** cobrado a la Empresa de Servicios (comisión B2B por cada factura cobrada vía Luka).
2. **Fee al usuario** (futuro, no activo).
3. **Publicidad / product placement** en el menú del bot.
4. **Data / analytics** vendidos a las Empresas de Servicios (métricas de recaudación, comportamiento).

---

## 10. Aliados / ecosistema

Del texto legal:
- **"Empresas aliadas"** para procesar pagos (BISA Pagos u otro)
- **"Empresas de Servicios"** = los 57 destinatarios que reciben el pago
- **Meta** (sello Business Partner)
- **Facebook / Google / WhatsApp** (proveedores OAuth)
- **Procesador PCI DSS** (probablemente el mismo aliado bancario)

---

## 11. Skeleton visual (árbol de la app)

```
Luka.bo
│
├── Marca / Corporativo
│   ├── Luka Pay, Inc.  (holding legal)
│   └── LPAYINC Servicios Digitales S.A.  (operador Bolivia)
│
├── Canales
│   ├── WhatsApp Bot  (+591 7777 5677)
│   │   └── Trigger: "Menú"
│   ├── Web app  (luka.bo)
│   └── Aplicación móvil web
│
├── Módulos funcionales
│   ├── Auth
│   │   ├── WhatsApp OAuth
│   │   ├── Google OAuth
│   │   ├── Facebook OAuth
│   │   ├── Email + password
│   │   └── PIN
│   ├── Onboarding
│   │   ├── Verificación edad (18+)
│   │   ├── Datos personales
│   │   └── Aceptación T&C
│   ├── Vault credenciales
│   │   ├── Credenciales por Empresa de Servicios
│   │   └── Tarjetas / QR (tokenizadas PCI DSS)
│   ├── Consulta de factura
│   │   ├── Scraper / API por empresa
│   │   ├── Extracción monto pendiente
│   │   └── Visualización al usuario
│   ├── Pago
│   │   ├── Confirmación
│   │   ├── Cargo por procesador aliado
│   │   └── Comprobante
│   └── Historial / Notificaciones
│
├── Verticales (57 empresas en 8 categorías)
│   ├── TV & Telecom (5)
│   ├── Servicios básicos (21) ← MAYOR PESO
│   ├── Seguros (8)
│   ├── Educación (10)
│   ├── Ventas directas (3) ← Yanbal, Tupperware, Azzorti
│   ├── Créditos y bienes raíces (7)
│   ├── Parqueo municipal (2)
│   └── Comercios (1)
│
├── Compliance
│   ├── Meta Business Partner
│   ├── PCI DSS
│   ├── Términos y Condiciones (10+ secciones)
│   └── Política de eliminación de datos (art. 2.1)
│
└── Ecosistema
    ├── Empresas de Servicios  (los 57 comercios/instituciones)
    ├── Procesador de pagos aliado  (tercero)
    ├── Meta / WhatsApp / Facebook  (canal e identidad)
    └── Bancos / redes de tarjetas  (Visa, Master, QR)
```

---

## 12. Comparación cruda con Cecilia Tedin Bot

| Dimensión | Luka.bo | Cecilia Tedin Bot |
|---|---|---|
| **Naturaleza** | Transaccional (pago) | Conversacional + handoff |
| **Objetivo del bot** | Cerrar el pago sin intervención humana | Enganchar y **pasar a asesora humana** |
| **Persona humana en el loop** | Ninguna | Central (la asesora es el corazón del V1) |
| **Verticales** | 8 categorías, 57 empresas | 1 marca (Cecilia Tedin) |
| **Modelo de datos** | Credenciales + tarjetas + facturas | Tráfico + mensajes + resumen para atención |
| **Login de usuario final** | Sí (persiste métodos de pago) | No (Cecilia no necesita) |
| **Login administrativo** | Sí (para el propio equipo Luka) | Sí (asesora al dashboard) |
| **Palabra clave WhatsApp** | "Menú" | "1"..."7" (opciones directas) |
| **Estados del bot** | Presumiblemente muchos (autenticado, consultando, confirmando, pagando) | 4 (ORGANIC, MENU, CATALOG, PAUSED_HUMAN) |
| **Regulación** | PCI DSS + Meta Business Partner | Ninguna todavía |
| **Procesador de pagos** | Tercero aliado | N/A (no procesa pagos) |
| **Compliance de datos** | T&C extensos, política eliminación 48h | T&C inexistente por ahora |
| **Cobertura geográfica** | Bolivia entera | Ciudad de Cecilia (Santa Cruz, inferido) |
| **Escalabilidad prevista** | Nacional | Local + expansión orgánica |
| **Stack** | Cloud (probable AWS/GCP) + Postgres/MySQL + Redis + Kafka | Node + Postgres (Neon) + Express + SSE |

---

## 13. Qué copiaríamos de Luka (ideas concretas)

**Copiables para V2/V3:**

1. **Wa.me con `?text=Menú`** — ya lo tenemos, valida el patrón.
2. **OAuth con Google/Facebook para el dashboard de asesora** — más seguro que password compartido.
3. **Política de eliminación de datos de 48h** — protección legal barata y correcta.
4. **T&C mínimo** — antes de escalar tenemos que tener uno.
5. **Tokenización de datos sensibles** — si algún día procesamos seña / pago.
6. **Estructura legal doble** (holding + operador local) — si Cecilia crece a franquicia.

**NO copiar:**

1. Login de usuario final con contraseña. En Cecilia la clienta no debe hacer login, la fricción mata la conversión.
2. Grid de categorías. Cecilia es marca única, no marketplace.
3. Vault de credenciales de terceros. Cecilia no necesita almacenar credenciales de nadie.
4. PCI DSS por ahora. Es un compromiso de años. Solo si empezamos a cobrar en la app.

---

## 14. Alerta útil

**Luka tiene la vertical "Ventas directas" con Yanbal, Tupperware, Azzorti**, y NO tiene una marca de indumentaria femenina. Si Cecilia crece, existe la posibilidad concreta de **integrarse a Luka como una de sus empresas** en la vertical Ventas Directas — permitiría a las clientas pagar Cecilia directo desde WhatsApp con la infraestructura de Luka.

Contacto para explorar: `soporte@luka.bo` — pero solo cuando Cecilia tenga volumen (>200 ventas/mes probablemente).

---

## 15. Última actualización

- **2026-09-21** — Documento creado por Claude tras exploración pública de luka.bo. Datos snapshot.
