# PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1 — Contrato

**Versión:** 1.0 (congelado)
**Fecha:** 2026-06-11
**Rama:** `feature/price-observation-review-center-v1` (base `origin/main = 9e03553`)
**Propiedad:** agent-orchestrator (diseño) · agent-pricing / agent-db-rls / agent-frontend-boq (implementación)

---

## 1. Objetivo

Convertir la aprobación recurso-por-recurso en una **revisión masiva segura**:

```text
Excel revisado manualmente / lista de proveedor / URL supervisada / monitor
→ observaciones pending (invariante 3A intacto)
→ Centro de Revisión (/catalog/prices/review)
→ selección explícita + confirmación + idempotencia + auditoría
→ baseline aprobado
→ el monitor compara fuentes web contra ese baseline
```

La importación **jamás aprueba**. La aprobación masiva **jamás es implícita**.

## 2. Resultado de la inspección (FASE 0)

| Soporte | Estado previo | Decisión |
|---|---|---|
| `resource_price_observations` | workflow pending→approved/rejected, RLS FORCE, append-only | Reutilizado sin cambios de invariantes |
| Digest SHA-256 | transitorio (integridad preview→confirm), no persistido | Se persiste en `price_observation_batches.digest_sha256` |
| `import_batch_id` | NO existía | Columna aditiva nullable + FK + trigger same-org |
| Idempotencia | patrón probado en `price_monitor_runs` (`UNIQUE (org, key)`) | Replicado en `price_observation_bulk_actions` |
| Aprobación | individual (3A) | Se añade servicio masivo; el individual queda intacto |

## 3. Política de origen (A/B/C/D)

| Origen | `source_type` | Lote | Bulk approval |
|---|---|---|---|
| A. Catálogo Excel revisado manualmente | `manual` | sí (`kind: catalog_import`) | ✅ con preview |
| B. Lista de precios de proveedor | `supplier_csv` | sí (`kind: price_list_import`) | ✅ con preview |
| C. URL pública supervisada | `public_web` | no | selección consciente (jamás auto) |
| D. Monitor automático | `public_web` + referenciada por `price_monitor_results.observation_id` | no | **nunca auto-approve**; destacada con badge «Monitor» y advertencia `monitor_origin`; selección explícita en el review center |

## 4. Esquema (migraciones aditivas, solo locales)

### `20260614090000_price_observation_batches_bulk_actions.sql`

- **`price_observation_batches`** — procedencia durable: `organization_id`,
  `source_type` (CHECK 7 valores de 3A), `source_reference`, `digest_sha256`
  (CHECK hex 64), `label`, `imported_by` (FK profiles RESTRICT), `imported_at`,
  `total_rows`, `metadata` JSONB. `pending/approved/rejected_count` se
  **calculan en lectura** (regla del proyecto: no almacenar estado derivado);
  `total_rows` es hecho inmutable del momento de importación.
- **`resource_price_observations.import_batch_id`** — uuid **nullable**, FK al
  batch (`ON DELETE SET NULL`), índice parcial. Compatibilidad retroactiva:
  NULL = observación histórica, manual o del monitor; sigue siendo revisable.
  Trigger `rpo_batch_same_org` (patrón APU 4B.1): el lote referenciado debe ser
  de la **misma organización**.
- **`price_observation_bulk_actions`** — auditoría e idempotencia:
  `action_type IN ('approve','reject')`, `import_batch_id` nullable (NULL si la
  selección mezcla lotes), `initiated_by` (FK profiles RESTRICT), `created_at`,
  `selected_count`, `succeeded_count`, `skipped_count`,
  **`UNIQUE (organization_id, idempotency_key)`**, `metadata` JSONB
  (`selectedIds`, `succeededIds`, `skipped[]`, `rejectionReason`).

Sin DROP, sin DELETE, sin backfill. **Sin `db push` remoto en esta oleada.**

### `20260614090100_rls_price_observation_batches_bulk_actions.sql`

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `price_observation_batches` | org (`app.current_org()`) | admin/gerencia/presupuestos/compras + `imported_by = _auth_uid()` | **sin política** (inmutable) | **sin política** |
| `price_observation_bulk_actions` | org | **admin/gerencia** + `initiated_by = _auth_uid()` + batch misma org | admin/gerencia (solo contadores; org/initiated_by blindados en WITH CHECK) | **sin política** |

ENABLE + FORCE en ambas. Total de tablas FORCE: **30** (pre-flight del harness).

## 5. Reglas de aprobación masiva (no negociables)

