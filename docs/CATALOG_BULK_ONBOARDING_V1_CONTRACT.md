# CATALOG_BULK_ONBOARDING_V1 — Contrato congelado

**Oleada:** CATALOG_BULK_ONBOARDING_V1 + PUBLIC SOURCE COMPATIBILITY FIX V1
**Fecha:** 2026-06-10
**Rama:** `feature/catalog-bulk-onboarding-v1` (base `origin/main = 26f3fca`)
**Estado:** Congelado por agent-orchestrator

---

## 1. Objetivo

Crear un centro de incorporación de catálogo que permita poblar recursos y
precios sin transcripción manual repetitiva. La creación individual de
recursos queda únicamente como excepción. Adicionalmente, corregir la
incompatibilidad de la validación web de precios con páginas comerciales
legítimas mayores a 512KB (caso real: Decorcerámica).

Flujo principal:

```text
Catálogo
→ Importar catálogo (/catalog/import)
→ subir Excel o CSV
→ mapear columnas
→ previsualizar
→ detectar errores y duplicados
→ confirmar lote
→ crear únicamente recursos nuevos
→ generar reporte
```

---

## 2. Formatos aceptados

| Formato | Extensión | Parser |
|---|---|---|
| Excel moderno | `.xlsx` | SheetJS (`xlsx`, ya aprobado) |
| Excel legado | `.xls` | SheetJS |
| CSV | `.csv` | SheetJS |

Límites V1 (server-side, no negociables):

- Tamaño máximo de archivo: **10 MB** (`bodySizeLimit` del transporte: 12 MB).
- Máximo **5.000 filas de datos** por archivo.
- Validación de extensión y contenido server-side.
- SheetJS se invoca con `cellFormula: false, cellHTML: false`: lee valores
  cacheados, **NUNCA evalúa fórmulas ni ejecuta macros**.
- Errores sanitizados (sin stack, sin SQL, sin volcado de filas completas).
- Ningún dato derivado del navegador se confía: preview y confirmación
  re-parsean el archivo server-side con digest SHA-256 de integridad
  (mismo patrón que la importación BOQ 4C.1).

NO se aceptan PDF, DOCX ni imágenes (ver §11 deudas).

---

## 3. Mapeo de columnas

El archivo NO necesita encabezados exactos. El sistema propone un mapeo
automático por sinónimos y la usuaria puede corregirlo (columna del archivo →
campo del sistema) antes del preview.

### Campos del sistema — importación de recursos

| Campo | Obligatorio | Destino |
|---|---|---|
| `code` | ✅ | `resources.code` |
| `name` | ✅ | `resources.name` |
| `resourceType` | ✅ | `resources.resource_type` (acepta sinónimos es/en) |
| `unit` | ✅ | `resources.unit` |
| `description` | — | `resources.description` (columna nueva) |
| `category` | — | `resources.category` (columna nueva) |
| `brand` | — | `resources.brand` (columna nueva) |
| `externalReference` | — | `resources.external_reference` (columna nueva) |
| `externalSku` | — | `resources.external_sku` (columna nueva) |
| `defaultWastePct` | — | `resources.default_waste_pct` |
| `providerName` | — | match contra `suppliers.name` (exacto, case-insensitive) |
| `sourceUrl` | — | `resource_price_observations.source_reference` |
| `observedPrice` | — | `resource_price_observations.observed_price` |
| `discountPercent` | — | `resource_price_observations.discount_percent` |
| `currency` | — | `resource_price_observations.currency` (default COP) |
| `validUntil` | — | `resource_price_observations.valid_until` |
| `notes` | — | `resource_price_observations.notes` |

Presets de mapeo: **diferidos** (no existe hoy una forma segura y pequeña de
persistirlos sin ampliar el alcance). El mapeo automático por sinónimos cubre
el caso común. Deuda: `COLUMN_MAPPING_PRESETS`.

---

## 4. Preview (Paso A — sin escritura)

Muestra: total de filas, nuevas, existentes (skip), duplicados internos,
inválidas, omitidas y observaciones de precio pendientes a crear.

Validaciones por fila:

- código vacío → inválida
- nombre vacío → inválida
- `resourceType` inválido (tras normalizar sinónimos) → inválida
- unidad vacía → inválida; unidad no reconocida → **advertencia** (no bloquea)
- precio inválido (no numérico o negativo) → el recurso puede importarse,
  la observación se rechaza y se reporta
