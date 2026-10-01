# BRIEF-013 — Atribución publicitaria: origen inicial vs interacción posterior

- **Dueño:** Claude
- **Estado:** HECHO
- **Prioridad:** P0 pre-Railway (bloquea BRIEF-007)
- **Creado:** 2026-09-20
- **Cerrado:** 2026-09-20
- **Depende de:** ninguna

## Objetivo

Que el "origen" de un cliente que llegó desde un anuncio de Meta NO se
pierda cuando ese cliente sigue conversando y los mensajes posteriores
no traigan `referral`.

## Contexto

`src/services/state.service.js:198-208` — `registerTraffic` hace
`ON CONFLICT DO UPDATE SET origen = EXCLUDED.origen`. Como solo el
primer mensaje del cliente trae `referral` en el webhook, cada mensaje
posterior sobrescribe:
- `origen = "organico"`
- `source_type = source_id = headline = body = source_url = first_referral_id = NULL`

Perdiendo toda la trazabilidad del anuncio original.

Se manifiesta solo cuando hay tráfico real de anuncios de Meta, por eso
no bloquea Fase 0 con testers amigos (sin anuncios). Sí bloquea el
deploy a producción (BRIEF-007).

## Alcance propuesto

Dos alternativas — decidir al arrancar:

**A) Fix conservador en el mismo esquema (recomiendo esto).**

Cambiar el `ON CONFLICT` para:
- `origen` se sobrescribe solo si el nuevo valor es `"anuncio"` (upgrade siempre gana; nunca downgradear a `"organico"`).
- Todos los campos del referral se sobrescriben solo si el nuevo valor no es NULL (usar `COALESCE`).

Nueva migración `008_trafico_conflict_fix.sql` (o incluirlo en el fix como código, no SQL) — realmente el fix es de código JS, no de esquema.

**B) Rediseño estructural: separar `origen_inicial` de `ultima_interaccion`.**

Agregar columnas nuevas en `trafico_clientes` para preservar "cómo entró"
separado de "cómo interactuó última vez". Es más limpio semánticamente y
soporta futuros casos (cliente que primero llegó orgánico y después hizo
click en un anuncio). Costo: migración + más código.

Recomiendo A para V1 y anotar B como refactor para V1.1 (cuando ya
tengamos datos y sepamos si el downgrade es un caso real que ocurre).

## Aceptación

- [ ] Un cliente que hace click en un anuncio y después manda 3 mensajes normales conserva `origen = "anuncio"` y su `first_referral_id` original.
- [ ] Un cliente 100% orgánico conserva `origen = "organico"`.
- [ ] Un cliente orgánico que después clickea un anuncio (raro pero posible) queda como `origen = "anuncio"` con los detalles del referral.
- [ ] Test unitario que cubre las 3 combinaciones.
- [ ] Firma `// [ByClaude] (BRIEF-013)`.

## Notas técnicas

SQL sugerido para opción A (el fix vive dentro del propio `registerTraffic`,
o en una nueva migración si queremos que la BD imponga la regla):

```sql
DO UPDATE SET
  origen = CASE
    WHEN EXCLUDED.origen = 'anuncio' THEN 'anuncio'
    ELSE trafico_clientes.origen
  END,
  source_type       = COALESCE(EXCLUDED.source_type,       trafico_clientes.source_type),
  source_id         = COALESCE(EXCLUDED.source_id,         trafico_clientes.source_id),
  source_url        = COALESCE(EXCLUDED.source_url,        trafico_clientes.source_url),
  headline          = COALESCE(EXCLUDED.headline,          trafico_clientes.headline),
  body              = COALESCE(EXCLUDED.body,              trafico_clientes.body),
  first_referral_id = COALESCE(EXCLUDED.first_referral_id, trafico_clientes.first_referral_id),
  updated_at = now()
```

## Bloqueos

(Vacío por ahora.)

## Bitácora del brief

- 2026-09-20 — Brief creado por Claude.
- 2026-09-20 — Claude cerró el brief con la opción A (fix conservador dentro del propio `ON CONFLICT`, sin cambio de esquema). `origen` usa `CASE WHEN EXCLUDED.origen = 'anuncio' THEN 'anuncio' ELSE trafico_clientes.origen END`; los campos del referral con `COALESCE(EXCLUDED.X, trafico_clientes.X)`. Se agregó `tests/atribucion.test.js` con 3 escenarios de integración (anuncio→orgánico, orgánico→anuncio, orgánico repetido). Los tests requieren `DEDUP_TEST_DATABASE=1` para correr, quedan SKIP por defecto. La opción B (separar `origen_inicial` de `ultima_interaccion`) queda anotada como posible refactor V1.1 si aparece un caso de negocio que la justifique.
