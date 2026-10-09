# Plan para cerrar la primera versión operativa

<!-- [ByCodex] Plan solicitado por el usuario el 2026-10-01. -->

## Resultado que se busca

Una clienta entra por WhatsApp, consulta el catálogo, elige una prenda,
recibe información confirmada y llega a una asesora con el contexto conservado.
El bot funciona en un servidor, su código está respaldado y la persona responsable
sabe detectar y atender conversaciones que requieren intervención.

La estimación actual es 70% avanzado y 30% pendiente. Los puntos siguientes son
pesos de planificación del proyecto total, no una medición de horas ni una garantía
de avance lineal. Un bloque se cierra con evidencia de aceptación.

| Entrega | Peso pendiente | Responsable propuesto | Dependencias |
|---|---:|---|---|
| 1. Conexión WhatsApp supervisada | 5 puntos | Usuario + desarrollo | Acceso a Meta, APP_SECRET y número de prueba |
| 2. Datos comerciales confirmados | 5 puntos | Negocio + desarrollo | Validación de productos y condiciones |
| 3. Selección persistente de prenda | 10 puntos | Un responsable de desarrollo | BRIEF-026 cerrado; datos para validar las respuestas |
| 4. Prueba del recorrido y correcciones | 5 puntos | Desarrollo + asesora + 3–5 testers | Entregas 1, 2 y 3 |
| 5. Respaldo, despliegue y operación | 5 puntos | Desarrollo + usuario | Prueba aprobada; accesos a GitHub y hosting |
| **Total pendiente estimado** | **30 puntos** | | |

## Estado de partida verificado

- Dashboard local accesible, login y consultas de lectura verificados.
- Recepción durable y migración 009 aplicadas; cola por teléfono y deduplicación.
- Detención ante fallo de lectura del estado y cancelación de envíos a los 8s.
- Claude agregó atención de medios por derivación y cierre controlado del proceso.
- Suite actual en Node 22.23.3: 193 casos, 186 aprobados, 0 fallidos, 7 omitidos
  por ser integraciones PostgreSQL optativas. La entrega anterior pasó 176/176
  con PostgreSQL; falta repetir la integración sobre el código final del recorrido.
- APP_SECRET sigue ausente; primera conversación real pendiente.
- Commits locales existentes. Último intento de push autorizado: Repository not found.
- Datos generales del negocio aún sin confirmar; selección de prenda pendiente.

## 1. Conectar WhatsApp con el número del responsable

1. Cargar APP_SECRET en el entorno local sin copiar credenciales al chat ni a Git.
2. Ejecutar preflight con Node 22 y NODE_ENV=production; comprobar BD y migraciones.
3. Configurar el túnel y webhook firmado para la cuenta/número de prueba correctos.
4. Verificar token, suscripción y permisos mediante una conversación real.
5. Recorrer saludo, catálogo, opción 6, resumen, silencio del bot y reactivación.
6. Registrar resultados y errores sin guardar credenciales o datos privados en logs.

**Aceptación:** mensaje real recibido y respondido, imágenes visibles en el teléfono,
derivación visible en el dashboard y ninguna respuesta automática durante PAUSED_HUMAN.
Una firma inválida debe rechazarse. Si falla un paso, la conexión no se considera cerrada.

**Alcance de la sesión:** número del responsable, sin campañas ni clientes comerciales.
Se coordina previamente cualquier invitación o mensaje a testers.

## 2. Preparar la información comercial

El negocio entrega una ficha por producto: nombre, foto/modelo, precio confirmado,
variaciones de talla/color y disponibilidad. También confirma horarios, cobertura,
plazos de envío, dirección si aplica y qué asesora atenderá cada horario.

Desarrollo revisa el catálogo real de la BD y carga únicamente datos confirmados.
Se resuelve individualmente cada precio/stock cero: puede ser legítimo o un valor
de carga inicial. No convertir ceros masivamente ni presentar datos desconocidos
como gratis o agotados. El esquema y la lógica deben distinguir confirmado de desconocido.

**Aceptación:** cada dato publicado tiene validación del negocio y cualquier
desconocido se muestra como por confirmar. La asesora sabe qué debe confirmar.
La ficha de productos coincide con las imágenes que se enviaron en la entrega 1.

**No requiere esperar a Meta:** la recopilación y revisión pueden empezar de inmediato.

## 3. Completar el recorrido de selección — BRIEF-025

Recorrido objetivo:

Catálogo → ¿Qué prenda te interesa? → selección → confirmación →
precio/tallas o disponibilidad → asesora con prenda seleccionada en el resumen.

1. Presentar opciones de prendas después del catálogo, con salida directa a asesora.
2. Guardar producto_id y la lista realmente mostrada; resolver números según el paso.
3. Confirmar la selección y conservarla al volver al menú o consultar envíos.
4. Permitir cambiar de prenda explícitamente.
5. Consultar precio/tallas/disponibilidad de esa prenda, respetando datos confirmados.
6. Incorporar la selección al resumen que ya muestra el dashboard.
7. Limpiar la selección al reactivar después de atención humana, según el brief.
8. Verificar fallo de envío, producto retirado, id ajeno a la lista, duplicado,
   reinicio, mensajes rápidos y derivación mientras se muestra el catálogo.