- descuento inválido (fuera de 0–100) → observación rechazada y reportada
- duplicado dentro del archivo (mismo `code`) → primera ocurrencia válida,
  repeticiones reportadas como `duplicate_in_file` (skip)
- código ya existente en la organización → `skip_existing` con reporte
- `externalSku`/`externalReference` repetida dentro del archivo → advertencia

Regla estricta: **NO se sobrescriben recursos existentes, nunca, bajo ninguna
condición**. Solo se crean recursos nuevos.

---

## 5. Confirmación (Paso B — batch server-side)

- Re-parse server-side + digest SHA-256: si el archivo cambió respecto al
  preview, la confirmación se bloquea (`digest_mismatch`).
- Solo roles `management | internal` con `APP_AUTH_MODE=supabase` +
  `READ_MODEL_SOURCE=db`.
- `organization_id` = viewer server-side. `created_by` = viewer server-side.
- Inserción por lotes (chunks) vía cliente RLS-bound. **Sin service-role.**
- Carrera con otro import: violación de unicidad (23505) ⇒ fila degradada a
  `skip_existing`, nunca error fatal del lote.
- Precio válido asociado ⇒ se crea `resource_price_observations` con
  `status='pending'`, `source_type='supplier_csv'` (o `manual` si no hay
  proveedor/URL). NUNCA `approved`. NUNCA modifica BOQ, AIU ni exports.
- Resultado: reporte por fila (creada / skip / inválida / observación
  creada / observación rechazada) + CSV descargable sanitizado.

### Sanitización CSV (reportes descargables)

Toda celda que comience con `=`, `+`, `-`, `@`, TAB o CR se prefija con `'`
para neutralizar CSV formula injection. Aplica a TODOS los reportes
descargables de esta oleada.

---

## 6. Importación de lista de precios de proveedor

Ruta: `/catalog/providers/import` (CTA "Importar lista de precios" en
`/catalog/providers`). Selección de proveedor existente obligatoria.

Campos mapeables: `externalReference`, `externalSku`, `description`, `unit`,
`observedPrice`, `discountPercent`, `currency`, `sourceUrl`, `observedAt`,
`validUntil`, `notes`.

### Matching V1 (en orden, primera coincidencia gana)

1. `externalSku` exacto contra `resources.external_sku`
2. `externalReference` exacta contra `resources.external_reference`
3. `code` exacto contra `resources.code` (si la columna viene en el archivo)
4. Sin match → fila "**Sin asociar**": NO se crea recurso automáticamente,
   NO se crea observación; se reporta y es exportable como CSV sanitizado.

Coincidencia ambigua (mismo SKU/referencia en >1 recurso) → fila "Sin
asociar" con motivo `ambiguous_match` (revisión humana requerida).

Reglas: cada precio importado crea una observación `pending`
(`source_type='supplier_csv'`, `supplier_id` = proveedor seleccionado).
Nunca `approved`. Nunca modifica BOQ, AIU ni exports. El trigger DB
`set_rpo_suggested_net_price` conserva el invariante del precio neto.

---

## 7. BOQ → catálogo asistido — DIFERIDO (deuda)

**Decisión: NO implementar en esta oleada.** El parser BOQ existente
(`server/estimates/import/parse.ts`) expone exclusivamente ítems de
presupuesto: `chapterCode, code, description, unit, quantity, unitPrice`.
Son **actividades compuestas** (p. ej. "Instalación piso porcelanato"),
no recursos de catálogo.

Campos faltantes para un bootstrap confiable:

- `resourceType` (el BOQ no distingue material/mano de obra/equipo)
- desglose de insumos por APU (`apu_template_id` es nullable y los ítems
  importados/manuales no traen componentes)
- código de catálogo (el `code` del BOQ es numeración de presupuesto 1.1, 2.3)
- `brand`/`externalReference`/`externalSku`
- precio unitario de insumo (el `unitPrice` del BOQ es precio de actividad
  compuesta con desperdicio/mano de obra embebidos)

Inventar recursos desde actividades violaría la regla de una sola fuente de
verdad. Deuda registrada: **`BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP`** — requiere
fundación de clasificación de componentes (relacionada con la deuda
`COST_TYPE_BREAKDOWN_FOUNDATION`).

---

## 8. Compatibilidad con páginas web grandes (PUBLIC SOURCE COMPATIBILITY FIX V1)

Problema: `fetch-public-page.ts` rechazaba >512KB antes de extraer.
Evidencia real (2026-06-10): la URL autorizada de Decorcerámica responde
HTTP 200, `text/html`, **1.295.123 bytes (~1,26 MB)**.

