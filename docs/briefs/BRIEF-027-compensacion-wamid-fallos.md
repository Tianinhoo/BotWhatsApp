# BRIEF-027 — Recepción durable y recuperación conservadora
<!-- [ByCodex] 2026-10-01: reemplaza stub; no se reenvían fallos ciegamente. -->
- **Dueño:** Codex.
- **Estado:** HECHO local y BD verificada (2026-10-01); pendiente respaldo remoto.
- **Prioridad:** P0 para recorrido completo.
- **Creado:** 2026-09-30.
- **Migración reservada:** 009_recepcion_durable.sql.

## Contrato
- Persistir todo el lote en una transacción antes de HTTP 200. Fallo de recepción:
  HTTP 503 para permitir reentrega; sin identificador: HTTP 400.
- Unique wamid; un duplicado no reemplaza el contenido ni repite respuestas.
- Conservar la reserva legacy de mensajes_procesados; registros históricos sin
  payload no pueden recuperarse retroactivamente.
- Recepciones serializadas en una cola corta para conservar su orden en BD.
  Cada pipeline de procesamiento usa la cola por teléfono de 026; otros teléfonos
  avanzan en paralelo.
- Estados recibidos: recibido, procesando, completado, revision, resuelto.
- Recuperación periódica (5s) de mensajes nunca iniciados, por orden de id.
- Al reiniciar una única instancia, procesando pasa a revision: pudo enviar antes
  de caer. No se reenvía automáticamente. Tampoco tras timeout o fallo parcial.
- Un caso en revision bloquea mensajes posteriores de su teléfono; se conservan
  recibidos. No se mezclan respuestas en contextos inciertos.
- Más de 10 minutos sin comenzar: revision para evitar responder una consulta vieja.
- Revisión operativa con scripts/inbox-review.js; resolver significa que un humano
  atendió/verificó el caso. No reintenta el mensaje incierto. Tras resolver, la cola
  puede continuar; los sucesores viejos también requieren revisión.

## Límites explícitos
Una instancia Node. No coordina réplicas ni despliegues con procesos superpuestos.
No garantiza exactly-once contra Meta: la aceptación externa puede ser incierta.
El éxito del handler no verifica entrega al teléfono del cliente. Fallos secundarios
que el motor ya captura (p. ej. resumen) mantienen su política actual.
El dashboard aún no tiene una bandeja visual de revisión; usar el comando operativo.
No instalar cron ni circuit breaker para esta entrega. No modificar migraciones previas.

## Verificación
- Regresiones del módulo y webhook con almacenamiento/transporte simulados.
- Prueba PostgreSQL con tabla temporal: SQL real, transacción y dedup.
- Primera conexión BD agotó 5s; siguiente integración respondió: 8/8.
- 009 aplicada en la BD configurada; migraciones anteriores intactas.
- Suite completa Node 22.23.3 y DEDUP_TEST_DATABASE=1: **176 aprobadas, 0 fallidas, 0 omitidas**, 13338.1617 ms. Transporte WhatsApp simulado.
- Prueba temporal corregida para Neon con pool por transacción: BEGIN exterior
  y SAVEPOINT para cada recepción; ROLLBACK final. Se limpiaron exactamente
  dos registros sintéticos sql-a/sql-b que quedaron durante el primer intento.

## Despliegue
Aplicar 009 antes de arrancar esta versión. Sin tabla, no se confirma recepción y
se registra error. Mantener HMAC activo y una sola instancia; 032 seguirá definiendo
drenaje ordenado. Antes de reiniciar, comprobar que no haya envíos activos.