**Aceptación:** elegir la segunda opción no supone producto_id=2; menú conserva
la prenda; cambiarla actualiza el contexto; la asesora recibe la selección correcta.
Ningún precio o stock no confirmado se publica como un hecho.

**Preparación técnica:** revisar y sincronizar BRIEF-025 antes de editar código.
Las referencias antiguas a migración 008 y a bloquear la primera conexión quedaron
desactualizadas. Las propuestas actuales son 010/011, sujetas al máximo existente.
Conservar migraciones aplicadas. Completar pruebas Node 22 y PostgreSQL después
de integrar cambios, no solo pruebas de funciones aisladas.

La talla/color se consultan como datos del producto; añadir un asistente separado
para elegir variantes requeriría definirlo expresamente. No prometer interpretación
general de texto libre en esta entrega.

## 4. Validar con personas

Primero repetir el recorrido completo con el responsable y la asesora. Después,
coordinar 3–5 testers e incluir entrada orgánica y desde anuncio si está disponible.

Escenarios mínimos:
- Consultar, elegir, cambiar prenda y volver al menú conservando contexto.
- Consultar datos pendientes de confirmación.
- Derivar y reactivar; comprobar resumen y silencio durante la pausa humana.
- Enviar audio/foto y comprobar la derivación y acceso real de la asesora al medio.
- Mandar mensajes rápidos del mismo teléfono y de varios teléfonos.
- Verificar duplicados, fallo de BD y envío incierto con regresiones controladas.
- Reiniciar con trabajo pendiente y comprobar recuperación/revisión.
- Listar y resolver un caso sintético de revisión con el procedimiento operativo.

Registrar por escenario: esperado, observado, evidencia, gravedad y acción.
No se exige encontrar una cantidad mínima de errores ni se acepta una falla conocida
solo porque no apareció durante una sesión.

**Aceptación:** recorridos críticos aprobados; sin pérdida de mensajes, mezcla de
clientes, duplicación automática ni respuestas del bot durante atención humana.
La asesora puede continuar sin volver a preguntar qué prenda eligió la clienta.
Errores que impidan atender se corrigen antes del lanzamiento; detalles menores
quedan en una lista explícita con responsable.

## 5. Publicar y dejar una operación repetible

La resolución de acceso a GitHub empieza ahora, en paralelo a las entregas anteriores.
Confirmar URL/propiedad/permisos antes de reintentar el push. Si cambia el destino,
confirmarlo con el usuario. Verificar el commit remoto y excluir secretos/datos locales.

Después de aprobar la prueba:
1. Preparar configuración del hosting y presupuesto aprobado por el usuario.
2. Revisar instrucciones actuales del proveedor antes de ejecutar el despliegue;
   los precios y pantallas de documentos históricos no se toman como vigentes.
3. Configurar Node 22, secretos, migraciones, HTTPS y webhook de producción.
4. Mantener una sola instancia; evitar solapamiento de procesos durante deploys.
5. Repetir el recorrido crítico desde un teléfono y comprobar /health y logs.
6. Probar reinicio/recuperación y documentar reversión al commit anterior compatible.
7. Entregar a la asesora una guía breve: conversaciones, respuestas, pausa,
   reactivación y casos inciertos. La revisión usa scripts/inbox-review.js mientras
   no exista bandeja visual; nunca reenviar un caso incierto sin verificarlo.
8. Definir responsable de revisar salud, errores y casos pendientes durante la atención.

**Aceptación:** el bot atiende sin la PC local encendida, repositorio remoto verificado,
recorrido real aprobado, responsable operativo definido y guía de recuperación disponible.

## Orden práctico para no bloquearse

- Usuario/negocio: accesos Meta/GitHub y ficha comercial desde el comienzo.
- Desarrollo: siguiente trabajo de código es BRIEF-025; puede avanzar con
  fixtures explícitos de prueba mientras llegan datos, sin publicarlos al cliente.
- Ejecutar la primera conexión en cuanto Meta esté listo; no esperar a terminar 025.
- Hacer la prueba del recorrido completo cuando conexión, datos y selección estén listos.
- Desplegar después de cerrar fallos críticos de esa prueba.

Un responsable técnico integra secuencialmente y actualiza briefs, tablero y bitácora.
Este documento es un plan; no asigna trabajo a otros agentes ni inicia pruebas externas.

## Criterio de cierre de V1

Las cinco entregas aceptadas, evidencia enlazada, suite final Node 22/PostgreSQL
aprobada, prueba WhatsApp aprobada y servicio operable por la asesora. El 100%
significa alcance de V1 aceptado; no ausencia permanente de errores.

La bandeja visual de incidencias, métricas de conversión, descarga de medios y
evaluación del circuit breaker quedan en una evolución posterior, salvo que la
prueba demuestre que alguna es imprescindible para operar. Mantener el árbol
determinista acordado y evitar ampliar funciones antes de cerrar estas entregas.

No se promete una fecha calendario sin accesos, datos y resultados de la primera
conexión. Al cerrar esa conexión y revisar BRIEF-025 se podrá estimar trabajo restante
con menos incertidumbre, separando desarrollo de esperas externas.