### Nuevos límites

| Parámetro | Valor | Razón |
|---|---|---|
| Hard cap | **3 MB** | Máximo autorizado V1; > hard cap ⇒ rechazo claro |
| Umbral de página pesada | 512 KB | >512KB ⇒ warning `heavy_page` |
| Early-stop | activo | Tras 512KB, si ya hay evidencia suficiente (precio + moneda extraíbles del prefijo), se cancela el stream con warning `truncated_early_stop` |
| Timeout | 10 s (sin cambio) | |
| Redirects | máx 5, manuales, SSRF validado por salto (sin cambio) | |
| Content-type guard | HTML/JSON (sin cambio) | |

Protecciones que NO cambian: SSRF (`validatePublicUrl` + DNS en cada hop),
loop detection, sanitización de errores, no crawling, no HTML al navegador.

`FetchedPage` gana `warnings: string[]` y `truncated: boolean`; el servicio
propaga esos warnings a la propuesta.

---

## 9. Adapter Decorcerámica V1

Hostname aislado: `decorceramica.com` (y subdominios). Registro de adapters
por hostname en `adapters/index.ts`; los genéricos siguen siendo el fallback
para cualquier otro dominio (sin cambios de comportamiento).

Justificación: el JSON-LD real usa `AggregateOffer` con ofertas anidadas; el
extractor genérico no lo entiende (no extrae precio). El adapter dedicado
extrae, SOLO con evidencia clara:

- `title` ← JSON-LD `Product.name` (fallback og:title)
- `externalReference` ← JSON-LD `mpn` (fallback meta `product:retailer_item_id`)
- `externalSku` ← meta `product:sku` (fallback JSON-LD `sku`)
- `observedPrice` ← Offer/AggregateOffer (ver regla de múltiples precios)
- `currency` ← `priceCurrency` (fallback meta `product:price:currency`)
- `unit` ← **NUNCA se infiere; siempre `null`** (no inventar)
- `sourceUrl`, `warnings`

Múltiples precios distintos (lowPrice ≠ highPrice u ofertas con precios
diferentes): NO se elige en silencio ⇒ warning explícito que lista los
precios detectados y explica cuál se propone (el menor). La propuesta sigue
siendo `pending` con revisión humana obligatoria.

Tolerancia: precio cambiante, promoción ausente, unidad no inferible, HTML
parcialmente cambiado ⇒ degradación a genéricos o `PriceMissingError`,
nunca crash ni datos inventados.

Tests con fixture HTML sanitizado local. **Sin red externa en tests.**

---

## 10. Seguridad (no negociable)

1. `organizationId` y `userId` SIEMPRE server-side.
2. RLS y tenant isolation intactos (cliente RLS-bound, sin service-role).
3. Validación de archivo server-side (extensión, tamaño, filas).
4. Sin fórmulas ni macros ejecutadas; HTML jamás interpretado como código.
5. CSV descargable sanitizado contra formula injection.
6. Recursos existentes nunca sobrescritos en silencio.
7. Precios importados siempre `pending`; aprobación humana separada.
8. URLs externas nunca modifican BOQ/AIU/exports.
9. Sin crawling, sin login externo, sin evasión anti-bot, sin headless browser.
10. Errores sanitizados en todas las superficies.

---

## 11. Fuera de alcance y deudas

| Deuda | Detalle |
|---|---|
| `DOCUMENT_LIST_IMPORT_V1` | PDF/DOCX/OCR: tablas irregulares, escaneos, riesgo de extracción incorrecta; requiere revisión humana específica. Sin botón placeholder. |
| `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` | Ver §7. Campos faltantes documentados. |
| `COLUMN_MAPPING_PRESETS` | Persistir presets de mapeo exige tabla nueva + RLS; diferido sin bloquear la importación. |

Fuera de alcance: actualización de recursos existentes vía import, aprobación
automática de precios, sincronización periódica (n8n), crawling de categorías.

---

## 12. Migración

`20260611090000_resources_import_metadata.sql` — **aditiva, local**:

```sql
ALTER TABLE resources
  ADD COLUMN description        text,
  ADD COLUMN category           text,
  ADD COLUMN brand              text,
  ADD COLUMN external_reference text,
  ADD COLUMN external_sku       text;
-- + índices parciales por org para matching de SKU/referencia
```

Sin tabla nueva ⇒ políticas RLS existentes de `resources` cubren las columnas.
**Sin `db push` remoto en esta oleada** (se aplica en pre-release).
