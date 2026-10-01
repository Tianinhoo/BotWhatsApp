# BRIEF-010 — Fase 0: conexión supervisada y prueba del recorrido
<!-- [ByCodex] 2026-10-01: reemplaza instrucciones contradictorias sobre HMAC. -->
- **Dueño:** Humano, con soporte Codex.
- **Estado:** EN PREPARACIÓN; prueba real pendiente.
- **Prioridad:** P0.5.
- **Creado:** 2026-09-19.
- **Actualizado:** 2026-10-01.

## Dos etapas con aceptación distinta

**A. Conexión supervisada con el número del responsable.** Puede adelantarse a
la ronda 2. Sirve para verificar recepción firmada, respuesta, imágenes y handoff;
no acredita recuperación, disponibilidad ni preparación para clientes reales.

**B. Recorrido con 3–5 testers coordinados.** Requiere la recepción recuperable
(027), todos los mensajes del evento (028), lectura de estado sin fallback ante
error (029) y límite efectivo en los envíos (parte mínima de 030), además de 026.
Registrar límites de media (031) y apagado (032). BRIEF-025 es una mejora posterior;
no bloquea esta prueba. Un fallo conocido no queda descartado porque no aparezca
durante la sesión. No se exige un número artificial de hallazgos para aprobar.

## Preparación

- Trabajo consolidado y respaldado; suite en Node 22.
- Completar APP_SECRET real de Meta en el .env local (nunca pegarlo en una bitácora,
  chat o commit). No compartir WHATSAPP_TOKEN ni DATABASE_URL.
- Para esta sesión, establecer NODE_ENV=production.
- Comprobar PHONE_NUMBER_ID, WHATSAPP_TOKEN, VERIFY_TOKEN, GRAPH_API_VERSION
  e IDs de imágenes. Su presencia no verifica validez ni permisos.
- Verificar conexión PostgreSQL y migraciones aplicadas. Revisar las pendientes
  antes de ejecutarlas; no aplicar cambios a ciegas.
- Comprobar /health con db=up.
- Levantar una sola instancia Node. Sin workers ni instancias solapadas.

**HMAC es obligatorio desde la primera prueba con un túnel público.**
Una URL aleatoria no reemplaza la validación de firmas. En el código actual,
sin APP_SECRET y con NODE_ENV=production el proceso rechaza el arranque.
En otros entornos no exceptuados, el middleware rechaza el webhook con 500.

## Conexión de prueba

1. En una terminal PowerShell: establecer $env:NODE_ENV = 'production' y ejecutar
   npm start. Confirmar el puerto real.
2. En otra terminal: cloudflared tunnel --url http://localhost:3001
   (ajustar al puerto real; instalar Cloudflared solo si falta).
3. En Meta configurar la callback URL del túnel con /webhook. El token de
   verificación es el valor local de VERIFY_TOKEN; no copiarlo a documentación.
4. Confirmar la suscripción al campo messages de la cuenta/número correcto.
5. Desde el número del responsable, mandar hola y recorrer catálogo y opción 6.
6. Confirmar recepción en dashboard, resumen, estado PAUSED_HUMAN y silencio
   del bot ante un mensaje posterior. La asesora debe poder reactivar el bot.
7. Anotar resultados reales, hora y evidencia sin contenido privado ni credenciales.

No enviar mensajes a clientes ni campañas durante esta sesión.
Si falta APP_SECRET, acceso a Meta, conexión BD o el número de prueba, registrar
el bloqueo y continuar las comprobaciones locales. No simular un resultado exitoso.

## Etapa B: escenarios

- Saludo, menú, catálogo, precios por confirmar, handoff y reactivación.
- Mensajes rápidos del mismo teléfono y de varios teléfonos.
- Múltiples entries/changes/messages en un webhook firmado de prueba.
- Duplicados del mismo wamid.
- Fallo de lectura de estado: no responde ni altera el estado.
- Fallo de recepción en BD: no confirmar algo que no se guardó.
- Fallo o espera larga de Meta: envío acotado, sin reintentos ciegos.
- Audio, imagen y sticker: registrar comportamiento y límites.
- Reinicio antes/después de persistir: comprobar recuperación y casos inciertos.

Los fallos de infraestructura pueden necesitar inyección controlada con transporte
simulado; los testers no sustituyen esas regresiones.

## Resultados reales

| Etapa / escenario | Esperado | Observado | Evidencia | Pendiente |
|---|---|---|---|---|
| A — conexión Meta | Mensaje firmado recibido y respondido | No ejecutado | — | APP_SECRET y configuración Meta |
| B — recorrido | Todos los escenarios registrados | No ejecutado | 027/028/029/C1 verificados localmente y BD | Etapa A y testers |

## Cierre de sesión

Desconectar o actualizar el webhook de prueba cuando se cierre el túnel.
Parar bot y túnel y registrar cualquier envío en curso; hasta 032 no hay garantía
de drenaje ordenado. No considerar la prueba un despliegue productivo.

## Bitácora

- 2026-09-19 — Brief original creado por Claude.
- 2026-09-20 — Revisión agregó requisitos HMAC, pero quedaron notas antiguas
  contradictorias al final.
- 2026-10-01 — Codex unifica requisitos, separa conexión A de recorrido B y
  retira el token literal. No se ejecutó todavía una prueba WhatsApp real.

## Preparación verificada — [ByCodex] 2026-10-01
Node 22.23.3, 176 pruebas con PostgreSQL aprobadas, ninguna omitida. Migración 009 aplicada.
Comprobación: node scripts/preflight.js (usar Node 22 y NODE_ENV=production).
Estado actual: falta APP_SECRET; credenciales Meta presentes pero no validadas.
Revisión de casos inciertos: node scripts/inbox-review.js. No hay bandeja visual todavía.