1. Solo observaciones **`pending`**; approved/rejected/expired ⇒ `not_pending` (skip).
2. **Selección explícita** de IDs; selección vacía ⇒ error; jamás «aprobar todo» implícito.
3. `organization_id` SIEMPRE server-side (`resolveAuthenticatedViewer`); cross-org invisible por RLS ⇒ `not_found`.
4. Roles: aplicación `management|internal`; **DB (fuente real): `admin`/`gerencia`** (paridad con `rpo_update_review_only` de 3A).
5. **Máximo `MAX_BULK_ROWS = 500` filas por acción** (documentado; selecciones mayores ⇒ varias confirmaciones, cada una con su clave).
6. Estrategia por chunks: UPDATE de **`BULK_UPDATE_CHUNK = 100`** ids por statement; cada statement filtra `organization_id + status='pending' + id IN (...)` ⇒ ninguna fila revisada se sobrescribe ni siquiera ante carrera (carrera ⇒ `update_failed` en el reporte).
7. **Idempotencia en dos capas**: (a) `UNIQUE (org, idempotency_key)` — la doble confirmación devuelve la acción original (`alreadyExecuted: true`) sin re-ejecutar; (b) el filtro `status='pending'` hace el UPDATE naturalmente idempotente.
8. **Confirmación final obligatoria** (modal con texto fijo); la clave de idempotencia se genera al abrir el modal (`crypto.randomUUID()`).
9. **Auditoría completa**: quién (`initiated_by`), cuándo (`created_at`), lote (`import_batch_id`), IDs (`metadata.selectedIds/succeededIds/skipped`), conteos, resultado. INSERT **antes** de ejecutar (barrera), contadores al completar. Sin DELETE físico de nada.
10. Rechazo masivo exige **motivo** (aplicado a todas las filas; constraint 3A `rpo_rejection_requires_reason`).
11. Advertencias **no críticas** (visibles, no bloquean): `unit_mismatch` (canónica V1), `zero_price`, `foreign_currency`, `monitor_origin`. **Crítico** (bloquea la acción completa): ID malformado en la selección, clave de idempotencia inválida, selección > máximo.
12. El módulo **no toca** BOQ, AIU, exports, snapshots ni tablas del monitor (solo SELECT de `price_monitor_results` para el flag de origen).

## 6. Backend (`apps/web/server/pricing/review/`)

- `types.ts` — `PendingReviewObservationView` (enriquecida: recurso, proveedor, lote, `fromMonitor`, advertencias), `ReviewBatchView`, `ReviewSummary`, `BulkReviewInput/Result`, interfaz `PriceReviewRepository`.
- `validation.ts` — lógica pura: `validateBulkSelection` (UUIDs, duplicados⇒skip, máx 500), `validateIdempotencyKey`, `computeReviewWarnings`, `buildBulkReviewReportCsv` (CSV sanitizado, reutiliza `buildSanitizedCsv` anti formula-injection).
- `service.ts` — `bulkApproveObservations` / `bulkRejectObservations` / `computeReviewSummary`.
- `db-repository.ts` — RLS-bound (`createClient()`); nunca service-role; flag monitor vía SELECT a `price_monitor_results`.
- `fixture-repository.ts` — demo: lectura vacía; escritura ⇒ `PriceIntelligenceWriteNotSupportedError`.

Importación (CATALOG_BULK_ONBOARDING_V1) extendida: `confirmCatalogImport` y
`confirmProviderPriceList` crean un batch por confirmación (digest persistido)
y propagan `import_batch_id` a cada observación. Cero cambios en matching,
dedupe, contratos de columnas o reportes existentes.

## 7. UI

- **`/catalog/prices/review`** (request-time, `force-dynamic`): título «Revisión
  de precios», resumen (pendientes, con advertencias, proveedores, lotes,
  detectadas por el monitor), tabla (checkbox, recurso, código, proveedor,
  precio observado, descuento, neto sugerido, unidad raw + canónica del
  recurso, fuente, lote, fecha, advertencias, acción individual), filtros
  (lote/monitor/sin lote, proveedor, fuente, advertencias, fecha, recurso,
  solo seleccionadas), acciones (seleccionar válidas, desmarcar, aprobar,
  rechazar, CSV de pendientes), modal obligatorio con el texto del mandato,
  panel de resultado (aprobadas/omitidas/errores + CSV de la acción).
- **Privacidad backend-first**: roles `site`/`client` ven «Acceso restringido»;
  los campos 🔒 (precio observado, descuento, neto) **no se serializan** para
  ellos. En modo demo la pantalla es informativa y las acciones están
  deshabilitadas.
- **Edición individual**: el soporte 3A es append-only (no se editan valores
  observados); el enlace «Revisar» abre la inteligencia de precios del recurso
  para revisión/registro individual. Documentado como límite del soporte actual.
- Accesos: dashboard (KPI «Precios por revisar» enlazado + QuickLink),
  catálogo (botón de cabecera), price intelligence (enlace cuando hay
  pendientes y rol autorizado).

## 8. Pruebas (46/46 del mandato)

- **Schema/RLS (1–6)**: `tests/regression/review-center-rls-static.test.ts` (estático) + harness runtime sección **[20]** (18 checks) ⇒ **RLS 151/151**.
- **Dominio (7–22)**: `tests/unit/pricing/review/service.test.ts` (21 tests, repo en memoria).
- **Seguridad (23–30)** y **UI (31–40)**: `tests/unit/pricing/review/security-and-ui.test.ts` (source-scan, patrón monitor 4A).
- **Regresión (41–46)**: suite completa 1302 PASS, gm 22/22, gm:import $372.247.170, smoke gated 42/42, imports intactos (mock genérico actualizado solo en allowlist de tablas).

## 9. Límites y deudas

- `REVIEW_LIST_LIMIT = 1000` observaciones cargadas en pantalla (paginación server-side diferida si el volumen lo exige).
- Conteos de lote calculados en lectura (sin contadores almacenados).
- Edición de valores observados no existe (append-only 3A) — registrar una nueva observación es el camino.
- Regeneración del CSV de una acción ya ejecutada (idempotencia) entrega IDs sin detalle de recurso (los detalles ya no están pending).

## 10. Siguiente slice (NO iniciado)

`ENTRE_PATIOS_APU_IMPORT_V1` + `BOQ_APU_LINKING_V1` (ver `docs/INTEGRATION_REQUESTS.md`).
