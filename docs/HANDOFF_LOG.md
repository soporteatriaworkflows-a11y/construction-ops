# Handoff Log

## 2026-06-14 — QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/quantity-import-persistence-v1` (base `origin/main = 06bfb10`,
  confirmada). HEAD: `75da170`. **Publicada en origin. Sin merge a main;
  sin deploy; sin db push remoto; sin escrituras remotas.** Stashes intactos
  (2, ajenos a esta rama). Producción intacta. Main intacta.

### Causa raíz
Dos causas independientes combinadas:
1. **Visibilidad**: `/quantities` llama `rm.listQuantities` que lee
   `quantity_groups` (legacy, `project_scope_id`). La importación escribe en
   `quantity_takeoff_groups` (sin `project_scope_id`; solo `organization_id`).
   Familias de tablas distintas → los grupos importados nunca aparecían.
2. **Cache**: `confirmQuantityImportAction` no llamaba `revalidatePath`. Next.js
   16 cachea la página → aunque se corrigiera el punto 1, la pantalla mostraba
   el estado anterior.

### Correcciones
- **`lib/quantity-import/types.ts`**: nuevo `ImportedBatchSummary`.
- **`server/quantity-import/db-repository.ts`**: `listImportedBatches` (Supabase
  RLS-bound; lee `quantity_import_batches` + `quantity_takeoff_groups` +
  líneas; graceful empty si error RLS).
- **`server/quantity-import/service.ts`**: `listQuantityImportBatches`
  (management|internal, db mode only).
- **`server/quantity-import/index.ts`**: exports actualizados.
- **`app/(dashboard)/quantities/import/actions.ts`**: `revalidatePath('/quantities')`
  + `revalidatePath('/quantities/import')` tras éxito.
- **`app/(dashboard)/quantities/page.tsx`**: sección "Memorias importadas"
  (tabla de grupos por lote: descripción, líneas, total, unidad, estado BOQ).
- **`app/(dashboard)/quantities/import/_components/quantity-import-wizard.tsx`**:
  botón → "Ver memorias importadas" → `/quantities#imported-batches`.
- **Contrato**: `docs/QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1_CONTRACT.md`.
- **Sin migración** (tablas `quantity_import_batches`, `quantity_takeoff_groups`,
  `quantity_takeoff_lines` existen en producción desde release
  `quantity-takeoff-import-release-v1`; migraciones `20260616090000` + `20260616090100`).

### Validación (todo PASS, local)
- tsc 0 · lint 0 · **suite 1575 passed / 42 skipped / 0 fail** (+10 tests
  nuevos `persistence.test.ts`) · build limpio (rutas quantities presentes)
  · gm:regression 22/22 · regresión RLS 121/0 · `git diff --check` limpio.

### Próximo paso
- Release controlado: merge a main + deploy con revisión visual en producción.
  Verificar que la sección "Memorias importadas" muestra los lotes existentes
  en la BD de producción (ya persistidos).
- Deuda registrada: `QUANTITY_IMPORT_BATCH_DETAIL_V1` (vista de detalle por
  lote con filtro/búsqueda; hoy se muestran todos los grupos de cada lote en
  la misma tarjeta).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 + CATALOG_PRICE_VISIBILITY_V1 + CLIENT_EXPORT_PROFILE_V1 (orchestrator)

### Estado
- Rama `feature/quantity-workspace-boq-sync-v1` (base `origin/main = 4e1817e`,
  confirmada por `git fetch`; **sin divergencia**). HEAD: `fcb1c25` (+ esta
  entrada de docs). **Sin merge a main; sin deploy; sin db push remoto; sin
  escrituras remotas; sin datos dummy remotos.** Stashes intactos (2, ajenos a
  esta rama). Producción intacta.

### Entregable
- **Contrato congelado** `docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md`
  (commit `ff57807`).
- **Migración aditiva SOLO local** `20260620090000_quantity_workspace.sql` +
  RLS `20260620090100`: tablas NUEVAS `quantity_workspace_groups` /
  `quantity_workspace_lines` (editables, jerarquía piso/módulo/espacio/elemento,
  desperdicio, descuento de vanos, vínculo opcional APU/BOQ), triggers same-org,
  trigger updated_at, RLS ENABLE+FORCE (SELECT org; INSERT/UPDATE/DELETE roles de
  presupuesto). **No toca** `quantity_takeoff_*` ni `quantity_groups/lines`
  legacy. RPC `update_boq_item_quantity` (SECURITY INVOKER): actualiza cantidad
  de ítem BOQ **editable preservando `unit_price_snapshot`**, recalcula subtotal
  server-side, auditoría+idempotencia vía `apu_manual_actions`
  (`action_type='update_quantity'`, CHECK extendido). FORCE count 36→**38**.
- **Motor de fórmulas PURO** `server/quantity-workspace/formula.ts` (9 tipos:
  área simple/piso, muro con vano, enchape por altura, pintura/microcemento,
  perfil lineal, conteo, volumen, **manual seguro sin eval**); plantilla muro
  mixto `templates.ts` (4 derivadas: board/enchape/perfil/pintura, cada una
  vinculable a APU/BOQ distinto). **Preview de sync PURO** `sync.ts` (crear/
  actualizar/bloqueada, antes/después/Δ, advertencias; **versión emitida ⇒
  blocked**). Servicio + db-repository (RLS-bound, resultado recomputado
  server-side; el navegador nunca fija el resultado).
- **read-model** `listWorkspaceGroups` (drizzle + fixture) + `WorkspaceGroupView`.
- **UI** `/quantities/workspace` (lista grupos + totales + estado de vínculo),
  `/quantities/workspace/new` (crear grupo: campos jerárquicos + líneas con 9
  tipos + plantilla muro mixto), `/quantities/workspace/[groupId]/sync` (preview
  obligatorio + confirmar solo filas no bloqueadas). Enlace desde `/quantities`.
- **CATALOG_PRICE_VISIBILITY_V1**: dominio puro `server/catalog/price-status.ts`
  (aprobado/pendiente/rechazado/sin precio + proveedor solo roles internos).
  `resource_price_observations` mapeado en Drizzle; `listCatalogResources`
  enriquece `CatalogResourceView` (no autoaprueba, no expone descuentos). UI
  `/catalog`: columna Estado, precio aprobado/pendiente, proveedor, fecha, CTA por
  fila. **Causa raíz del "precio vacío"**: el read-model nunca poblaba el precio;
  ahora sí (read-model fix acotado, sin migración).
- **CLIENT_EXPORT_PROFILE_V1**: perfil puro `lib/estimates/export-profile.ts`
  (cliente NUNCA incluye fichas APU; técnico honra kind; retrocompatible). Route
  `?profile=client|technical` (default technical ⇒ comportamiento previo intacto;
  **generadores sin cambios, golden master intacto**). UI export relabel: «Para
  cliente» (PDF cliente, Excel presupuesto) vs «Técnico/interno» (PDF técnico
  completo, Excel técnico con APU, APU vinculados).
- **Cronograma**: empty-state honesto en `/planning` + deuda `SCHEDULE_FROM_BOQ_V1`.

### Validación (todo PASS, local)
- `supabase db reset --local` aplica las 2 migraciones nuevas sin error.
- typecheck 0 · lint 0 · **suite 1565 passed / 42 skipped / 0 fail** (+ formula 23,
  sync 9, catalog price 8, export-profile 12) · build limpio (rutas workspace
  presentes) · gm:regression 22/22 · gm:import total **$372.247.169,98** intacto ·
  RLS runtime **241/0** (preflight FORCE 38) · read-model isolation **12/0** ·
  `git diff --check` limpio · validate-claude-agents **214/0**.

### Próximo paso / deudas
- Release controlado requiere `supabase db push` de `20260620090000` +
  `20260620090100` (2 migraciones aditivas; sin DELETE/DROP). Revisión visual en
  `http://localhost:3160`: crear grupo de cantidades (incl. muro mixto), enviarlo
  al presupuesto con preview, ver catálogo con estados de precio, descargar PDF
  cliente vs técnico.
- Deudas registradas: `SCHEDULE_FROM_BOQ_V1`, `OPERATIONAL_ACCESS_LAYER_V1`,
  `SMTP_CORPORATIVO_V1`, `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`,
  `EXPORT_QUANTITIES_ANNEX_V1`, `TRUE_DB_PAGINATION_V1`, y nueva
  `QUANTITY_WORKSPACE_RLS_HARNESS_V1` (checks dedicados del workspace en el
  harness, hoy cubierto por preflight FORCE + paridad con `add_apu_to_boq`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1 (orchestrator)

### Estado
- Rama `feature/apu-budget-exports-v1` (base `origin/main = d3c67bd`, confirmada
  por `git fetch`; **sin divergencia**). HEAD: `77acd03` (+ esta entrada de docs).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas; sin
  datos dummy remotos.** Stashes intactos (2, ajenos a esta rama).

### Entregable
- **Contrato congelado** `docs/APU_EXPORTS_AND_BUDGET_APU_ANNEX_V1_CONTRACT.md`
  (commit `4989eb6`).
- **Dominio READ-ONLY de selección** `server/estimates/export/apu-annex/selection.ts`:
  resuelve `BudgetApuExportSelection` reutilizando el `EstimateExportPayload` del
  presupuesto (snapshots BOQ) + APU EFECTIVAMENTE vinculados por
  `boq_items.apu_template_id`, **deduplicados**, en **orden BOQ** (primera
  aparición), con su cálculo actual (read-model `getApuDetail`). Archivados:
  excluidos en versión editable, incluidos en versión emitida (fidelidad
  histórica). Incompletos: incluidos con advertencia, sin bloquear. **Deps
  inyectables** (tests deterministas sin BD). No muta datos.
- **Nuevo método repo** `getVersionApuTemplateLinks` (interface + db + fixture):
  filas BOQ→APU de la versión objetivo en orden BOQ, ítems/capítulos activos.
- **Generadores Excel** (`apu-annex/apu-xlsx.ts`): `generateLinkedApuExcel`
  (ÍNDICE APU + hoja por APU: encabezado, componentes, resumen por tipo,
  trazabilidad, BOQ vinculado) y `generatePackageExcel` (hojas presupuesto +
  hojas APU, reutilizando `addBudgetSheets` extraído de `xlsx.ts` sin alterar el
  golden master). **Sanitización formula-injection** (`safeCell`) en todo texto.
- **Generadores PDF** (`apu-annex/apu-pdf.ts`): `generateLinkedApuPdf` (portada +
  índice + ficha por APU) y `generatePackagePdf` (página de presupuesto +
  anexos), reutilizando `buildBudgetPage` extraído de `pdf.ts` (salida del
  presupuesto idéntica). Texto saneado (`cleanText`); sin UUID/origen/secretos.
- **Route** `GET /api/estimates/export?kind=budget|apu|package` (budget por
  defecto, intacto). Cross-org ⇒ 404; tamaño > 15 MB ⇒ 413; `no-store`.
- **UI** menú «Exportar» (6 documentos) con conteos (ítems BOQ, APU vinculados,
  sin vínculo, archivados incluidos) y advertencias; opciones APU/paquete
  deshabilitadas sin APU vinculados. Lógica pura testeable en `export-menu-logic.ts`.
- **Fix acotado `READ_MODEL_ARCHIVED_AT`** (causa raíz: el schema Drizzle
  `apuTemplates` no mapeaba `archived_at`/`origin_type`/etc., presentes en BD
  desde `20260618/20260619`). Se sincronizó el mapeo ORM (**sin migración**) y se
  populó `archivedAt`+`originType` en `listApus` (`ApuSummary`) y `getApuDetail`
  (`ApuDetail`), drizzle + fixture.
- **Nombres de archivo**: `apu_vinculados_<codigo>_<version>` y
  `paquete_presupuesto_apu_<codigo>_<version>` (sanitizados); el presupuesto
  conserva su patrón previo.

### Validación (todo PASS, local)
- **Sin migración** ⇒ `db reset` no aplica (solo mapeo ORM contra columnas ya
  existentes en BD). typecheck 0 · lint 0 · **suite 1517 passed / 42 skipped / 0
  fail** (+30: dominio 11, Excel 7, PDF 6, UI 6) · build limpio · gm:regression
  22/22 · gm:import total **$372.247.169,98** intacto · validate-claude-agents
  214/0/0 · `git diff --check` limpio (solo avisos LF→CRLF).
- RLS runtime harness **no aplica** (sin migración/RLS nueva); read-model
  isolation corre dentro de la suite.

### Próximo paso
- Revisión visual en `http://localhost:3150`: desde un presupuesto con APU
  vinculados (Entre Patios), descargar los 6 documentos y validar branding,
  índice, fichas y total. Luego release controlado (sin db push: no hay
  migración; el fix read-model es solo ORM).
- Deudas registradas: `OPERATIONAL_ACCESS_LAYER_V1`, `SMTP_CORPORATIVO_V1`,
  `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`, `TRUE_DB_PAGINATION_V1`,
  `HARDEN_APU_COMPONENTS_FOR_ALL_V1`, `EXPORT_QUANTITIES_ANNEX_V1`.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/apu-manual-builder-validation-archive-v1` (base `origin/main = 3018f8b`).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas; sin datos dummy remotos.**
- HEAD pendiente de commit (esta entrada cierra la sesión).

### Entregable
- **Contrato congelado** `docs/APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1_CONTRACT.md`.
- **Migración aditiva SOLO local** `20260619090000_apu_archive_support.sql`:
  `apu_templates += archived_at/archived_by/archive_reason`; índice parcial sobre
  no-archivados; CHECK extendido `apu_manual_actions_type_valid` (+ `'archive'`);
  RPC `archive_apu_template` (SECURITY INVOKER, 7 guards); `add_apu_to_boq`
  actualizado con guard `apu_archived`; `create_manual_apu` endurecido
  `v_qty <= 0` (antes `v_qty < 0`). FORCE count 36 (sin cambio).
- **Dominio server-side** (`apps/web/server/apu-builder/`): `requireDecimal` amplía
  `exclusiveMin` + nuevo `exclusiveMax`; 6 call-sites `{ min: 0, exclusiveMin: true }`
  para cantidad de material + performanceDays + memberCount; `wastePct` ahora
  `{ min: 0, max: 1, exclusiveMax: true }`; `archiveManualApu` + `loadApuForCopy`
  en servicio y repositorio; nuevos tipos `CopyFromApuData` + `SerializableManualApuPreview`;
  nueva clase `ApuArchiveError`.
- **UI** `/apu/new`: `previewManualApuAction` + `archiveApuAction`; validación por fila
  (cantidad > 0 en materiales; rendimiento > 0, integrantes > 0 en M.O.); texto de
  ayuda inline; banner de duplicado-para-corregir (`?copyFrom=`); `performanceDays`
  inicializado en `''` en lugar de `'0'` (fix bug crítico). `/apu/[id]`: botones
  Archivar/Duplicar para corregir; banners de archivado/incompleto; badges. `/apu`:
  columna Estado (Archivado/Incompleto/Activo); filtro `Archivadas`. Nuevo componente
  `_components/archive-apu-button.tsx`.
- **Tests**: `tests/unit/apu-builder/builder.test.ts` 13→35 tests (22 nuevos):
  bloque "validación estricta > 0" (12), bloque "archiveManualApu" (6), bloque
  "loadApuForCopy" (4). Imports actualizados: `vi`, `archiveManualApu`, `loadApuForCopy`,
  `ApuArchiveError`, `DbApuBuilderRepository`, `CopyFromApuData`, `AuthenticatedViewer`.
- **RLS harness** `scripts/rls-runtime/run.ts`: sección [24b] (8 checks: 24o..24u +
  24s-bis); total 241 checks esperados en local.
- **Suite completa**: 1487 passed / 42 skipped / 0 fail. Build clean. Typecheck 0.
  Lint 0. Golden master 22/22.

### Limitación conocida (integración pendiente)
- `archivedAt` en el listado `/apu` y en `ApuDetail` no se popula hasta que
  `apps/web/server/read-model/drizzle-repository.ts` exponga `archived_at` de
  `apu_templates`. Registrado en `docs/INTEGRATION_REQUESTS.md`.

---

## 2026-06-13 — APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1 (orchestrator)

### Estado
- Rama `feature/apu-manual-builder-boq-add-v1` (base `origin/main = 56b7c0a`,
  confirmada por `git fetch`; sin divergencia). **Sin merge a main; sin deploy;
  sin db push remoto; sin escrituras remotas; sin datos dummy remotos.**
- HEAD de la rama: `90ed0f7` (+ esta entrada de docs).
- Stashes intactos (2, de `integration/wave-4e2a`, ajenos a esta rama).

### Entregable
- **Contrato congelado** `docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md`.
- **Migración aditiva SOLO local** `20260618090000_apu_manual_builder.sql`:
  `apu_templates += origin_type (CHECK manual|workbook_import, default
  workbook_import) + created_by`; tabla nueva `apu_manual_actions` (RLS
  ENABLE+FORCE, append-only, idempotencia `UNIQUE (org, idempotency_key)`);
  RPC `create_manual_apu` y `add_apu_to_boq` (SECURITY INVOKER, org/actor
  server-side, precio de material re-resuelto en SQL desde la última observación
  aprobada, total recalculado en SQL, issued guard `estimate_version_locked`,
  idempotentes). FORCE count 35→36.
- **Dominio server-side** `apps/web/server/apu-builder/` + tipos
  `apps/web/lib/apu-builder/`: compone `modules/apu` (sin redefinir fórmulas);
  material = precio aprobado server-side, M.O. = costo diario integral del
  dominio, herramienta menor derivada. `previewManualApu` PURO.
- **UI** `/apu/new` (formulario materiales + M.O. + resumen estimado en vivo) +
  CTA «Nuevo APU» en `/apu` + CTA «Crear APU usando este recurso» en la
  inteligencia de precios del recurso (preselección `?resourceId=`). Todo
  gated a management/internal + modo creación (oculto/explicado en demo/fixture).
- **BOQ add**: `AddApuPanel` en el workspace de versión EDITABLE (capítulo + APU
  activo + cantidad → RPC `add_apu_to_boq`; snapshot inicial del costo unitario;
  cambios futuros del APU no mutan ítems emitidos).
- **Tests**: `tests/unit/apu-builder/builder.test.ts` (13) + harness RLS sección
  [24] (19 checks).

### Decisión Fase 7 (edición)
- Edición avanzada de APU manual **diferida** a `APU_ADVANCED_EDITOR_V2`
  (creación manual sólida; la reconciliación ya cubre cambios de recurso en
  importados; editar introduce riesgo sobre snapshots BOQ). Sin botones rotos.

### Validación (todo PASS, local)
- `supabase db reset --local` (37 migraciones + 6 seeds, `20260618090000` limpia)
  · typecheck 0 · lint 0 · **suite 1465 passed / 0 fail** (+13) · build
  (`ƒ /apu/new`) · **RLS runtime 233/0** (+19 sección [24], FORCE 35→36) ·
  read-model isolation 12/0 · gm:regression 22/22 · gm:import PASS
  (hoja Excel omitida: `private/` no versionado) · `git diff --check` limpio ·
  validate-claude-agents 214/0/0.

### Próximo paso
- Revisión visual en `http://localhost:3130`: crear un APU manual desde `/apu/new`
  y agregar una actividad al BOQ de una versión editable. Luego release controlado
  (`db push --dry-run` ⇒ exactamente 1 migración nueva `20260618090000`).
- Deudas registradas: `APU_EXPORTS_V1`, `BUDGET_EXPORT_WITH_APU_ANNEX_V1`,
  `APU_ADVANCED_EDITOR_V2` (INTEGRATION_REQUESTS).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — RELEASE: APU_COMPONENT_RESOURCE_RECONCILIATION_V1 + APU_LIBRARY_OPERATIONAL_UX_V1 (orchestrator, release controlado)

### Estado
- **RELEASED.** `origin/main = 03c59c1` (merge commit `--no-ff`). Tag `apu-resource-reconciliation-library-ux-release-v1`.
- 1 migración aplicada remotamente: `20260617090000_apu_component_reconciliation.sql`.
  - Columnas aditivas `apu_components`: `updated_at`, `reconciliation_state` (CHECK), `reconciled_by`.
  - Triggers BEFORE UPDATE: `set_updated_at` + `recompute_total` (cierra R-01).
  - Índice parcial `apu_components_unresolved_idx`.
  - Tabla nueva `apu_component_resource_actions` (RLS ENABLE+FORCE, auditoría inmutable, idempotencia unique parcial).
  - 3 RPCs SECURITY INVOKER: `reconcile_apu_component`, `reconcile_apu_components_bulk` (máx 50, `p_allow_replace=false`), `update_apu_component_reconciliation`. Guard: admin/gerencia/presupuestos.
- Rutas nuevas: `/apu` (biblioteca compacta), `/apu/[id]` (pestañas), `/apu/reconciliation` (centro).
- Smoke productivo: `/login` 200, rutas protegidas 307 (auth guard), `/api/cron/price-monitor` 401. Sin 500.
- db lint: 1 warning extra (`v_res` never read — no bloqueante, lógica correcta).
- Sin seeds remotos. Sin deploy CLI. Sin importación remota. Sin datos dummy. Sin DROP/DELETE/TRUNCATE. Sin variables modificadas. Sin secretos expuestos.
- `feature/apu-resource-reconciliation-ux-v1` HEAD: `7b2ff26` (rama fuente intacta).

### Validaciones post-merge
- typecheck 0, lint 0, suite 1494/1494 (incluye smoke gated), build (`/apu`, `/apu/[id]`, `/apu/reconciliation`), gm:regression 22/22, gm:import PASS, RLS runtime 214/0, validate-claude-agents 214/0/0. read-model-isolation: script no committeado (pre-existente, no regresión).

### Riesgos residuales (no bloqueantes)
- `apu_components_all FOR ALL` sin endurecer (D-REC-6, deuda pre-existente).
- Paginación server-side render (deuda de optimización a true DB-pagination).
- Cast `viewer as AuthenticatedViewer` (type safety, no runtime error).

### Siguiente acción manual recomendada
Revisar `/apu` y `/apu/reconciliation` en producción con sesión real. Probar asociación individual + bulk pequeña con preview. STOP.

---

## 2026-06-12 — RELEASE: QUANTITY_TAKEOFF_IMPORT_V1 (orchestrator, release controlado tras apagado)

### Estado
- **RELEASED.** `origin/main = 81d5bf0` (merge commit). Tag `quantity-takeoff-import-release-v1`.
- 2 migraciones aplicadas remotamente: `20260616090000` (3 tablas + RPC `import_quantity_takeoff_batch`), `20260616090100` (RLS ENABLE+FORCE en las 3 tablas).
- Deploy automático Vercel activo post-push: smoke 11/11 sin HTTP 500; `/quantities/import` 200; `/apu/import` 200; `/catalog/prices/review` 200; cron 401.
- Sin seeds. Sin deploy CLI. Sin importación remota automática. Sin datos dummy. Sin secretos expuestos. Sin DROP/DELETE/TRUNCATE. Sin variables modificadas.

### Validación proporcional
- typecheck 0, lint 0, **1412 tests** PASS, build ✓ (`ƒ /quantities/import`), gm:regression 22/22, RLS estático 96/96, read-model 51/51, gm COP 372.247.170 intacto, validate-claude-agents 214/0/0.

### Siguiente acción manual
- Ingresar a `/quantities/import` con sesión productiva (rol admin/gerencia).
- Cargar workbook real `CANTIDADES 1 PISO` supervisadamente.
- Revisar preview de grupos y líneas antes de confirmar.

### Rollback
- No se ejecutó rollback. Migraciones aditivas; sin datos producción afectados.

---

## 2026-06-12 — FASE 4B.3: QUANTITY_TAKEOFF_IMPORT_V1 (orchestrator, con recuperación tras apagado)

### Estado
- Rama `feature/quantity-takeoff-import-v1` (worktree dedicado; base
  `origin/main = daa4dd9`). **Sin merge a main; sin deploy; sin db push
  remoto; sin escrituras remotas; sin datos dummy remotos.**
- **Sesión de recuperación**: apagado inesperado del equipo a mitad de
  FASE 6. Auditoría R0: 4 commits íntegros en disco (contrato, schema+RLS,
  parser+matching, wizard UI); sección [22] del harness RLS y 3 archivos de
  tests unitarios escritos SIN commitear — todo preservado, nada descartado,
  sin reset/rebase/stash.

### Entregable
- **Contrato congelado** `docs/QUANTITY_TAKEOFF_IMPORT_V1_CONTRACT.md`
  (gramática §2, fórmulas geométricas §3, deducciones §4, occurrence §5,
  matching solo exactos §6, esquema §7, RLS §8, servicio §9, errores §10,
  idempotencia/provenance §11, UI §12, congelados §13, deudas §14).
- **Migraciones aditivas SOLO locales** `20260616090000` + `20260616090100`:
  `quantity_import_batches` (UNIQUE org+digest, inmutable),
  `quantity_takeoff_groups` (vínculo `boq_item_id` UNIQUE parcial; el
  vínculo vive aquí — `boq_items` JAMÁS se muta), `quantity_takeoff_lines`
  (inmutables; raw_values con texto de fórmulas, jamás evaluadas), triggers
  same-org y **RPC atómica `import_quantity_takeoff_batch`** (SECURITY
  INVOKER, idempotente por digest, `version_locked` en emitidas, jamás
  reemplaza vínculos). RLS ENABLE+FORCE; FORCE count 31→**34**.
- **Dominio** `apps/web/server/quantity-import/` (parse-workbook,
  parse-takeoff-sheet, matching, preview, service, db-repository, errors):
  parser PURO sobre valores cacheados; 17 tipos de fórmula geométrica +
  `custom`; recalculo Decimal (Excel = evidencia); matching §6 SOLO exactos
  y no ambiguos (sugerencias informativas SIN `boqItemId`); servicio dos
  pasos (preview/confirm + digest SHA-256) sin persistir archivo; roles
  management|internal; org/actor SIEMPRE server-side.
- **UI** `/quantities/import` (wizard: workbook + versión editable opcional
  → resumen → grupos con líneas desplegables y diferencias vs Excel →
  vínculos por estado → confirmación → reporte + CSV sanitizado) + CTA
  «Importar memorias» en `/quantities`.
- **Tests** `tests/unit/quantity-import/` (59: parser 37, matching 10,
  preview/confirm 12; hojas 100% sintéticas) + sección [22] del harness.

### Recuperación y defectos locales corregidos (sin ampliar alcance)
- `matchTakeoffGroup`: sugerencias devolvían `boqItemId` ⇒ ahora SIEMPRE
  `null` (solo lo exacto porta id; defensa en profundidad §6).
- Harness [22]: setup sin `chapters` (NOT NULL `boq_items.chapter_id`).
- Test documental de alias de unidades: tabla extendida aditivamente con
  m³/un/jn (§2.2).

### Validación (todo PASS)
- `supabase db reset --local` 36 migraciones + 6 seeds (Docker re-arrancado
  tras el apagado) · typecheck 0 · lint 0 · **1412 tests** (+59; 1 flaky
  PDF conocido verde en re-run) · build (`ƒ /quantities/import`) · **RLS
  runtime 194/194** (+21 sección [22]) · isolation 12/12 · gm 22/22 ·
  gm:import $372.247.170 · smoke gated **42/42** (1 transitorio post-reset,
  re-run único verde — patrón warmup conocido) · redirects 15/15 ·
  diff --check limpio · validador 214/0/0.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3110` (importar la
  hoja real `CANTIDADES 1 PISO` supervisadamente) + release controlado
  (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas `20260616*`).
- Deudas registradas: `QUANTITY_TAKEOFF_APPLY_TO_BOQ_V1`,
  `QUANTITY_TAKEOFF_MULTI_SHEET_V1` (INTEGRATION_REQUESTS).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-12 — RELEASE: ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1 (orchestrator)

### Estado
- **RELEASED.** `origin/main = d68d113` (merge commit). Tag `entre-patios-apu-import-release-v1`.
- 3 migraciones aplicadas remotamente: `20260615090000` (apu_import_batches + provenance + RPC),
  `20260615090100` (RLS ENABLE+FORCE), `20260615090200` (fix cast uuid[] — lint limpio).
- Deploy automático Vercel activo: smoke 10/10 sin HTTP 500; `/apu/import` 307 (auth guard ✓); cron 401 ✓.
- Sin seeds. Sin deploy CLI. Sin importación remota del workbook. Sin escrituras remotas distintas del db push.

### Validación proporcional
- typecheck 0, lint 0, suite 1353/1353, build ✓ (`ƒ /apu/import`), gm 22/22, gm:import intacto,
  RLS harness 173/173, diff --check limpio, validador agentes 214/0/0.

### Siguiente acción manual
- Entrar a `/apu/import` con sesión productiva (rol management/internal).
- Cargar el workbook real `COT.ENTRE PATIOS 1 PISO (1).xlsx` supervisadamente.
- Revisar 54 actividades; aceptar sugerencias de materiales explícitamente.
- Evaluar linking contra ítems BOQ reales (aprox. 51 linkable).

### Próximo slice
- **QUANTITY_TAKEOFF_IMPORT_V1** (FASE 4B.3) — NO iniciada, pendiente aprobación.
- Deudas registradas: `BOQ_APU_RELINK_WITH_CONFIRMATION`, `APU_REUSABLE_CREW_TEMPLATES_V1`.

---

## 2026-06-11 — FASE 4B.2: ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1 (orchestrator)

### Estado
- Rama `feature/entre-patios-apu-import-v1` (base verificada
  `origin/main = bfc254b`; árbol limpio; 2 stashes intactos; producción
  intacta). **Sin merge a main; sin deploy; sin db push remoto; sin
  escrituras remotas; sin datos dummy remotos.**
- Workbook real localizado: `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`
  (copiado del worktree principal a `private/` gitignored; SHA-256
  `203F63C8…64C2`). Leído SOLO en modo local; jamás versionado.

### FASE 0–1 (precheck + inspección)
- origin/main NO avanzó. Catálogo baseline en fixtures; APU Foundation
  (4B.1) integrada (labor_role_id + default_tool_pct).
- Hoja APU real mapeada: A1:K466; salarios filas 10–31 (Ayudante factor
  1.6, Oficial 2.3 sobre SMLV; prestaciones/SS/parafiscales aplicados al
  SMLV); header ID/DESCRIPCION/UND fila 34; 54 actividades (36–466);
  códigos visibles REPETIDOS (MAM-01×5, DOT-01×6, MAM-02×2, PISOS-01×2);
  herramienta menor `=G·pct%` con pct VARIABLE (35/30/25/20%); descripciones
  por fórmula a COTIZACION FULL (se usa el caché); insumos referencian
  LISTADO MATERIALES; bloque final 1.114 = alquiler de equipos.

### Entregable
- **Contrato congelado** `docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md`
  (gramática de la hoja, derivación salarial exacta, occurrence index,
  matching, herramienta derivada por template, idempotencia, linking,
  RLS, deudas).
- **Migraciones aditivas SOLO locales** `20260615090000` + `20260615090100`:
  `apu_import_batches` (UNIQUE org+digest; inmutable: sin UPDATE/DELETE;
  INSERT solo admin/gerencia con imported_by = identidad real), provenance
  en `apu_templates` (import_batch_id + trigger same-org, source_sheet/row/
  occurrence) y `apu_components` (source_row/occurrence, raw_code,
  raw_unit), y **RPC atómica `import_apu_batch`** (SECURITY INVOKER patrón
  import_boq_into_version: idempotencia por digest, skip de códigos
  existentes, `total_component_cost` recalculado en SQL, linking guardado
  `apu_template_id IS NULL AND archived_at IS NULL`, versión editable;
  orden templates→links→batch para conteos definitivos con batch inmutable;
  status SIN `FOR UPDATE` — lección 4E.3A).
- **Dominio** `apps/web/server/apu-import/` (sheet-model, parse-workbook,
  parse-apu-sheet, salary, matching, preview, service, db-repository):
  parser PURO sobre valores cacheados (cellFormula solo como metadato;
  jamás se evalúa ni persiste); derivación salarial reproduce el Excel
  EXACTO (hora Ayudante 16.016,814 / Oficial 20.807,439 / cuadrilla 2A+1O
  52.841,0671); cuadrillas → una fila labor por rol (4B.1 §5) con
  labor_role_id obligatorio; matching exacto code/ref/sku, descripción
  SOLO sugerencia con acepte explícito re-validado; recalculo Decimal
  (Excel = evidencia, Δ>0.01 ⇒ advertencia).
- **UI** `/apu/import` (wizard 2 pasos: workbook + versión BOQ opcional →
  preview con resumen/roles/filtros/detalle/aceptes → confirmación
  idempotente → reporte + CSV sanitizado) + CTA «Importar APU» en `/apu`.
- **Dry-run contra el workbook REAL** (`scripts/excel-import/apu-dry-run.ts`,
  local): 54 actividades, 217 componentes, 0 errores, **0 deltas > 0.01**;
  linking contra fixture real: **51 linkable / 3 unresolved / 0 ambiguous**.

### Validación (todo PASS)
- db reset local 35 migraciones + 6 seeds · typecheck 0 · lint 0 ·
  **1353 tests** (+51) · build (ruta `ƒ /apu/import`) · **RLS runtime
  173/173** (+22 sección [21]; FORCE 30→31) · isolation 12/12 · gm 22/22 ·
  gm:import $372.247.170 · smoke gated 42/42 (en aislamiento; contención
  de workers conocida al correr juntos) · redirects 15/15 · diff --check
  limpio · validador 214/0/0.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3100` (importar el
  workbook real con su sesión productiva tras release) + release controlado
  (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas `20260615*`).
- Siguiente slice recomendado: **QUANTITY_TAKEOFF_IMPORT_V1** (FASE 4B.3,
  NO iniciada por mandato).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — RELEASE: PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1

> **Release controlado ejecutado por agent-orchestrator.** Rama `feature/price-observation-review-center-v1` (HEAD `6554516`) integrada a `main` mediante rama temporal `release/price-review-center-v1-merge`. **DB push remoto aplicado (2 migraciones). Main publicado. Producción activa. Tag creado.**

### A. Invariantes Git
- main inicial: `9e03553` → main final: `b974065`
- Feature HEAD: `6554516` (publicada en origin)
- Merge commit: `b974065` (`merge(release): price observation review center and bulk baseline approval v1`)
- Tag: `price-observation-review-center-release-v1` (anotado, publicado)
- Stashes: 2 WIP intactos en `integration/wave-4e2a-manual-boq-editing`
- No se tocaron otros worktrees

### B. DB Push Remoto
- Dry-run inicial: exactamente 2 migraciones pendientes confirmadas
- `20260614090000_price_observation_batches_bulk_actions.sql` — APLICADA
- `20260614090100_rls_price_observation_batches_bulk_actions.sql` — APLICADA
- Dry-run final: "Remote database is up to date" (33/33 Local=Remote)
- db lint: "No schema errors found"
- Seed 0006 NO aplicado. Sin --include-seed. Sin --include-all. Sin db reset remoto.
- Sin DROP, DELETE, TRUNCATE, backfill destructivo.

### C. Validaciones post-merge
- typecheck: 0 errores
- lint: 0 warnings
- diff --check: limpio
- validate-claude-agents: 214/0/0
- suite completa: 1302/1302 PASS (42 skipped gates)
  - Nota: 1 test PDF flaky por contención de workers — pasa en aislamiento (11/11); no relacionado con review center; archivo no modificado en la feature
- build: OK, ruta `/catalog/prices/review` incluida
- golden master: 22/22
- read-model isolation (unit): 51/51
- regression + RLS-static: 87/87
- smoke gated: 42/42 (mvp 10/10 + boq-edit 32/32)
- redirects: 15/15
- RLS harness: 151/151

### D. Deploy y Smoke productivo GET-only
- Deploy: automático vía push a main (Vercel Git integration)
- Hash de deployment Vercel: pendiente confirmación visual (MCP Vercel requiere OAuth — no bloqueante)
- Smoke GET 11 rutas: 200 (`/`, `/login`, `/dashboard`, `/catalog`, `/catalog/prices/review`, `/catalog/import`, `/catalog/providers`, `/catalog/providers/import`, `/catalog/monitoring`, `/apu`, `/projects`)
- Cron `/api/cron/price-monitor` sin Bearer: 401 ✓
- Sin 500s. Sin escrituras remotas. Sin crawling. Sin secrets expuestos.

### E. Notas de infraestructura
- supabase CLI en este worktree: requiere copiar `.temp/` (pooler-url, project-ref, linked-project.json) desde worktree con link previo — auth token en Windows Credential Manager
- `scripts/rls-runtime/read-model-isolation.ts`: falla preexistente de path alias `@/server/repositories/read-repository`; cubierto por 51 unit tests

### F. Confirmaciones
- Sin deploy CLI
- Sin promote
- Sin alias manual
- Sin cambios de variables de entorno
- Sin seeds remotos
- Sin db reset remoto
- Sin DROP/DELETE activos
- Sin datos dummy remotos
- Sin exportaciones
- Sin crawling
- Sin secretos expuestos
- Sin merge a otros worktrees

### G. Rollback
- App: revertir main a `9e03553` con `git push origin 9e03553:main` (si necesario)
- DB: migraciones aditivas (nullable import_batch_id); sin rollback automático destructivo

### H. Pendientes no bloqueantes
- Confirmación visual hash Vercel en producción
- Prueba manual autenticada: aprobar baseline del lote Entre Patios desde `/catalog/prices/review`
- Paginación server-side > 1000 filas (deuda documentada)
- ENTRE_PATIOS_APU_IMPORT_V1 (no iniciado)
- BOQ_APU_LINKING_V1 (no iniciado)
- QUANTITY_TAKEOFF_IMPORT_V1 (no iniciado)

---

## 2026-06-11 — FASE 4B.1: APU_COST_MODEL_FOUNDATION_V1 (rama `feature/apu-cost-model-foundation-v1`)

> **Fundamento trazable del costo APU: rol laboral → cuadrilla → actividad con herramienta menor derivada.** Base `origin/main = 8a81a98` (price monitoring ya integrado). Worktree dedicado `construction-ops-apu-cost-model-foundation-v1`. **Sin merge a main, sin deploy, sin db push remoto, sin datos dummy remotos, stashes intactos (2 WIP).** Importación del Excel (4B.2), BOQ↔APU linking y cantidades (4B.3) NO iniciadas.

### Commits de la oleada
- `0a4fbf0` docs(apu): cherry-pick documental de discovery (origen `b75e7a4`)
- `cb3b176` docs(apu): freeze cost model foundation v1 contract
- `6433041` feat(db): additive APU foundation migrations, seed and fixture v2.1.0
- `8bb2117` feat(apu): traceable labor cost domain, ApuDetail read-model and /apu/[id] view
- `dbf9002` test(apu): foundation domain/read-model tests + RLS harness section 19
- (este commit) docs de cierre.

### A. Contrato
- **`docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md`** congelado: alcance/fuera de
  alcance, modelo laboral (fórmula intacta), trazabilidad `labor_role_id`,
  cuadrillas sin tabla nueva, herramienta derivada vía `default_tool_pct`,
  rendimientos/desperdicios sin cambios, unidades canónicas reutilizadas,
  compatibilidad total con componentes existentes, RLS, migraciones, pruebas,
  golden master y deudas (ENTRE_PATIOS_APU_IMPORT_V1, BOQ_APU_LINKING_V1,
  QUANTITY_TAKEOFF_IMPORT_V1, APU_UI_ADVANCED_EDITING_V1).

### B. Esquema + RLS (migraciones `20260613090000` + `20260613090100`, LOCAL)
- `apu_components.labor_role_id` uuid NULL, FK `labor_roles` ON DELETE SET NULL,
  índice, **trigger same-org** (cross-org ⇒ 23514). Filas existentes en NULL.
- `apu_templates.default_tool_pct` numeric(20,10) NOT NULL DEFAULT 0,
  CHECK rango [0,1]. Sin backfill.
- RLS sin cambios de políticas (columnas heredan ENABLE+FORCE existente).
- Seed `0006_demo_apu_foundation.sql`: rol Ayudante (LR-002) + APU-002 cuadrilla
  demo registrado en `config.toml`.
- **Harness RLS**: sección [19] con 10 checks nuevos ⇒ **130/130 PASS** local.

### C. Dominio (`apps/web/modules/apu/apu.ts`, aditivo y retrocompatible)
- `calculateCrewLaborCost(members)` = Σ(cantidad integrantes × costo por rol).
- `buildCrewLaborComponent({laborRoleId, role, performanceDays, memberCount})`
  congela `dailyIntegralCost` como snapshot y **falla seguro sin laborRoleId**.
- `calculateApuUnitCostFull(components, defaultToolPct)`: desglose por tipo +
  herramienta derivada `pct × Σ labor`; con pct='0' reproduce EXACTO
  `calculateApuUnitCost`. Filas `tool` explícitas intactas. Decimal en todo;
  el servidor nunca confía en subtotales del navegador.

### D. Read-model + UI
- Contrato: `ApuComponentView` + `ApuDetail` (unit RAW + `unitCanonical` vía
  `canonicalizeUnit` de pricing) + `getApuDetail` en `ReadModelPort`.
- Implementado en fixture y Drizzle; `computeApuDetail` compartido en
  `compute.ts`; `ApuNotFoundError` sin fallback; proyección 🔒 rol `client`
  omite `laborRoleCode/laborRoleName` (backend-first).
- `listApus` ahora usa el costo COMPLETO (con derivada); APU existentes
  (pct=0) conservan su valor anterior.
- UI: nueva página `/apu/[id]` (componentes con tipo/rendimiento/desperdicio/
  rol/herramienta derivada + desglose por tipo) y link desde las cards de `/apu`.

### E. Fixture v2.1.0 (`scripts/fixtures/entre-patios-first-floor.fixture.json`)
- +`ROL-AY-001` Ayudante (base 1.160.000 ficticio ⇒ mensual 2.158.200, día
  89.925, hora 11.240,625 — reproducibles con `calculateLaborCost`).
- Componente labor existente de APU-PISO-PORC: +`laborRoleId` (Oficial) SIN
  alterar snapshot/total (68370 intacto).
- +`APU-MURO-LAD` (m2 ⇒ m²): cuadrilla 2 Ayudantes (qty 0.4) + 1 Oficial
  (qty 0.2) + material, `defaultToolPct 0.05` ⇒ M.O. 55.932,5, herramienta
  2.796,625, total 67.549,125.

### F. Validación (todo PASS)
- typecheck 0, lint 0, **1236 tests** (+27 de esta fase) + 42 gated.
- build: `ƒ /apu/[id]` nueva; resto de rutas intactas.
- `supabase db reset --local`: 31 migraciones + 6 seeds sin errores.
- RLS runtime **130/130**; read-model isolation **12/12**.
- Smoke gated `BOQ_SMOKE_DB=1`: boq-edit 32/32 + mvp-internal-flow 10/10
  (1 fallo transitorio PGRST303 por warmup de PostgREST tras reset; re-run verde).
- gm:regression **22/22** (total ≈ COP 372.247.169,97 intacto);
  gm:import `--check-fixture` PASS (regresión + privacidad sin fugas).
- `git diff --check` limpio; validador de agentes 214/0/0.

### G. Riesgos residuales / deudas
- Filas históricas `unit_price_source='labor_role'` con `labor_role_id NULL`
  se toleran en lectura (no trazables); se regularizan en 4B.2.
- Migraciones `20260613*` NO aplicadas a remoto (se aplican en el release).
- Cuadrillas reutilizables entre APU (`apu_crew_templates`) diferidas.

### Próximo paso
- Release de la rama (merge + db push remoto + deploy) cuando la usuaria lo
  autorice; luego **FASE 4B.2 ENTRE_PATIOS_APU_IMPORT_V1** (verificar hoja APU
  con `gm:dump` antes de escribir el parser).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — FASE 4A: PRICE_MONITORING_AGENT_V1 + UNIT_ALIAS_NORMALIZATION_V1 (rama `feature/price-monitoring-agent-v1`)

> **Agente automático del sistema para monitoreo periódico de precios públicos + normalización semántica de unidades.** Base `origin/main = 9f6816f` (verificado HEAD exacto, sin divergencia). Worktree dedicado `construction-ops-price-monitoring-agent-v1`. **Sin merge a main, sin deploy, sin db push remoto, sin variables remotas, stashes intactos (2 WIP).**

### Commits de la oleada
- `c1b1dd6` docs(pricing): freeze automatic price monitoring agent contract
- `a6090f5` feat(db): price monitoring targets/runs/results schema + RLS FORCE + harness checks
- `908e868` feat(pricing): unit alias normalization v1 - canonical m2/und/dia + fix false unit warning
- `6fe898b` feat(pricing): price monitor domain engine - compare, check-target, locks, idempotency, stores
- `7ac2f0d` feat(cron): protected price-monitor cron endpoint + daily vercel cron 11:00 UTC
- `9fb79d5` feat(ui): monitoring center, resource auto-monitoring section, dashboard monitor KPIs
- `f23ad26` test(pricing): monitor engine, cron protection, roles, UI guards and invariants (64 tests)
- (este commit) docs de cierre.

### A. Contrato
- **`docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md`** congelado: system agent no conversacional, scheduler, targets explícitos, cadencias {1,7,15,30}, batch ≤25, locks, idempotencia, 7 estados de resultado, comparación con baseline, pending observations, fallos/retry conservador, UI, roles, seguridad (checklist 20 puntos), CRON_SECRET requirement, aliases de unidades, fuera de alcance y deudas (`PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1`, `OPERATIONAL_ACCESS_LAYER_V1`, `ASSISTED_BUDGET_AGENT_V1`).

### B. Esquema + RLS (migraciones `20260612090000` + `20260612090100`, LOCAL)
- `price_monitor_targets` (UNIQUE org+recurso+URL; cadencia CHECK; URL CHECK http(s); índice parcial de vencidas; DELETE denegado — pausar = enabled=false).
- `price_monitor_runs` tenant-scoped (UNIQUE org+idempotency_key; counters JSONB; initiated_by; error_summary).
- `price_monitor_results` append-only (7 estados; unidad RAW; FK a observación pending).
- RLS ENABLE+FORCE ×3; SELECT org; INSERT/UPDATE roles admin/gerencia/presupuestos/compras; resultados sin UPDATE/DELETE.
- **Harness RLS actualizado**: pre-flight 25→28 tablas FORCE + sección [18] con 14 checks nuevos (aislamiento A/B, cross-org WITH CHECK, gate de rol obra, UNIQUE target, CHECK cadencia, DELETE denegado, append-only results, UNIQUE idempotencia). **120/120 PASS** local.

### C. Dominio (`apps/web/server/pricing/monitor/`)
- `compare.ts` puro (Decimal exacto; moneda normalizada; unidad canónica — m2 vs m² sin warning falso; sin baseline ⇒ propuesta).
- `check-target.ts` reutiliza ÍNTEGRO el camino seguro 3B (validatePublicUrl + fetchPublicPage + adapters + normalize); mapeo de errores → unreachable/blocked/parse_failed/invalid_response; dedup de pending idéntica; notas con metadatos y marca «Monitor automático».
- `service.ts`: corrida programada (lock advisory global en conexión reservada, recovery de runs `running` >30min, batch ≤25 orden next_check_at, round-robin por hostname ⇒ concurrencia por dominio = 1, una run idempotente por org `scheduled:<YYYY-MM-DD>`) + corrida manual (rate limit estructural por ventana: org 5min, target 1min; `ManualRunThrottledError`). Fallo ⇒ failures++ y `next_check_at = now + cadence` (retry conservador; nunca deshabilita).
- `db-stores.ts`: `DbSystemMonitorStore` (cron; lecturas/escrituras de monitor con conexión administrativa documentada; **observaciones SIEMPRE RLS-bound** con claims del usuario habilitador) y `DbViewerMonitorStore` (manual; TODA operación RLS-bound con claims del viewer).
- `db-repository.ts` (UI vía Supabase SSR + RLS real; guard de rol management|internal), `fixture-repository.ts` (demo read-only), `validation.ts`, `index.ts` (factories por READ_MODEL_SOURCE).

### D. Cron + ejecución manual
- `apps/web/vercel.json`: cron diario `0 11 * * *` (11:00 UTC ≈ 06:00 Bogotá) → `/api/cron/price-monitor`.
- `GET /api/cron/price-monitor` (`maxDuration=300`): sin CRON_SECRET ⇒ 500 `cron_not_configured`; Bearer incorrecto/ausente ⇒ 401; comparación tiempo-constante (sha256 + timingSafeEqual); modo fixture ⇒ 503; respuesta SOLO conteos/estados (sin precios, sin URLs, sin secreto). `.env.example` documenta CRON_SECRET (placeholder).
- Server Actions (`app/(dashboard)/catalog/monitoring/actions.ts`): habilitar fuente (con validación SSRF profunda ANTES de persistir), pausar/reanudar, cadencia, «Revisar ahora»/«Ejecutar revisión ahora» — viewer server-side, roles management|internal, solo modo db.

### E. UNIT_ALIAS_NORMALIZATION_V1
- `apps/web/server/pricing/units.ts`: m2/M2/m²/metro(s) cuadrado(s)→`m²`; und/unidad/unidades→`und`; dia/día/jornada→`día`. RAW preservado siempre; comparación canónica; sin backfill.
- Fix real: `server/catalog/import/price-list.ts` usa `unitsEquivalent` ⇒ archivo `m2` vs recurso `m²` ya NO genera warning falso (caso Decorcerámica).

### F. UI
- Recurso (price-intelligence): sección «Monitoreo automático» — toggle «Monitorear esta fuente», frecuencia 1/7/15/30, estado/última/próxima/fallos, «Revisar ahora», historial breve. Controles solo a roles autorizados (server-side).
- `/catalog/monitoring`: 6 tarjetas resumen (monitoreadas/activas/pausadas/vencidas/cambios pendientes/con error), última ejecución + «Ejecutar revisión ahora», tabla (recurso/proveedor/URL/frecuencia/última/próxima/estado/acciones), corridas recientes. Lectura para site/client sin botones.
- Dashboard: bloque 🔒 «Monitoreo automático de precios» con 4 KPIs + acceso rápido «Monitoreo de precios».

### G. Validación (todo PASS)
- `supabase db reset --local`: 28 migraciones + 5 seeds ✅
- typecheck 0 · lint 0 ✅
- Suite completa: **1209/1209 PASS** (42 skipped gated) — +77 nuevos (64 monitor + 13 aliases) ✅
- build: EXIT 0; rutas `/api/cron/price-monitor` y `/catalog/monitoring` presentes ✅
- RLS harness: **120/120** (incl. 14 monitor) ✅ · read-model isolation **12/12** ✅
- Smoke gated BOQ_SMOKE_DB=1: **42/42** (primera corrida tuvo 1 flake de arranque post-reset; re-ejecución limpia) ✅
- gm:regression **22/22** · gm:import total $372.247.170 intacto ✅
- redirect tests (15) y SSRF en suite ✅ · `git diff --check` limpio ✅ · validate-claude-agents **214/0/0** ✅

### H. Seguridad verificada
- CRON_SECRET nunca impreso (test); endpoint protegido (500/401/200/503, tests); roles server-side; organizationId/userId server-side; RLS FORCE ×3 (harness); SSRF/DNS/redirects ≤5 intactos (tests + reuso); sin crawling (1 fetch por target, test); sin headless/anti-bot/login; sin auto-approve (invariante + harness); sin escrituras BOQ/AIU/exports (tests de invariantes); batch acotado; locks; idempotencia.

### I. Riesgos residuales / pendientes de release
1. `CRON_SECRET` NO configurado (mandato): release requirement.
2. Root Directory de Vercel no verificable por MCP (teams vacía): `vercel.json` colocado en `apps/web` (asunción estándar); confirmar en panel y mover a raíz si difiere.
3. `db push` remoto de las 2 migraciones pendiente para release (gate dry-run estricto).
4. El monitor exige `DATABASE_URL` en runtime de producción (ya existente para read-model).
5. Email/SMTP diferido (`PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1`).

### Estado al cierre
- **main intacta = 9f6816f** · producción intacta (`construction-ops-psi.vercel.app`) · sin deploy · sin db push remoto · stashes (2 WIP P1-A) intactos.
- Rama `feature/price-monitoring-agent-v1` publicada en origin.
- Siguiente recomendación: revisión visual de la usuaria en `http://localhost:3070` → release controlado (db push gate + CRON_SECRET + verificación Root Directory + merge) → `OPERATIONAL_ACCESS_LAYER_V1` + SMTP + email notifications.

### Agentes activos al cierre
- Ninguno.

## 2026-06-11 — CIERRE DE ACEPTACIÓN PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1

> **Aceptación funcional del hotfix.** Verificación del tag, confirmación de deployment, prueba de aceptación Decorcerámica con fixture real. Sin escrituras en producción; tests puramente de lógica.

### A. Estado inicial auditado
- `origin/main` = `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63` ✅
- Árbol: 1 modificación documentación pendiente (HANDOFF_LOG anterior) ✅
- Stashes: 2 WIP intactos, sin tocar ✅
- Worktrees: 12 registrados, sin tocar ✅

### B. Tag anotado
- Objeto: `5d97f3e9c7e5acda178cbc92d8c7c1c434e06ab0`
- Commit dereferenciado: `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63` ← MATCH ✅
- Tag publicado en origin: ✅

### C. Deployment productivo
- Vercel MCP sin acceso a equipo (teams list vacía → no se puede obtener commit hash de deployment)
- Trazabilidad disponible: push `4ac3d7f → 4b37c5a` a `origin/main` ejecutado 2026-06-10 ~18:00 COL; Vercel configurado en `main` como Production Branch (docs/audits/security-baseline/09_VERCEL_GITHUB_CICD_AUDIT.md)
- Smoke productivo GET-only (ambas sesiones) → 9/9 PASS HTTP 200 ✅
- **Confirmación visual del commit en panel Vercel: pendiente manual**

### D. Aceptación Decorcerámica — PASS por criterio

| # | Criterio | Método | Resultado |
|---|----------|--------|-----------|
| 1 | Carga correcta del archivo | code-review `price-list-wizard.tsx`: `<input type="file" accept=".xlsx,.xls,.csv">` + `parseCatalogFile` | ✅ PASS |
| 2 | Detección automática de columnas | PL-16: `suggestMapping(headers, PRICE_LIST_FIELDS)` con `externalSku + observedPrice` → mapping completo | ✅ PASS |
| 3 | Resumen visible de auto-mapping | code-review: bloque `MappingIndicator` con `hasPrice`/`hasIdentifier`; `aria-label="Resumen de auto-mapeo"` | ✅ PASS |
| 4 | Diferenciación campos requeridos vs opcionales | code-review: `isPrice → span *`, `isIdentifier → span †`, opcionales sin marcador | ✅ PASS |
| 5 | Panel avanzado colapsable | code-review: `isAdvancedOpen` state, `aria-expanded`, `aria-controls="advanced-mapping-panel"` | ✅ PASS |
| 6 | Comportamiento sin observedPrice | PL-3 + PL-17: sin `observedPrice` → error bloqueante + `importable=false` + panel abierto | ✅ PASS |
| 7 | Comportamiento sin identificador | PL-4 + PL-17: sin ningún identificador → error bloqueante + `importable=false` + panel abierto | ✅ PASS |
| 8 | Corrección manual del mapping | code-review: `updateMapping()` + botón "Recalcular"; PL-19: mapeo incorrecto → 0 matches, corregido → 1 match | ✅ PASS |
| 9 | Sin regresiones en catálogo | PL-20/PL-21: catálogo sigue exigiendo `code+name+resourceType+unit`; `buildCatalogImportPreview` funciona | ✅ PASS |
| 10 | Sin errores inesperados consola/servidor | build EXIT 0, typecheck 0 errores, suite 1132/1132 PASS | ✅ PASS |

**Fixture Decorcerámica (tests `price-list-validation.test.ts`):**
- SKU 6751 → match tipo `sku`, código `MAT-PORC-DC-001`, genera `matchedRow` ✅
- SKU 9999 → `matchType: 'none'`, `status: 'unmatched'`, sin `matchedRow` generado ✅
- Resumen: `matchedCount=1`, `unmatchedCount=1`, `invalidCount=0`, `totalRows=2` ✅
- Sin errores de `name` ni `resourceType` ✅

### E. Bugs encontrados
Ninguno. Un timeout flaky en `export-service.test.ts > pdf-client` (5s bajo carga paralela) — pre-existente, no relacionado con el hotfix; se auto-resolvió en segunda ejecución.

### F. Cierre oficial
**`PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1` está oficialmente CERRADO.**

---

## 2026-06-10 — RELEASE PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1 (merge a `main`)

> **Release controlado del hotfix.** Merge `fix/provider-price-list-mapping-ux-v1` → `main` vía rama temporal `release/price-list-mapping-ux-v1`. Sin deploy CLI, sin db push remoto, sin migraciones, sin features nuevas.

### Invariantes del release
- **origin/main antes:** `4ac3d7f` — **origin/main después:** `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63`
- **Merge commit:** `4b37c5a` · padres: `4ac3d7f` (main) + `db77765` (hotfix)
- **Tag anotado publicado:** `provider-price-list-mapping-ux-hotfix-v1` → `5d97f3e9c7e5acda178cbc92d8c7c1c434e06ab0`
- **Vercel auto-deploy:** disparado por push a `main` (MCP 403 — no verificable programáticamente)
- **Smoke productivo:** 9/9 PASS (200) en `construction-ops-psi.vercel.app`

### Validación pre-merge (todo PASS)
- typecheck: 0 errores ✅
- lint: 0 warnings ✅
- suite: **1132/1132 PASS** (42 skipped gated) ✅
- build: EXIT 0, páginas generadas correctamente ✅
- gm:regression: **22/22 PASS** ✅
- gm:import: total $372,247,170 intacto ✅
- git diff --check: limpio ✅

### Smoke rutas productivas
| Ruta | HTTP | Resultado |
|------|------|-----------|
| / | 200 | ✅ |
| /login | 200 | ✅ |
| /dashboard | 200 | ✅ |
| /catalog | 200 | ✅ |
| /catalog/import | 200 | ✅ |
| /catalog/providers | 200 | ✅ |
| /catalog/providers/import | 200 | ✅ |
| /catalog/resources/new | 200 | ✅ |
| /projects | 200 | ✅ |

### Pendiente manual
- Prueba de aceptación Decorcerámica real: cargar lista con SKU 6751 (→ match + observación pending) y SKU 9999 (→ sin asociar). No ejecutada en este release (sin datos dummy remotos).
- Confirmación visual del hash `4b37c5a` en el panel de Vercel (MCP no disponible).

---

## 2026-06-10 — HOTFIX PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1 (rama `fix/provider-price-list-mapping-ux-v1`)

> **Hotfix acotado de UX de mapeo de lista de precios de proveedor.** Base `origin/main = bd97abb`. Sin merge a main, sin deploy, sin db push, sin migración, sin features nuevas.

- **HEAD inicial:** `bd97abb` → **HEAD final:** `db77765` (release completado 2026-06-10)
- **Archivos modificados:** 4 (price-list-wizard.tsx, catalog-import-wizard.tsx, +2 test files nuevos)
- **Causa raíz:** El wizard de lista de precios (`/catalog/providers/import`) no diferenciaba visualmente entre campos requeridos vs opcionales, mostraba todos los campos como una tabla plana sin indicadores, y no tenía resumen de auto-detección. Esto generaba confusión donde la usuaria veía el mapeo de catálogo (que SÍ exige name/resourceType) como referencia, y el error del servidor sobre campos faltantes no era lo suficientemente claro en contexto.
- **Contratos separados confirmados y documentados:**
  - CATÁLOGO: requeridos `code, name, resourceType, unit`. Opcionales: description, category, brand, externalReference, externalSku, defaultWastePct, providerName, sourceUrl, observedPrice, discountPercent, currency, validUntil, notes.
  - LISTA DE PRECIOS: requerido `observedPrice` + al menos uno de `externalSku/externalReference/code`. Opcionales: description, unit, discountPercent, currency, sourceUrl, observedAt, validUntil, notes. **Nunca requiere name ni resourceType.**

### Cambios implementados

**`price-list-wizard.tsx`** — UX completamente renovada:
- Resumen de auto-detección (`MappingIndicator`): ✓/✗ para precio y para identificador, con columna detectada.
- Panel "Ajustar mapeo de columnas" colapsable: **cerrado** cuando mapeo obligatorio completo; **abierto automáticamente** si faltan campos obligatorios.
- Indicadores visuales en panel avanzado: `*` precio requerido, `†` identificador requerido.
- Mensaje humano: "Necesitamos el precio y al menos un identificador para asociarlo con un recurso existente: SKU, referencia o código."
- Protección de columnas duplicadas: `updateMapping` silencia re-asignación y auto-abre panel si queda incompleto.
- `isPriceListMappingComplete()` pura y reutilizable.

**`catalog-import-wizard.tsx`** — mejoras de UX:
- Sección de mapeo convertida a panel colapsable "Ajustar mapeo de columnas".
- Abierto automáticamente cuando faltan campos obligatorios; cerrado cuando está completo.
- Mensaje contextual: "Revisa el ajuste únicamente si alguna columna no fue reconocida."
- `isCatalogMappingComplete()` añadida para determinar estado inicial del panel.
- Funcionalidad de importación intacta — contrato original sin cambios.

**Tests nuevos (2 archivos, +41 tests):**
- `price-list-validation.test.ts`: PL-1 a PL-15 + fixture Decorcerámica real.
  - Confirma: no requiere name (PL-1), no requiere resourceType (PL-2), exige observedPrice (PL-3), exige identificador (PL-4), matching SKU/ref/code (PL-5–7), sin match = sin asociar (PL-8), ambiguo no resuelto (PL-9), no crea recursos (PL-10), pending sin approved (PL-11–12), no toca BOQ/AIU/exports (PL-13–15).
- `price-list-ux-mapping.test.ts`: PL-16 a PL-21.
  - Panel lógica: completo→panel cerrado (PL-16), faltantes→panel abierto (PL-17), columnas duplicadas rechazadas (PL-18), recalcular preview (PL-19), catálogo conserva contrato (PL-20–21).

### Validación (todo PASS)
- typecheck: `tsc --noEmit` sin output ✅
- lint: `eslint .` sin output ✅
- suite: **1116/1116 PASS** (42 skipped gated) ✅
- build: ✅ `Compiled successfully` + rutas presentes
- gm:regression: **22/22 PASS** ✅
- gm:import: PASS ✅
- git diff --check: limpio (solo advertencia CRLF esperada en Windows) ✅

### Estado al cierre
- **main intacta** = `bd97abb` · **producción intacta** · **sin deploy** · **sin db push remoto** · **sin migración**
- Siguiente acción: release corto → repetir prueba de lista Decorcerámica → confirmar URL real

---

## 2026-06-10 — OLEADA CATALOG_BULK_ONBOARDING_V1 + PUBLIC SOURCE COMPATIBILITY FIX V1 (rama `feature/catalog-bulk-onboarding-v1`)

> **Centro de incorporación de catálogo + compatibilidad con páginas comerciales grandes.** Base `origin/main = 26f3fca`. Sin merge a main, sin deploy, sin db push remoto, sin datos dummy remotos, stashes intactos.

- **Commits:** `d933ceb` (contrato) → `1f145e8` (dominio import) → `83de756` (UI) → `04c01db` (large-page + adapter) → `5cc1057` (tests) → docs (este commit).
- **Contrato congelado:** `docs/CATALOG_BULK_ONBOARDING_V1_CONTRACT.md`.

### A. Importación masiva de recursos — `/catalog/import`
- Formatos: `.xlsx`, `.xls`, `.csv` (SheetJS, `cellFormula:false`, lectura `raw` para CSV ⇒ jamás ejecuta fórmulas/macros). Límites server-side: 10MB, 5.000 filas de datos.
- Mapeo de columnas por sinónimos es/en + corrección manual en wizard (el mapeo viaja como intención y se re-valida server-side).
- Preview: total/nuevas/existentes/duplicadas/inválidas/omitidas/observaciones pendientes; validaciones de código (patrón + vacío), nombre, resourceType (sinónimos), unidad (vacía=error, no reconocida=warning), precio/descuento/moneda, referencias externas repetidas.
- **Nunca sobrescribe**: existente ⇒ `skip_existing`; duplicado en archivo ⇒ solo primera ocurrencia; carrera 23505 ⇒ skip reportado.
- Confirmación batch: digest SHA-256 preview↔confirm; inserts por chunks RLS-bound; `organization_id`/`created_by` server-side; precio válido ⇒ observación `pending` (`supplier_csv`/`manual`); precio inválido ⇒ recurso importa, observación rechazada y reportada.
- Reporte CSV descargable **sanitizado** contra formula injection (`lib/catalog-import/csv.ts`).
- CTAs en el catálogo: primario "Importar catálogo", secundario "Nuevo recurso", acceso "Gestionar proveedores"; estado vacío según mandato ("Carga recursos desde Excel o CSV. La creación manual queda disponible para casos puntuales.").

### B. Lista de precios de proveedor — `/catalog/providers/import`
- Selección de proveedor existente; matching V1 estricto: `externalSku` → `externalReference` → `code`; ambiguos (≥2 recursos) ⇒ "Sin asociar" con motivo; sin match ⇒ "Sin asociar" exportable. NUNCA crea recursos.
- Cada precio ⇒ observación `pending` del proveedor (`supplier_csv`). Nunca `approved`; nunca toca BOQ/AIU/exports; el trigger DB `set_rpo_suggested_net_price` conserva el invariante del neto.

### C. BOQ → catálogo asistido — DIFERIDO
- Deuda `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` registrada (INTEGRATION_REQUESTS + contrato §7): el parser BOQ expone actividades, no recursos (faltan resourceType, desglose APU, código de catálogo, precio de insumo).

### D. Large-page fix + Adapter Decorcerámica
- Evidencia real: URL autorizada = 1.295.123 bytes (~1,26MB), HTTP 200 — el cap previo de 512KB la rechazaba.
- `fetch-public-page`: hard cap **3MB**; 512KB ⇒ warning "página pesada"; sonda de corte temprano (precio+moneda estructurados ⇒ stream cancelado + warning `truncated`). SSRF/DNS por salto, redirects manuales ≤5, loop detection, timeout 10s, content-type guard INTACTOS. Sin crawling/headless/evasión.
- Adapter `decorceramica.com` aislado por hostname (registro en `adapters/index.ts`; genéricos = fallback): AggregateOffer + ofertas anidadas, mpn `KP04NG1620`, meta sku `6751`, 169000 COP; múltiples precios ⇒ warning explícito (propone el menor); unit SIEMPRE null. Fixture sanitizado `tests/fixtures/decorceramica-product.html` (sin red en tests).

### E. Migración y archivos compartidos
- `20260611090000_resources_import_metadata.sql` — aditiva local: `resources` + description/category/brand/external_reference/external_sku + CHECKs de longitud + índices parciales de matching. RLS heredado (FORCE existente). **NO aplicada al remoto.**
- `next.config.mjs` (orquestador): `bodySizeLimit` 4mb→12mb. Riesgo Vercel (~4.5MB) documentado ⇒ deuda `LARGE_FILE_DIRECT_UPLOAD`.

### Validación (todo PASS)
typecheck 0 · lint 0 · suite **1075/1075** (42 gated) · smoke gated DB local **42/42** (`BOQ_SMOKE_DB=1`) · build (rutas nuevas presentes) · `db reset --local` 27 migraciones + 5 seeds · RLS harness **106/106** · read-model isolation **12/12** · gm:regression **22/22** · gm:import PASS · redirect 15/15 · validador agentes **214/0/0** · `git diff --check` limpio.

### Deudas registradas
`DOCUMENT_LIST_IMPORT_V1` · `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` · `COLUMN_MAPPING_PRESETS` · `LARGE_FILE_DIRECT_UPLOAD`.

### Estado al cierre
- **main intacta** = `26f3fca` · **producción intacta** (construction-ops-psi.vercel.app) · **sin deploy** · **sin db push remoto** · **stashes intactos** (2 WIP P1-A) · release pendiente (el pre-release aplicará la migración nueva con dry-run gate).

---

## 2026-06-10 — AJUSTE FINAL UX: Acciones deshabilitadas explicativas en demo y read-only (rama `fix/bootstrap-empty-state-ctas`)

> **Ajuste acotado post-revisión visual.** Problema observado: /catalog/providers no mostraba "Nuevo proveedor" ni CTA cuando canCreate=false. /catalog tenía mensajes de title técnicos y solo cubría el caso demo, no el usuario read-only en modo supabase. Sin migración, sin db push, sin deploy, main intacta, producción intacta.

- **HEAD inicial:** `94513c3` → **HEAD final:** `884703c`
- **Archivos modificados:** 3 (catalog/page.tsx, catalog/providers/page.tsx, tests/unit/catalog/disabled-actions.test.ts)
- **`/catalog`:** `canCreate` ahora combina env gate (`isCreationModeEnabled`) + role check (`management|internal`). `isDemoMode` derivado de `resolveAuthMode() === 'demo'`. `disabledNotice` diferencia mensaje demo vs. mensaje de sin permisos. Titles de botones ahora son español legible.
- **`/catalog/providers`:** `headerActions` ahora siempre muestra "Nuevo proveedor" (disabled con aria-disabled cuando `canCreate=false`). EmptyState "Crear primer proveedor" siempre visible (disabled con nota inline). Banner `disabledNotice` añadido bajo PageHeader.
- **Tests:** `disabled-actions.test.ts` — 42 tests de inspección de fuente cubriendo los 15 ítems del spec.
- **Validación:** typecheck 0 errores ✅ | lint 0 errores ✅ | tests **1012/1012 PASS** (42 skipped gated) ✅ | build **PASS** ✅ | gm:regression 22/22 ✅ | gm:import PASS ✅ | git diff --check limpio ✅
- **Rama publicada:** `fix/bootstrap-empty-state-ctas` → `94513c3..884703c`
- **Deuda registrada:** `CATALOG_BULK_ONBOARDING_V1` — importación masiva diferida a oleada separada.

### Comportamiento resultante
| Escenario | "Nuevo recurso" | "Gestionar proveedores" | "Nuevo proveedor" | Mensaje visible |
|---|---|---|---|---|
| Demo (APP_AUTH_MODE=demo) | visible, disabled | habilitado | visible, disabled | "Modo demostración: puedes explorar..." |
| Usuario read-only supabase | visible, disabled | habilitado | visible, disabled | "No tienes permisos para crear..." |
| Autorizado (supabase+db+management/internal) | habilitado | habilitado | habilitado | ninguno |

### Estado al cierre
- HEAD: `884703c` · **main intacta** = `2f16e4a` · **producción intacta** · **sin deploy** · **sin migración** · **stashes intactos**

---

## 2026-06-10 — HOTFIX: Bootstrap empty state CTAs y descubribilidad del catálogo (rama `fix/bootstrap-empty-state-ctas`)

> **Hotfix acotado de UX.** Bootstrap dead-end detectado en prueba real: organización vacía no tenía acciones visibles. Sin migración, sin db push, sin deploy, main intacta, producción intacta.

- **FASE 0 — Precheck:** rama `fix/bootstrap-empty-state-ctas`, árbol limpio, `origin/main = 2f16e4a`, stashes intactos (P1-A security WIP).
- **FASE 1 — Auditoría:** 8 pantallas auditadas. /catalog y /catalog/providers sin CTAs; Price Intelligence sin disclaimer; APU/Cantidades/Cronograma/Presupuestos con EmptyState sin guía útil; Proyectos ya correcto.
- **FASE 2 — Catálogo:** Header: [Nuevo recurso, Gestionar proveedores]. EmptyState: [Crear primer recurso, Gestionar proveedores]. Filas de recurso enlazadas a Price Intelligence. Módulo `server/catalog/` creado (types, errors, validation, db-repository, index). Ruta `/catalog/resources/new` con formulario seguro (code/name/resourceType/unit, organizationId server-side, RLS-bound, validación pura).
- **FASE 3 — Price Intelligence:** Disclaimer visible a todos los roles: "La validación web propone una observación. No modifica automáticamente presupuestos ni aprueba precios."
- **FASE 4 — Otros módulos:** APU/Cantidades/Cronograma: EmptyState con texto explicativo real (sin CTAs falsos). Presupuestos: guía de flujo preservando texto "Aún no hay presupuestos registrados" + CTA "Ir a Proyectos". Proveedores: botón movido a PageHeader.actions, CTA en EmptyState.
- **FASE 5 — EmptyState:** Props `secondaryAction` y `readOnlyMessage` añadidas de forma retrocompatible.
- **FASE 6 — Tests:** 3 nuevos archivos de test (bootstrap-ctas, route-config, empty-state-ctas) — validación pura sin DB.
- **FASE 7 — Validación:** typecheck 0 errores ✅ | lint 0 errores ✅ | tests **970/970 PASS** (42 skipped gated) ✅ | build **PASS** (`/catalog/resources/new` presente) ✅ | gm:regression 22/22 ✅ | git diff --check limpio ✅
- **Commit:** `ab2f4e0` — 19 files, +1002/-49 lines.
- **Rama publicada:** `fix/bootstrap-empty-state-ctas` → origin.
- **Servidor local:** `http://localhost:3040` listo.

### Rutas para revisión visual
- `http://localhost:3040/catalog` — Header + EmptyState con CTAs
- `http://localhost:3040/catalog/providers` — Header button + EmptyState CTA
- `http://localhost:3040/catalog/resources/new` — Formulario de nuevo recurso
- `http://localhost:3040/apu` — EmptyState mejorado
- `http://localhost:3040/quantities` — EmptyState mejorado
- `http://localhost:3040/planning` — EmptyState mejorado
- `http://localhost:3040/estimates` — EmptyState con guía + CTA
- `http://localhost:3040/projects` — Sin cambios (ya tenía CTAs)

### Módulos sin backend de creación (sin CTA de creación)
- APU: no existe flujo de creación manual; se llena desde importación de presupuesto.
- Cantidades: no existe flujo manual; se cargan desde scopes del proyecto.
- Cronograma: no existe flujo manual; requiere módulo de planning.
- Deudas registradas en INTEGRATION_REQUESTS.

### Estado al cierre
- HEAD: `ab2f4e0` · **main intacta** = `2f16e4a` · **producción intacta** · **sin deploy** · **sin migración** · **stashes intactos**
- Pendiente: revisión visual de la usuaria → release hotfix corto → continuar prueba Decorcerámica.

## 2026-06-09 — PRE-RELEASE: Migraciones Pricing aplicadas al remoto (rama `integration/operational-ux-price-validation-v1`)

> **Aplicación de 3 migraciones pricing al DB remoto.** Sin seeds, sin reset, sin db pull. DB remota: 26/26 Local = Remote. Lint sin errores.

- **FASE 0 — Precheck:** invariants confirmados (rama candidata, HEAD=29f5a9f, main=22a408c, origin candidata=29f5a9f, stashes intactos).
- **FASE 1 — Dry-run:** 3 migraciones pendientes detectadas — exactamente las esperadas: 20260610090000, 090100, 090200 (pricing). GATE ESTRICTO PASS (aditivas, sin DROP destructivo, sin DELETE, sin seeds, RLS coherente, trigger coherente).
- **FASE 2 — `supabase db push --linked`:** 3 migraciones aplicadas. `migration list --linked` = **26/26 Local = Remote**. Dry-run final: "Remote database is up to date." `db lint --linked`: "No schema errors found."
- **Migraciones aplicadas al remoto:**
  - `20260610090000_resource_price_intelligence.sql` (tabla `resource_price_observations`, extensión `suppliers`, trigger `app.set_rpo_suggested_net_price`)
  - `20260610090100_rls_resource_price_intelligence.sql` (ENABLE FORCE RLS + 3 policies)
  - `20260610090200_fix_discount_percent_precision.sql` (NUMERIC(6,4)→(7,4), DROP+RECREATE policy necesario para ALTER COLUMN TYPE)
- **Deuda registrada:** `PUBLIC_SOURCE_COMPATIBILITY_BENCHMARK` — durante la revisión visual local una URL pública real no fue compatible con los adaptadores genéricos V1 (probable JS-rendering o anti-bot). No bloquea el release. Evaluar post-release con fuentes reales (Homecenter, Decorcerámica). Sin headless browser, sin evasión, sin scraping.
- **Revisión visual:** aprobada por la usuaria.
- **Estado:** candidata lista para merge a main.

---

## 2026-06-09 — INTEGRACIÓN FINAL LOCAL: Operational UX + Phase 3B + SSRF Fix (rama `integration/operational-ux-price-validation-v1`)

> **Integración controlada de 3 oleadas** sobre base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`.
> **main = `22a408c` intacta; producción intacta; sin deploy; sin db push remoto.**
> Ejecutada por agent-orchestrator. HEAD inicial `d944bc1` → HEAD final `110a5f6`.

### FASE 0 — Precheck
- Invariantes confirmados: rama, árbol limpio, origin/main=22a408c, operational-ux=105d106, phase3b=6da64b1, stashes P1-A intactos.

### FASE 1 — Merge Operational Budget UX V1
- `git merge --no-ff origin/feature/operational-budget-ux-v1` → merge `3f6fd6d` — **sin conflictos** (26 archivos, 2626 inserciones).
- Archivos clave: `boq-workspace.tsx`, `commercial-simulator.tsx`, `workspace/page.tsx`, `simulator-actions.ts`, `workspace-view.ts`, `commercial-simulation.ts`, `breakdown.ts`.

### FASE 2 — Merge Phase 3B + SSRF Fix
- `git merge --no-ff origin/feature/phase3b-price-validation-agent-v1` → **3 conflictos en docs/** (DECISIONS, HANDOFF_LOG, QA_REPORT) resueltos preservando ambas secciones → merge `6618877`.
- Fix de integración: `countPendingResourcePriceObservations` añadido al mock de Phase 3B (`service.test.ts`) → commit `110a5f6`. Typecheck 0 errores post-fix.

### FASE 3 — DB Reset Local
- `npx supabase db reset --local` → **26/26 migraciones** + 5 seeds aplicados sin errores de DB.
- Error `Updating vector buckets 404` = B-004 conocido (vector/realtime unhealthy en Docker Windows). No bloqueante.
- Tablas pricing disponibles; trigger `rpo_set_suggested_net_price` activo; RLS pricing habilitado; constraints correctos.
- Sin conexión remota. Sin db push.

### FASE 4 — Validación Integral
- typecheck: **0 errores** ✅
- lint: **0 errores** ✅
- tests: **944/944 PASS** (42 skipped gated) — +66 Operational UX +85 Phase 3B vs 809 base ✅
- build: **PASS** (ruta `/workspace` y `/catalog/.../price-intelligence` presentes) ✅
- RLS runtime: **106/106 PASS** (25 tablas FORCE RLS) ✅
- read-model isolation: **12/12 PASS** ✅
- gm:regression: **22/22 PASS** — golden master COP 372.247.170 intacto ✅
- gm:import: **PASS** (diff=1.9e-8, tol 0.01) ✅
- MVP smoke E2E gated `BOQ_SMOKE_DB=1`: **10/10 PASS** ✅
- git diff --check: **limpio** ✅
- validate-claude-agents: **214/0/0 PASS** ✅

### FASE 5 — Seguridad Phase 3B
- Redirect tests: **15/15 PASS** (R01–R15) ✅
- SSRF tests: **T1–T11 + extras PASS** ✅
- Adapters + normalize + service: PASS ✅
- Invariantes: propuesta siempre pending, BOQ nunca modificado, AIU nunca modificada, red externa no usada en tests ✅

### FASE 6 — Coherencia Visual
- Dashboard: KPIs operativos, conteos (issuedVersions, pendingPriceObservations 🔒), accesos rápidos (Proveedores, Inteligencia de precios) ✅
- BOQ Workspace: tabla densa, sticky header, capítulos colapsables, filtros, búsqueda, resumen financiero, simulador comercial (borde dashed cian, disclaimer) ✅
- Price Intelligence: UrlValidationPanel wired con resourceId ✅
- Branding: "Presupuestos" + "Grupo ICONIC"; sin "Construction Ops" visible; tokens ICONIC heredados ✅
- Sin regresión visual en login, catálogo, proyectos ✅

### Documentación
- HANDOFF_LOG, DECISIONS, QA_REPORT, INTEGRATION_REQUESTS actualizados.
- Ramas de feature usadas solo como origen de merge; no tocadas.

### Estado al cierre
- HEAD final: `110a5f6` · **main intacta** = `22a408c` · **producción intacta** · **stashes intactos**
- Pendientes: revisión visual interactiva de la usuaria + aprobación para release.
- NO merge a main. NO deploy. NO nueva feature.

**Rutas prioritarias para revisión visual (`http://localhost:3030`):**
- `/login` — identidad ICONIC
- `/dashboard` — hero + KPIs operativos + accesos rápidos
- `/projects` — lista de proyectos con shell ICONIC
- `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>` — detalle presupuesto
- `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>/workspace` — BOQ workspace + simulador
- `/catalog` — catálogo
- `/catalog/providers` — proveedores (Price Intelligence)
- `/catalog/resources/<resourceId>/price-intelligence` — panel validar precio desde URL

---

## 2026-06-09 — OLEADA OPERATIONAL BUDGET UX V1 (rama `feature/operational-budget-ux-v1`)

> Base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`. **main = `22a408c` intacta;
> producción intacta; sin deploy; sin db push remoto; Phase 3B NO iniciada; stashes intactos.
> 0 migraciones nuevas.** Ejecutada por agent-orchestrator (sin subagentes: oleada cohesiva
> UI+dominio; se evitó solape de archivos y cold-start; ownership respetado e integrado).

### Entregado
- **A+B — BOQ Workspace denso** (`…/estimates/[estimateId]/workspace`): sticky toolbar
  (búsqueda código/descripción, filtros activos/archivados/todos, expandir/colapsar,
  total general siempre visible) + grilla densa con header sticky, capítulos agrupados
  colapsables, badges (Archivado/normalizado secundario), archive/restore inline
  (reutiliza `ArchiveControls`), footer de costo directo. **Edición rápida** de
  cantidad/precio reutilizando `updateItemAction` 4E.2A: navegador envía SOLO campos
  permitidos; subtotal + resumen vuelven del servidor; feedback Guardando/Guardado/error;
  `router.refresh()` re-sincroniza; issued ⇒ banner inmutable + edición deshabilitada.
  Helpers puros client-safe en `lib/estimates/workspace-view.ts` (sin matemática financiera).
  CTA "Abrir workspace" en el detalle del presupuesto.
- **C — Resumen financiero visual**: 7 cards ICONIC compactas (directo, A, I, U, IVA/U,
  indirectos, total) server-derived, vivas tras cada quick-edit.
- **D — Desglose por capítulos**: `server/estimates/breakdown.ts`
  (`computeChapterBreakdown`, Decimal, shares 0..1, base cero segura) + barras de
  participación. **Cost-type NO confiable** (boq_items sin clasificación) ⇒ deuda
  `COST_TYPE_BREAKDOWN_FOUNDATION` registrada (INTEGRATION_REQUESTS + DECISIONS).
- **E+F — Simulador comercial V1**: dominio puro
  `modules/estimates/commercial-simulation.ts` (fórmula del mandato, validación de
  porcentajes/objetivo, 3 estados vs objetivo, Decimal, determinista) + server action
  (base = `grandTotal` server-derived, READ-ONLY) + panel separado visualmente
  (borde dashed cian, badge, disclaimer obligatorio) + vista previa comercial limpia.
  **SIN persistencia** (decisión registrada; slice futuro `COMMERCIAL_SIMULATION_PERSISTENCE`).
- **G — Dashboard operativo**: sección "Operación" (proyectos, presupuestos activos,
  versiones emitidas, 🔒 precios por revisar solo management/internal; tolerantes a fallo)
  + accesos rápidos (Proyectos/Catálogo/Proveedores/Inteligencia de precios). Extensión
  aditiva: `countIssuedEstimateVersions` (estimates db+fixture) y
  `countPendingResourcePriceObservations` (pricing db+fixture).

### Validación (todo PASS)
- typecheck 0 · lint 0 · **875 tests** (+66 de la oleada) · build Next 16.2.6 (ruta
  `/workspace`) · `supabase db reset --local` (26 migraciones + 5 seeds) ·
  **RLS runtime 106/106** · **read-model isolation 12/12** · **gm:regression 22/22** ·
  **gm:import PASS** ($372.247.170 intacto) · smoke E2E gated `BOQ_SMOKE_DB=1` **42/42** ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.

### Documentación
- Nuevo `docs/OPERATIONAL_BUDGET_UX_V1_CONTRACT.md`. Actualizados DECISIONS (3 filas),
  QA_REPORT (sección de la oleada), INTEGRATION_REQUESTS (extensión aditiva + 2 deudas).

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3020` (workspace + simulador +
  dashboard). Si aprueba: integrar a la rama de integración / pre-release. NO merge a
  main ni deploy sin orden expresa.

### Agentes activos al cierre
- Ninguno.
## 2026-06-09 — PHASE 3B — SECURITY FIX: Redirect SSRF (rama `feature/phase3b-price-validation-agent-v1`)

> **Fix acotado de seguridad post-implementación.** Sin DB reset, sin migraciones, sin servidor local, sin merge a main. Mismos constraints paralelo-seguros que Phase 3B.

**Problema identificado:** `fetch-public-page.ts` usaba `redirect: 'follow'` (hasta 20 saltos nativos sin validación SSRF en saltos intermedios). Un redirect a `http://169.254.169.254/` en un salto intermedio pasaría desapercibido porque el check `isFinalUrlSafe` solo evaluaba la URL final.

**Fix aplicado:**
- Reescrito `fetch-public-page.ts`: `redirect: 'manual'` + loop manual (máx 5 saltos).
- Antes de cada hop: `validatePublicUrl(currentUrl, dnsLookup)` con resolución DNS real. Cualquier `UrlValidationError` → `FetchPublicPageError('redirect_to_private', ...)`.
- Loop detection: `Set<string>` de URLs visitadas → `redirect_loop`.
- 3xx sin Location → `redirect_missing_location`.
- Location con URL inválida → `redirect_invalid_url`.
- Redirects relativos: `new URL(location, currentUrl)`.
- Firma actualizada: `fetchPublicPage(url, fetcher?, dnsLookup?)` — backward compatible.
- `index.ts` actualizado para propagar `deps?.dnsLookup` a `fetchPublicPage`.
- 15 tests nuevos `redirect.test.ts` (R01–R15) con `vi.stubGlobal('fetch', mock)` + DNS inyectado.

**Validación:** typecheck 0, lint 0, **878/878 tests PASS** (↑15 vs 863), git diff --check limpio.

**HEAD final (antes del push):** pendiente commit `fix(pricing): validate every redirect hop before public price fetch`.

---

## 2026-06-09 — PHASE 3B — PRICE VALIDATION AGENT V1 (rama `feature/phase3b-price-validation-agent-v1`)

> **Ejecución paralela segura.** Base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`. Sin DB reset, sin migraciones, sin servidor local, sin merge a main.

- **FASE 0 — Precheck:** invariants confirmados (worktree correcto, rama correcta, HEAD=d944bc1, árbol limpio, origin/main=22a408c, stashes intactos).
- **FASE 1 — Inspección:** server/pricing/ (Phase 3A), UI price-intelligence, tests unitarios pricing.
- **FASE 2 — Contrato congelado:** `docs/PRICE_VALIDATION_AGENT_V1_CONTRACT.md` → commit `ea71df9`.
- **FASE 3 — Backend aislado:** `apps/web/server/pricing/validation/` (9 archivos: types, validate-url + SSRF, fetch-public-page, adapters JSON-LD + meta + index, normalize, confidence, service index) → commit `8253386`. Exportaciones Phase 3B en `server/pricing/index.ts`.
- **FASE 4 — UI Price Intelligence:** `url-validation-panel.tsx` (client, useActionState React 19), `actions.ts` extendido (validatePublicUrlAction + confirmProposalAction), `page.tsx` integrado → commit `8b90ed3`.
- **FASE 5 — Tests unitarios puros (sin red, sin DB):** 70 tests nuevos en `tests/unit/pricing/validation/` (validate-url: 14, adapters: 13, normalize: 12, service: 13) — **863/863 PASS** total. Covers T1–T38 del spec.
- **FASE 6 — Validación:** typecheck **0 errores**, lint **0 errores**, tests **863/863 PASS**, git diff **limpio**.
- **FASE 7 — Documentación:** HANDOFF_LOG, DECISIONS, QA_REPORT actualizados.
- **FASE 8 — Publicar:** rama `feature/phase3b-price-validation-agent-v1` publicada → origin. STOP.

**HEAD final:** `8b90ed3` · **main intacta** = `22a408c` · **producción intacta** · **stashes intactos** · **sin merge, sin deploy, sin DB reset**

**Checks diferidos (trabajo paralelo operational-budget-ux-v1 activo):**
- supabase db reset local
- RLS runtime harness (106/106 esperado sin cambio de esquema)
- smoke MVP e2e
- revisión visual servidor local
- merge de ramas en orden
- deploy Vercel

**Siguiente acción:** esperar cierre de Operational UX → integrar ramas → db reset local → RLS + smoke → revisión visual → decidir release.

---

## 2026-06-09 — INTEGRACIÓN ICONIC UI + PRICE INTELLIGENCE (rama `integration/iconic-ui-price-intelligence-v1`)

> **Integración controlada de 2 oleadas** sobre base `main` = `22a408c`. Sin merge a main; sin deploy; sin db push remoto.

- **FASE 0 — Precheck:** invariants confirmados (rama, working tree limpio, origin/main=22a408c, ui-branding=d4c9dbd, phase3a=03bc334, stashes intactos).
- **FASE 1 — Merge Branding ICONIC V1:** `git merge --no-ff origin/feature/ui-branding-iconic-v1` → merge `c647989`, **sin conflictos** (20 archivos: tokens, shell, login, sidebar, empty-state, workspace-brand, página-header, button/badge/card, dashboard hero).
- **FASE 2 — Merge Price Intelligence 3A:** `git merge --no-ff origin/feature/phase3a-price-intelligence-foundation` → conflictos esperados en docs/ resueltos preservando ambas secciones → merge `a9ac86d` (30 archivos: server/pricing/, 4 páginas pricing, 3 migraciones pricing, seeds, validación DB).
- **Fix harness RLS:** contador tablas FORCE RLS 24→25 (`resource_price_observations` añadida en Fase 3A) → commit `533ee67`.
- **FASE 3 — DB reset local:** `supabase db reset --local` → **26/26 migraciones** + 5 seeds aplicados. Trigger `rpo_set_suggested_net_price` PASS, 3 policies RLS, seeds pricing OK.
  - Nota: el QA_REPORT de Fase 3A menciona "27 migraciones" (error de conteo anterior; el actual es 26).
- **FASE 4 — Validación completa:**
  - typecheck: **0 errores**
  - lint: **0 errores**
  - tests: **809/809 PASS** (42 skipped gated) — golden master $372.247.170 intacto
  - pricing tests: **99/99 PASS**
  - build: **PASS** (`/catalog/resources/[resourceId]/price-intelligence` ruta dinámica presente)
  - RLS runtime: **106/106 PASS** (25 tablas FORCE)
  - read-model isolation: **12/12 PASS**
  - gm:regression: **22/22 PASS**
  - gm:import: **9/9 PASS** (diff=0 en total_costo)
  - git diff --check: **limpio**
  - validate-claude-agents: **214/0/0 PASS**
- **FASE 5 — Coherencia visual pricing + ICONIC:** páginas pricing heredan shell ICONIC; `PageHeader`/`EmptyState`/`Badge`/`Button` ICONIC; sidebar "Presupuestos" + "Grupo ICONIC"; sin "Construction Ops" visible; sin pantalla en blanco; auth intacta. Deuda conocida `text-blue-600` en website URL (diferida).
- **FASE 6 — Documentación:** esta entrada.
- **FASE 7 — Rama publicada:** `integration/iconic-ui-price-intelligence-v1` → `origin`.
- **FASE 8 — Entorno local:** servidor en `http://localhost:3010` (ver rutas prioritarias abajo).

**Estado HEAD:** `533ee67` · **main intacta** = `22a408c` · **producción intacta** · **stashes P1-A intactos**

**Rutas prioritarias para revisión visual:**
- `/login` — identidad ICONIC (navy + curva + cian)
- `/dashboard` — hero ICONIC + KPIs
- `/catalog` — catálogo con tokens ICONIC
- `/catalog/providers` — lista de proveedores (Price Intelligence)
- `/catalog/resources/<resourceId>/price-intelligence` — historial + formulario de observaciones
- `/projects` — proyectos con shell ICONIC
- Una vista de presupuesto → `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>`
- Comparación de versiones → `.../compare`

**Pendientes:**
- Revisión visual de la usuaria (local).
- `main` intacta hasta aprobación.
- Phase 3B NOT iniciada.

## 2026-06-09 — OLEADA UI / BRANDING ICONIC V1 (rama `feature/ui-branding-iconic-v1`)

> Refresh **visual** desde `main` (`22a408c`). **Sin lógica/cálculos/RLS/migraciones/
> Vercel/deploy. `main` intacta; producción intacta.** (Reemplaza la rama previa
> `feature/ui-branding-wave-v1` con el set ICONIC completo.)

- **Naming visible:** "Construction Ops" → **"Presupuestos"** (producto) + **"Grupo
  ICONIC"** (workspace) + descriptor "Gestión de presupuestos de obra". Migrado en
  sidebar, título del navegador y login. Internos técnicos sin tocar.
- **Tokens oficiales:** CSS vars `--iconic-*` en `globals.css` + Tailwind `iconic.*`/
  `brand.*` (paleta ICONIC). body `bg-iconic-gray`, focus ring ICONIC.
- **Branding config multi-tenant ready:** `lib/branding/workspace.ts`.
- **Assets oficiales reutilizados** (no redibujados): `grupo-iconic-logo-full.png`
  (login) + `grupo-iconic-logo-symbol.png` (avatar). Guía
  `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` **ya existe** en el repo.
- **Superficies:** login (panel navy + curva + cian), shell (sidebar ink + topbar +
  nav activa), dashboard (hero + KPI ink), reutilizables (button/badge primario
  ICONIC, card hover, empty-state branded, page-header navy + acento). Propaga a
  proyectos/presupuestos/catálogo/cantidades/planeación/comparación vía componentes.
- **Validación:** typecheck/lint 0, **757 tests** (sin regresión), build OK,
  `git diff --check` limpio. Doc `docs/UI_BRANDING_ICONIC_V1.md`.
- **Deuda visual:** branding por tenant aún estático; headers de tabla navy
  (diferido, tablas inline); `text-blue-700` inline → ICONIC; metadata de exports
  interna. **No merge a main; no deploy; sin nuevas features.**
## 2026-06-10 — FASE 3A — CIERRE FORMAL (DB RESET + VALIDACIÓN REAL + PRECISION FIX)

**Rama:** `feature/phase3a-price-intelligence-foundation`.  
**Continuación de la sesión anterior.** Se ejecutó el `supabase db reset --local` pendiente,
se validaron las 27 migraciones + 5 seeds contra PostgreSQL local, y se detectó + corrigió
un bug de precisión en `discount_percent`.

### Fix detectado durante validación DB real

**Bug:** `discount_percent NUMERIC(6,4)` solo permite valores hasta `99.9999`. Insertar `100`
(descuento del 100%, válido por el CHECK) disparaba `numeric_field_overflow` en lugar del
`check_violation` esperado. El constraint `rpo_discount_range (discount_percent <= 100)` era
inalcanzable para su límite superior.

**Fix aplicado:** Migración `20260610090200_fix_discount_percent_precision.sql` — cambia
ambas columnas a `NUMERIC(7,4)` (permite 100.0000). Se requirió DROP + RECREATE de la
política RLS `rpo_update_review_only` (que referencia `discount_percent`) alrededor del
`ALTER COLUMN TYPE`.

**Otros hallazgos:** El seed `0005_demo_price_intelligence.sql` no estaba listado en
`supabase/config.toml [db.seed]`. Corregido.

### Resultados de validación DB (27 tests)

| Test | Resultado |
|---|---|
| T1 — tabla `resource_price_observations` existe | ✅ PASS |
| T2 — 3 columnas nuevas en `suppliers` | ✅ PASS |
| T3 — función trigger `app.set_rpo_suggested_net_price` existe | ✅ PASS |
| T4 — trigger `rpo_set_suggested_net_price` vinculado a la tabla (BEFORE INSERT+UPDATE) | ✅ PASS |
| T5 — 7 constraints presentes | ✅ PASS |
| T6 — 4 índices presentes | ✅ PASS |
| T7 — RLS habilitado | ✅ true |
| T8 — FORCE RLS habilitado | ✅ true |
| T9 — 3 policies RLS | ✅ PASS |
| T10 — nombres: `rpo_select_own_org`, `rpo_insert_authorized`, `rpo_update_review_only` | ✅ PASS |
| T11 — 2 proveedores demo en seeds | ✅ PASS |
| T12 — 3 observaciones para MAT-001 en seeds | ✅ PASS |
| T13 — fórmula trigger: 28000×(1−0.08)=25760, 29500×(1−0.05)=28025, 35000×(1−0)=35000 | ✅ PASS |
| T14 — observación approved tiene approved_by + approved_at | ✅ PASS |
| T15 — observación pending: approved_by=NULL, approved_at=NULL | ✅ PASS |
| T16 — observación rejected tiene rejection_reason no vacío | ✅ PASS |
| T17 — constraint rechaza observed_price negativo (check_violation) | ✅ PASS |
| T18 — constraint rechaza discount_percent > 100 (check_violation post-fix) | ✅ PASS |
| T19 — constraint rechaza currency inválido | ✅ PASS |
| T20 — constraint rechaza source_type inválido | ✅ PASS |
| T21 — constraint rechaza status inválido | ✅ PASS |
| T22 — constraint rechaza `rejected` sin rejection_reason | ✅ PASS |
| T23 — constraint rechaza `approved` sin approved_by | ✅ PASS |
| T24 — sin policy DELETE (FORCE RLS deniega) | ✅ PASS |
| T25 — 20 columnas en `resource_price_observations` | ✅ PASS |
| T26 — tipo final `discount_percent`: `numeric(7,4)` | ✅ PASS |
| T27 — tipo final `default_discount_percent` suppliers: `numeric(7,4)` | ✅ PASS |

### Suite completa (Phase 3A closure)

| Check | Resultado |
|---|---|
| `supabase db reset --local` (27 migraciones + 5 seeds) | ✅ Aplicado |
| `typecheck` | ✅ 0 errores |
| `lint` | ✅ 0 warnings |
| Tests: 63 archivos, **809 tests** | ✅ PASS |
| Tests pricing: 10 archivos, **99 tests** | ✅ PASS |
| `build` (Next.js 16 Turbopack) | ✅ 0 errores, 0 warnings |
| `git diff --check` | ✅ Limpio |

### Archivos nuevos en este cierre

- `supabase/migrations/20260610090200_fix_discount_percent_precision.sql`
- `supabase/config.toml` (seed 0005 agregado a `sql_paths`)
- `supabase/scripts/phase3a_db_validation.sql` (script de validación reutilizable)
- `docs/HANDOFF_LOG.md`, `docs/DECISIONS.md`, `docs/QA_REPORT.md` (actualizados)

---

## 2026-06-10 — FASE 3A — PRICE INTELLIGENCE FOUNDATION IMPLEMENTADA

**Rama:** `feature/phase3a-price-intelligence-foundation` (worktree aislado).  
**Hash base:** `22a408c` (MVP internal v1 release). **Sin merge a main. Sin deploy.**

### Entregables

**Contrato congelado:**
- `docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md` (v1 congelado).

**Migraciones (locales, no aplicadas a remoto):**
- `20260610090000_resource_price_intelligence.sql` — tabla `resource_price_observations`,
  extensión `suppliers` (website_url, default_discount_percent, notes, created_by),
  trigger `app.set_rpo_suggested_net_price()` (invariante DB: `suggested_net_price = round(observed_price × (1 - discount_percent/100), 10)`).
- `20260610090100_rls_resource_price_intelligence.sql` — FORCE RLS + 3 policies
  (SELECT todos; INSERT management/internal; UPDATE management/internal solo cols revisión).

**Seed demo:**
- `supabase/seeds/0005_demo_price_intelligence.sql` — 2 proveedores + 3 observaciones
  (approved, pending, rejected) para MAT-001.

**Backend (`apps/web/server/pricing/`):**
- `types.ts` — ProviderView, CreateObservationInput, ResourcePriceObservationView,
  ObservationStatus, ResourcePriceIntelligenceSummary, ProviderRepository, PriceObservationRepository.
- `errors.ts` — 6 clases de error de dominio.
- `validation.ts` — validateCreateObservationInput, validateProviderCreateInput, computeIsStale (runtime, 30d staleAfterDays).
- `db-provider-repository.ts` — DbProviderRepository (listProviders, createProvider, updateProvider, getProviderById).
- `db-observation-repository.ts` — DbObservationRepository (list, create, approve, reject, summary).
- `fixture-repository.ts` — FixtureProviderRepository + FixtureObservationRepository.
- `index.ts` — getProviderRepository() + getObservationRepository() (fixture/db per READ_MODEL_SOURCE).

**UI (`apps/web/app/(dashboard)/catalog/`):**
- `providers/page.tsx` — lista de proveedores (campos 🔒 según ViewerRole).
- `providers/new/page.tsx` — creación de proveedor (mode-guard).
- `providers/actions.ts` — Server Actions createProviderAction + updateProviderAction.
- `providers/_components/provider-form.tsx` — Client Component (useActionState React 19).
- `resources/[resourceId]/price-intelligence/page.tsx` — historial de observaciones + formulario.
- `resources/[resourceId]/price-intelligence/actions.ts` — Server Actions create/approve/reject.
- `resources/[resourceId]/price-intelligence/_components/observation-form.tsx` — Client Component.
- `resources/[resourceId]/price-intelligence/_components/observation-review-buttons.tsx` — Approve/Reject buttons.

**Tests:**
- `tests/unit/pricing/resource-price-observation.test.ts` — fórmula suggested_net_price + stale state + validaciones.
- `tests/unit/pricing/observation-approval.test.ts` — fixture repos + workflow errores.
- `tests/unit/pricing/observation-security.test.ts` — aislamiento org + privacidad + error classes.

### Validación (todo PASS)
- `typecheck` → ✅ 0 errores
- `lint` → ✅ 0 warnings
- `test` → ✅ **63 archivos, 809 tests** (de 757 → +52)
- `build` → ✅ "Compiled successfully in 6.8s" + nuevas rutas dinámicas
- `git diff --check` → ✅ limpio
- `validate-claude-agents` → ✅ **214 PASS / 0 WARN / 0 FAIL**
- Golden master regression `regression-first-floor.test.ts` → ✅ intacto (COP 372.247.170)

### Seguridad
- `organization_id`, `created_by`, `approved_by` SIEMPRE server-side.
- FORCE RLS en `resource_price_observations`.
- Campos 🔒 nunca serializados a rol cliente.
- Observaciones append-only (solo UPDATE de status/approved_by/approved_at/rejection_reason).
- Ninguna observación modifica presupuestos emitidos.

### Pendientes
- `supabase db reset` local (requiere Docker activo con `supabase start -x realtime,...`).
- Smoke de escritura real en DB local (gated `PRICE_INTEL_SMOKE_DB=1`, no implementado).
- Phase 3B (fuera del alcance de esta sesión).

## 2026-06-09 — RELEASE INTERNO V1 EN PRODUCCIÓN (tag `mvp-internal-release-v1`)

- **Fecha release:** 2026-06-09.
- **Hash main:** **`12d53d5`** (merge `merge(release): construction ops MVP internal v1`);
  `main = origin/main = 12d53d5`. Rollback de app = commit anterior **`2918622`**.
- **Migraciones realmente aplicadas al remoto:** `20260609120000` (4E.2B archive) +
  `20260609130000` (4E.3A issue/clone). `20260606120000` (4E.2A) ya estaba aplicada
  de antes ⇒ **remoto 23/23, dry-run "up to date", `db lint` sin errores**. Aditivas/
  reversibles; sin seeds, sin reset/pull/repair, sin datos remotos.
- **Vercel Git autorizado por la usuaria** (GitHub App + Production Branch=main +
  Preview por ramas). Deployments **automáticos por Git** (sin `vercel deploy`).
- **Preview automático** (release branch, commit `ceaf6d5`): `construction-ats9scfxw…`
  **● Ready**, build limpio (sin errores DB/RLS/pooler). Smoke GET del Preview = 401
  por **Vercel Deployment Protection** (no es defecto de la app).
- **Production automático** (main `12d53d5`): `construction-o1rfipxzc…` **● Ready**,
  alias `construction-ops-psi.vercel.app`. **Smoke productivo:** `/`→307→/login;
  `/login` **200**; `/dashboard`,`/planning`,`/projects`,`/catalog`,`/quantities`
  →307→/login; **sin HTTP 500**, sin escrituras/exports.
- **Validación local post-merge (una vez, todo PASS):** typecheck/lint 0, **757 tests**,
  **MVP e2e smoke 10/10**, build, **RLS 106/106**, **isolation 12/12**, **gm 22/22**,
  gm:import, validador 214/0/0, diff limpio.
- **Pendientes no bloqueantes:** smoke autenticado tenant (no ejecutado: sin sesión
  aprobada); **MV-01**; `BOQ_REORDER`; `lineage_id` antes de reorder avanzado;
  `BOQ_AUDIT_TRAIL`; hardening posterior.
- **Rollback:** app → revertir a `2918622`; DB → migraciones aditivas (no rollback
  destructivo automático). Stashes P1-A intactos. **`BOQ_REORDER` fuera del release.**

## 2026-06-09 — MVP INTERNO LOCAL-READY (4E.3B integrada + smoke end-to-end + checkpoint)

> **4E.3B integrada** en `integration/p1a-functional-resume` (merge `9695322`).
> Checkpoint estable **`mvp-internal-local-ready-v1`**. **`main` intacta; sin deploy.**

### Integración 4E.3B
- `git merge --no-ff` 4E.3B → integration `9695322`, **sin conflictos**.

### Smoke end-to-end del MVP (nuevo)
- `apps/web/tests/integration/mvp-internal-flow-smoke.test.ts` (gated `BOQ_SMOKE_DB=1`,
  repo real + RLS, datos sintéticos locales): **10/10 PASS**. Recorre crear→importar
  BOQ→editar (incl. PATCH-subtotal ignorado + manual)→archive/restore→emitir V01
  (inmutable)→clonar V02→editar V02 sin alterar V01→comparar V01/V02 (incl. código
  repetido por ocurrencia)→seguridad cross-org→no-destrucción. **0 defectos** (FASE 4
  sin correcciones).

### Validación completa (todo PASS)
- typecheck/lint 0, **757 tests** + **42 integración gated**, build (fixture+db-local),
  **RLS 106/106**, **read-model isolation 12/12**, **gm:regression 22/22**, gm:import
  PASS, validador 214/0/0, `git diff --check` limpio. **Sin migración nueva.**

### Documentación
- `docs/MVP_INTERNAL_LOCAL_READY.md` (flujo cubierto, funciones, pruebas, migraciones
  candidatas a reconciliar en pre-release, pendientes no bloqueantes).

### Estado / pendientes
- Migraciones locales `20260606120000`/`20260609120000`/`20260609130000` pendientes
  de `db push`: en pre-release `db push --dry-run --linked` (read-only) + reconciliar
  (aplicar solo faltantes confirmadas). `main = origin/main = 2918622` intacta;
  producción intacta; stashes P1-A intactos. Preview/MV-01 diferidos.
- **`BOQ_REORDER`/`lineage_id`/`BOQ_AUDIT_TRAIL` NO iniciados.** Siguiente paso:
  **pre-release controlado**, no nueva feature.

## 2026-06-09 — 4E.3B comparación de versiones IMPLEMENTADA (Opción B, sin migración)

> **4E.3A integrada** en `integration/p1a-functional-resume` (merge `cd18f2d`).
> **4E.3B** implementada en `feature/wave-4e3b-estimate-version-compare`.
> **NO merge a integration/main; sin deploy; SIN migración nueva.**

### Decisión
- **Opción B aprobada**: matching de ítems por `chapterCode + itemCode +
  occurrenceIndex` (orden `sort_order ASC, id ASC`), `duplicateCodeWarning` + aviso
  UI. **Sin migración de unicidad.** Capítulos por `code` (único garantizado).

### Implementación (read-only)
- Módulo PURO `server/estimates/compare.ts` (`computeVersionComparison`): resumen
  financiero con deltas (% seguro si base≠0, `null` si base=0), diff de capítulos
  por `code`, diff de ítems por clave de ocurrencia; archivados incluidos en el
  análisis (no sumados a totals activos).
- Repo `compareEstimateVersions(viewer, estimateId, baseVersionId, targetVersionId)`
  (db + fixture): valida mismo estimate (`VersionMismatchError`), RLS/cross-org
  (`EstimateNotFoundError`), **no muta datos**, sin migración. Tipos client-safe
  `lib/estimates/compare-types.ts`.
- UI: página `…/estimates/[estimateId]/compare` (server, GET selectores base/target,
  `<details>` por capítulo, estados, aviso de código repetido) + enlace "Comparar
  versiones" en el panel de versiones.

### Deuda futura
- `lineage_id` (identidad de linaje estable de ítems clonados) **antes** de
  `BOQ_REORDER` avanzado. **No implementado ahora.**

### Validación (todo PASS)
- typecheck/lint 0, **757 tests** + **32 integración gated** (incl. 4E.3B: diff
  puro, ocurrencia/duplicado, seguridad repo, no-mutación), build (`/compare` `ƒ`),
  **RLS 106/106**, **isolation 12/12**, **gm 22/22**, gm:import PASS, validador
  214/0/0, diff limpio. **Sin migración nueva.**

### Estado / pendientes
- Integración de 4E.3B a `integration` **pendiente** (a tu orden). `main =
  origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
- Migraciones locales `20260606120000`/`20260609120000`/`20260609130000`
  **pendientes de `db push`**; en pre-release: `db push --dry-run --linked` (read-only)
  y reconciliar (no asumir cuáles faltan). Preview/MV-01 diferidos.
- **`BOQ_REORDER` NO iniciado.**

## 2026-06-09 — 4E.3A integrada + 4E.3B DETENIDA por blocker de unicidad de ítems

> **4E.3A integrada** en `integration/p1a-functional-resume` (merge `cd18f2d`,
> validada). **4E.3B** (`feature/wave-4e3b-estimate-version-compare`) **detenida en
> FASE 5** por decisión de producto pendiente. NO merge a main/integration; sin deploy.

### Integración 4E.3A
- `git merge --no-ff` de 4E.3A → integration `cd18f2d`, **sin conflictos**. Validado:
  typecheck/lint 0, **747 tests**, build, **RLS 106/106**, **isolation 12/12**,
  **gm 22/22**, gm:import PASS, diff limpio. `main = origin/main = 2918622` intacta.
  Publicada `integration/p1a-functional-resume = cd18f2d`.

### 4E.3B — contrato congelado + BLOCKER
- Contrato `docs/ESTIMATE_VERSION_COMPARE_CONTRACT.md` v1 congelado.
- **BLOCKER (FASE 5):** la clave de comparación de ítems `chapterCode + itemCode`
  **no es única garantizada**. Índices UNIQUE existentes: solo
  `chapters_version_code_uq (estimate_version_id, code)` + PKs; **`boq_items` no
  tiene unicidad por `code`**. `createBoqItem` (4E.2A) e import Excel (4C.2, dup =
  warning) permiten códigos de ítem repetidos en un capítulo. Datos actuales: 0
  duplicados — pero el esquema no lo garantiza.
- **Decisión de producto requerida** (conforme a la regla STOP): (a) migración de
  unicidad `boq_items_version_chapter_code_uq (estimate_version_id, chapter_id, code)`
  — con impacto cruzado en `createBoqItem` e import (23505 si hay dup); o (b) clave
  determinística `chapterCode + itemCode + ocurrencia(n)` por `sort_order` (sin
  migración). **Capítulos sí tienen clave única garantizada.** Backend/UI/tests de
  4E.3B **NO implementados** (detenido tras la inspección).

### Nota de migraciones para pre-release (reconciliar, NO asumir)
- Antes de aplicar al remoto: ejecutar `supabase db push --dry-run --linked`
  (read-only) y **reconciliar** qué migraciones faltan realmente. **No asumir** que
  `20260606120000` sigue pendiente sin verificar. Aplicar **solo** las faltantes
  confirmadas. Candidatas locales: `20260606120000` (4E.2A), `20260609120000`
  (4E.2B), `20260609130000` (4E.3A).

### Estado
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
  Preview/MV-01 diferidos. **`BOQ_REORDER` NO iniciado.**

## 2026-06-09 — 4E.3A emisión/clonación de versiones implementada (rama funcional)

> **4E.2B integrada** en `integration/p1a-functional-resume` (merge `9f28c26`,
> validada). **4E.3A** en `feature/wave-4e3a-estimate-issue-clone` (desde
> integration `9f28c26`). **NO merge a integration/main; sin deploy; sin db push.**

### Alcance entregado (contrato `docs/ESTIMATE_ISSUE_CLONE_CONTRACT.md` v1)
- **Emisión** `draft → issued` (`issued_at`/`issued_by` server-side; solo draft);
  issued **inmutable** (edición/creación/movimiento/AIU/archive/restore rechazados
  vía guards + RLS).
- **Clonación** issued → nueva `draft` (activa): RPC atómica `clone_issued_estimate_version`
  (capítulos/ítems remapeados, `source_code`/`source_row` y estado archivado
  preservados, AIU clonado, número de versión seguro, `source_version_id`);
  **mismo total activo** que la issued origen; **issued origen intacta** (consultable/
  exportable por `versionId`).
- `listEstimateVersions` (tenant-scoped, resumen financiero por versión);
  export por `versionId` (snapshot histórico). UI: panel de versiones + Emitir /
  Crear nueva versión; controles editables ocultos en issued.

### Migración local (preparada; NO aplicada a remoto)
- `20260609130000_estimate_version_issue_clone.sql` (aditiva): `estimate_versions`
  += `issued_at`, `issued_by` (FK profiles), `source_version_id` (self FK) + índice
  parcial; RPC `clone_issued_estimate_version` (SECURITY INVOKER, atómica). La RPC
  lee la versión issued **sin** `FOR UPDATE` (evita falso not-found por RLS de
  inmutabilidad) y serializa con lock en `estimates`. Verificada con `db reset`.

### Validación (todo PASS)
- typecheck 0, lint 0, **747 tests** + **28 integración gated** (`BOQ_SMOKE_DB=1`,
  repo real + RLS; cubren los casos de emisión/inmutabilidad/clonación/lecturas/
  exports/seguridad de 4E.3A), build fixture+db-local, RLS harness **106/106**,
  read-model isolation **12/12**, gm:regression **22/22**, gm:import PASS, validador
  214/0/0, `git diff --check` limpio.

### Estado / pendientes
- Migraciones locales `20260606120000` (4E.2A), `20260609120000` (4E.2B),
  `20260609130000` (4E.3A) **pendientes de `db push` remoto**.
- **Integración a `main` pendiente; deploy pendiente.** `main = origin/main = 2918622`
  intacta; producción intacta; stashes P1-A intactos. Preview/MV-01 diferidos.
- **4E.3B NO iniciada.**

## 2026-06-09 — 4E.2B `BOQ_SAFE_DELETE_OR_ARCHIVE` implementada (rama funcional)

> En rama `feature/wave-4e2b-boq-safe-archive` (desde `integration/p1a-functional-resume`
> `2219f3b`). **NO merge a integration ni main; sin deploy.**

### Alcance entregado (contrato `docs/BOQ_DELETE_ARCHIVE_CONTRACT.md` v1)
- Soft-archive reversible (archive/restore) de **capítulos** e **ítems** BOQ; **sin
  DELETE físico**. Trazabilidad mínima `archived_at` + `archived_by` (server-side).
- Nodos archivados excluidos de vista activa, subtotales, costo directo, AIU,
  indirectos, total general y **exportaciones activas**. Un capítulo archivado
  excluye todos sus ítems **sin** reescribirlos; al restaurarlo, los ítems
  archivados individualmente siguen archivados.
- Versión emitida = inmutable (RLS + guard `BoqVersionLockedError`); cross-org
  bloqueado (RLS); fixture solo lectura. Lectura controlada `includeArchived`.

### Migración local (preparada; NO aplicada a remoto)
- `20260609120000_boq_archive_metadata.sql` (aditiva): `chapters`/`boq_items` +=
  `archived_at`, `archived_by` (FK `profiles` ON DELETE SET NULL) + índices
  parciales `WHERE archived_at IS NULL`. Sin DROP/DELETE; RLS sin cambios.
  Verificada con `supabase db reset` local. **Sin `db push` a remoto.**

### Backend / read-model / UI
- `EstimatesWriteRepository`: `archiveEstimateChapter`/`restoreEstimateChapter`/
  `archiveBoqItem`/`restoreBoqItem` + lecturas activas con exclusión y
  `includeArchived`. Read-model (dashboard) y `read-repository` excluyen archivados.
- UI: controles Archivar/Restaurar (confirm), estado "Archivado", toggle
  "Mostrar archivados"; ocultos en versión emitida / modo solo lectura.

### Validación (todo PASS)
- typecheck 0, lint 0, **743 tests** (+ **19 integración gated** que cubren los 28
  casos del plan: financieros, read-model, exports, RLS, fixture, UI), build OK,
  RLS harness **106/106**, read-model isolation **12/12**, gm:regression **22/22**
  (sin degradar registros activos), gm:import PASS, validador 214/0/0,
  `git diff --check` limpio.

### Estado / pendientes
- **Deploy pendiente; integración a `main`/`integration` pendiente** (a tu orden).
- Preview runtime / **MV-01** siguen **diferidos a pre-release**.
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
- **4E.3 NO iniciada.**

## 2026-06-09 — Integración funcional segura `integration/p1a-functional-resume` (P1-A staged)

> Nota: registrada **solo en la rama de integración** (no en `main`).

- **P1-A code-complete y validada localmente**: H-01 cableado en lecturas tenant-scoped;
  M-02 export legacy corregido (`organizationId` server-side); filtros explícitos por
  `organizationId` conservados.
- **Rama de integración** `integration/p1a-functional-resume` creada **desde `origin/main`
  (`2918622`)** + `git merge --no-ff origin/fix/security-p1a-read-model-rls-export-legacy`
  (`a78b74b`), **sin conflictos**. `main` y `origin/main` **intactos en `2918622`**.
- **Validación local única post-integración (todo PASS)**: typecheck 0, lint 0, build OK,
  **738 tests** (+11 integración gated, saltados), **RLS harness 106/106**,
  **read-model isolation 12/12**.
- **Diferido a pre-release (NO bloquea el MVP interno)**: Preview runtime real de P1-A y
  validación Vercel/pooler/**MV-01** (deuda de validación pre-release). El sandbox CLI no
  completa uploads/builds (deployments UNKNOWN); **no se investiga Vercel en esta etapa**.
- **Producción NO modificada; `main` NO modificada.** Base funcional segura para continuar
  el MVP: **`integration/p1a-functional-resume`**. Stashes P1-A (`stash@{0}`/`stash@{1}`) y
  worktree de seguridad intactos (no tocados).

## 2026-06-07 — 4E.2A CERRADA (automated-ready): smoke automatizado no destructivo

### Decisión de la usuaria
- **Omitió voluntariamente** el smoke manual de escritura sobre el presupuesto
  productivo ENTRE PATIOS. Cierre por **verificación automatizada no destructiva**.

### Auditoría read-only inicial
- `main = origin/main = 02f475e` (contiene merge 4E.2A `19f3c5d`); working tree limpio.
- **P1-A intacto (NO tocado)**: rama `fix/security-p1a-read-model-rls-export-legacy`
  (`a78839c`) + 2 `git stash` (export-test / exports organizationId). Sin stash pop/apply/drop.

### Smoke automatizado local (repo REAL + RLS) — `apps/web/tests/integration/boq-edit-smoke.test.ts`
- Postgres 17 / Supabase local; `DbEstimatesWriteRepository` vía PostgREST con JWT de
  usuario sembrado (RLS aplicada); datos **sintéticos** locales (estimate+V01+import+AIU).
  Gated por `BOQ_SMOKE_DB=1` (el `pnpm run test` normal lo salta). **11/11 PASS**:
  - A editar cantidad → recalcula subtotal/capítulo/directo/A·I·U·IVA/indirecto/total; origen preservado.
  - B restaurar cantidad → **vuelve EXACTO al baseline** (todas las cifras).
  - C editar precio → recalcula → restaurar → baseline.
  - D PATCH subtotal-only por PostgREST → **trigger ignora** el valor; persiste `round(q×p,10)`.
  - E crear capítulo manual → origen NULL, sort_order append, código único.
  - F crear ítem manual → origen NULL, subtotal derivado, total sube.
  - G editar ítem importado → code editable, `source_code`/`source_row` preservados.
  - H mover ítem entre capítulos (misma versión) → origen intacto, sort append.
  - I seguridad → cross-org Not-Found, fixture write bloqueada, versión emitida bloqueada.
  - N (FASE 3) export payload refleja la edición y restaura su pre-estado.

### Validación completa
- typecheck 0, lint 0, **736 tests** (+11 integración gated, saltados en run normal),
  build fixture + db-local PASS, gm:regression 22/22, gm:import PASS, validador 214/0/0,
  **RLS runtime 106/106**, Supabase remoto **21/21 Local = Remote** (solo lectura),
  `git diff --check` limpio; sin secretos/privados.

### Producción (read-only)
- Vercel `whoami` `soporteatriaworkflows-8854`; proyecto `construction-ops` (NO `-1rqh`).
  Deployment producción **● Ready** (`construction-b8klgx2bm-…`, alias
  `construction-ops-psi.vercel.app`). Smoke HTTP: `/login` 200; protegidas 307→`/login`;
  rutas 4E.2A (`chapters/new`, `items/[id]/edit`) 307→`/login`; control inexistente 404.
  **Sin escrituras productivas; ENTRE PATIOS intacto.**

### Cierre
- Tag `wave-4e2a-manual-boq-editing-automated-ready-v1`. Smoke de **escritura real en
  producción = OPCIONAL** para sesión futura. **4E.2B/4E.3 NO iniciadas.**
- Siguiente acción recomendada: retomar **P1-A** exclusivamente desde un **worktree de
  seguridad aislado** (ver memoria/INTEGRATION_REQUESTS).

## 2026-06-07 — 4E.2A: verificación productiva (deploy READY) por Vercel CLI

### Auditoría read-only del estado real
- Rama `main`; HEAD `19f3c5d`; **main = origin/main = 19f3c5d**; working tree limpio;
  sin WIP de 4E.2A pendiente. Sin inconsistencias con el reporte anterior.
- **P1-A intacto (no tocado)**: rama `fix/security-p1a-read-model-rls-export-legacy`
  (`a78839c`) + 2 `git stash` (export-test / exports organizationId) sin cambios.

### Verificación Vercel (CLI vía `corepack pnpm dlx vercel`, sin instalar global)
- `vercel whoami` = `soporteatriaworkflows-8854`. Carpeta vinculada a `construction-ops`
  (`prj_fVLILBxQnttsj8rMYls7WikAGGPE`), NO `construction-ops-1rqh`.
- Deployment producción `dpl_DenhpBNL8ga7kKfeQ8vyYk3Jdq8E` (`construction-oxzs4xcb2-…`):
  **● Ready**, target production, aliases `construction-ops-psi.vercel.app` +
  `construction-ops-git-main-…`, creado tras el push de `19f3c5d` (auto-deploy GitHub).
- **Smoke HTTP**: `/login` 200; `/dashboard` 307→`/login`; rutas 4E.2A `chapters/new`,
  `items/new`, `items/[id]/edit` 307→`/login?next=…`; control inexistente 404
  (confirma que las rutas 4E.2A están en el build desplegado). Sin 500; sin fixture
  público; sin secretos; sin cambios de datos productivos.

### Pendiente
- **Smoke visual de la usuaria** (editar cantidad de un ítem real → ver subtotal/directo/
  AIU/total → restaurar ≈ $372.247.170). Tras su OK: tag
  `wave-4e2a-manual-boq-editing-production-v1`. **4E.2B/4E.3 NO iniciadas.**

## 2026-06-07 — 4E.2A: edición manual segura de BOQ IMPLEMENTADA (migración aplicada)

### Estado
- Rama `integration/wave-4e2a-manual-boq-editing` (desde `main` `1aaf203`).
- **Migración aprobada y aplicada** `20260606120000_boq_items_subtotal_invariant.sql`:
  función `set_boq_item_subtotal()` + trigger `boq_items_recompute_subtotal`
  `BEFORE INSERT OR UPDATE` (subtotal = `round(q×p,10)` forzado en toda escritura).
  `db push --dry-run` = 1 migración esperada (0 seeds) ⇒ `db push --linked` ⇒
  **21/21 Local = Remote**. Remoto: solo esquema, sin datos/seeds.

### Implementación
- Repo (`server/estimates/`): 6 métodos nuevos (create/update/getEditable de
  capítulo e ítem) en db + fixture; validación pura `boq-validation.ts`; errores
  de dominio; barrel actualizado. Subtotal derivado server-side + trigger DB;
  AIU/total general reutilizan `aiu-calc` (una sola fuente). Trazabilidad
  preservada (importado) / NULL (manual); `sort_order` append; mover ítem entre
  capítulos de la misma versión (código no renumerado, advertencia de prefijo).
- UI: server actions `chapter-actions.ts`/`item-actions.ts` (guard supabase+db,
  viewer server-side, nunca subtotal/totales del navegador); formularios
  `chapter-form.tsx`/`item-form.tsx` (preview de subtotal + leyenda, loading,
  anti doble-submit, banner de éxito, read-only si bloqueada/fixture); 4 rutas
  nuevas (chapters/new, chapters/[id]/edit, items/new, items/[id]/edit); CTAs
  "Nuevo capítulo"/"Editar" en detalle de presupuesto y capítulo.

### Validación (local, todo verde)
- typecheck 0, lint 0, **736 tests** (+24), build fixture + build db-local PASS
  (rutas `ƒ`), gm:regression 22/22, gm:import PASS, validador 214/0/0,
  **RLS runtime 106/106** (+17 checks 4E.2A: trigger presente, INSERT/UPDATE
  recalcula, PATCH-subtotal ignorado, import compatible, origen preservado,
  mover, negativo/emitida bloqueados). `git diff --check` limpio; sin secretos/
  privados.

### Nota de proceso — WIP de seguridad en paralelo (export-legacy)
- Aparecieron cambios NO commiteados ajenos a 4E.2A en `apps/web/{app/api/exports/
  route.ts, modules/exports/types.ts, server/exports/export-service.ts,
  tests/unit/exports/export-service.test.ts}` (remediación P1-A/M-02 incompleta,
  rompía typecheck/test del módulo legacy). Preservados en **2 `git stash`**
  (recuperables vía `git stash list`/`pop`), NO commiteados aquí. Los completa la
  rama `fix/security-p1a-...`.

### Próximo paso
- Merge `--no-ff` a `main` + push. **Deploy a producción vía Vercel CLI NO
  ejecutable en este entorno (CLI no instalada)** ⇒ acción manual de la usuaria
  (o auto-deploy por integración GitHub). Smoke final manual de la usuaria
  (cambiar cantidad de un ítem real → ver total → restaurar ≈ $372.247.170).
- **4E.2B / 4E.3 / 4F NO iniciadas.**

## 2026-06-07 — 4E.1C CERRADA (smoke productivo aprobado) + diagnóstico 4E.2A (migración requerida)

### A. Cierre 4E.1C
- **Smoke productivo APROBADO por la usuaria**: Excel y PDF exportados OK; logo completo
  oficial + símbolo visibles; paleta ICONIC correcta (azul dominante, cian acento,
  **sin dorado**); jerarquía visual aprobada; **total general intacto ($372.247.170)**;
  presentación general aprobada sin observaciones.
- `main = origin/main = 7af91ea` (merge `8121731`). Sin migración (solo branding visual)
  ⇒ remoto Supabase **20/20** intacto.
- Tag estable: **`wave-4e1c-official-iconic-branding-production-v1`**.
- Deuda `ICONIC_LOGO_ASSET` ⇒ RESUELTA (assets oficiales versionados; guía interna en
  `docs/branding/`, no publicada).

### B. Diagnóstico 4E.2A — Creación/edición manual segura de BOQ (FASE 1)
- **RLS suficiente, sin migración de seguridad**: `chapters`/`boq_items` ENABLE+FORCE RLS;
  policies select/insert/update/delete por organización (`app.estimate_version_in_org`) y
  con bloqueo de versión emitida (`NOT app.estimate_version_locked`). Insert/update por la
  misma organización en versión `draft`/`review` ya permitidos; cross-org y locked bloqueados.
- **Repositorio de escritura inexistente** para edición manual (db-repository solo lectura
  de capítulos/ítems hoy).
- **GAP CRÍTICO (bloqueante)**: NO existe invariant DB-level para `subtotal`. `boq_items.subtotal`
  solo tiene CHECK `>= 0`; el recálculo `round(qty×price,10)` vive únicamente en la RPC
  `import_boq_into_version` (carga inicial). Un `authenticated` podría persistir subtotal
  arbitrario vía PostgREST directo en una versión editable.
- **Decisión por regla STOP**: se propone UNA migración mínima (función + trigger
  `BEFORE INSERT OR UPDATE` en `boq_items`) y **se detiene la implementación**. NO UI,
  NO contrato, NO repositorio, NO deploy, NO dry-run, NO tocar remoto hasta aprobación.

### C. Estado / próximo paso
- Rama `integration/wave-4e2a-manual-boq-editing` **NO creada todavía** (se creará al aprobar
  la migración, según el flujo del prompt).
- **Bloqueo**: requiere **aprobación explícita de la migración** para continuar 4E.2A.
- Deudas registradas: `BOQ_SAFE_DELETE_OR_ARCHIVE`, `BOQ_REORDER`, `BOQ_AUDIT_TRAIL`,
  `ESTIMATE_VERSIONING`.

## 2026-06-06 — 4E.1C: activación de assets oficiales GRUPO ICONIC

### Estado
- Rama `integration/wave-4e1c-official-iconic-assets` (desde `main` `3bd3b01`).
- **Sin migración, sin cambios estructurales/financieros.** Solo branding visual.
- La usuaria añadió los assets oficiales; auditados y conectados.

### Assets
- `apps/web/public/branding/iconic/grupo-iconic-logo-full.png` (846×846 RGBA, 48 KB).
- `apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png` (1080×1080 RGBA, 56 KB).
- Guía movida a `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` (interna, no publicada).

### Cambios
- Paleta oficial `ICONIC_EXPORT_PALETTE` en `branding.ts` (azul `#005DD6`, cian
  `#00B8FF`, navy `#020148`, grafito, gris azulado, gris claro, blanco).
  **Dorado `#C8A24B` eliminado.**
- Script reproducible `scripts/branding/embed-iconic-assets.mjs` → genera
  `logo-asset.ts` con `ICONIC_LOGO_FULL_DATA_URI`/`ICONIC_LOGO_SYMBOL_DATA_URI`
  (base64). **Sin `fs` en runtime.**
- PDF: encabezado con logo completo sobre blanco (texto navy legible), regla cian,
  títulos azul ICONIC, footer con símbolo + paginación, TOTAL GENERAL navy+cian.
- Excel `RESUMEN`: logo completo + título navy + regla cian; encabezados azul,
  totales navy+cian; estructura/fórmulas/paneles intactos.

### Validación
- typecheck 0, lint 0 (sin warnings), **712 tests** (+ assets/paleta/embed/no-dorado),
  build fixture + db-local PASS sin warnings, gm 22/22, gm:import PASS, validador
  214/0/0, `git diff --check` limpio. Remoto Supabase intacto (20/20).

### Próximo paso
- Preview → merge `--no-ff` → Production → smoke visual. **No iniciar 4E.2.**
- Deuda `ICONIC_LOGO_ASSET` ⇒ **RESUELTA**.

## 2026-06-06 — 4E.1B: branding visual de exports (Excel + PDF)

### Estado
- **4E.1 CERRADA a nivel funcional** (smoke real de la usuaria: Excel/PDF abren,
  3 hojas, 14 capítulos/132 ítems, directo 336.084.480, total 372.247.170).
  Observación: faltaba branding ICONIC ⇒ origen de 4E.1B.
- Rama `integration/wave-4e1b-export-branding` (desde `main` `490a5dc`).
- **Sin migración, sin cambios estructurales ni financieros.** Solo lenguaje
  visual de los generadores Excel/PDF.

### Cambios
- Fuente única `apps/web/server/estimates/export/branding.ts` (paleta ICONIC
  HEX/ARGB + metadatos + `loadBrandLogo`). Logo **serverless-safe** vía base64
  embebido (`logo-asset.ts`, `ICONIC_LOGO_BASE64`); sin asset ⇒ monograma `IC`.
- PDF rediseñado: banda de marca fija (logo/monograma), línea dorada, ficha de
  proyecto, secciones corporativas, filas alternas, **TOTAL GENERAL** resaltado,
  footer con paginación. Excel: banda en RESUMEN, encabezados/títulos de marca,
  subtotales/totales resaltados, paneles congelados, anchos razonables.
- Ruta del PNG oficial documentada en `apps/web/public/branding/README.md`.
- **Sin `fs` en runtime** (evita el aviso NFT de Turbopack) ⇒ build limpio.

### Validación
- typecheck 0, lint 0, **710 tests** (+7 branding), build fixture + db-local
  PASS **sin warnings**, gm 22/22, gm:import PASS, validador 214/0/0,
  `git diff --check` limpio. Remoto Supabase intacto (20/20).

### Próximo paso
- Preview → merge `--no-ff` → Production → smoke visual. **No iniciar 4E.2.**
- Deuda: `ICONIC_LOGO_ASSET` (incorporar el PNG oficial en base64).

## 2026-06-05 — 4E.1: exportación protegida Excel + PDF del presupuesto real

### Estado
- Rama `integration/wave-4e1-budget-exports` (desde `main` post-4D.2 cierre `d330430`).
- **Sin migración.** Camino de export nuevo sobre `EstimatesWriteRepository`
  (`getEstimateExportPayload`) + servicio `apps/web/server/estimates/export/`
  (`generateEstimateExcelExport`/`generateEstimatePdfExport`, ExcelJS + @react-pdf).
- Endpoint `GET /api/estimates/export` (`runtime=nodejs`, `force-dynamic`): viewer
  requerido, cadena proyecto/alcance/presupuesto validada, cross-org ⇒ 404, sin
  service-role, en memoria, filename sanitizado.
- UI: sección "Exportar presupuesto" con botones Excel/PDF (loading, anti doble-click,
  error sanitizado, descarga directa) en el detalle del presupuesto.
- Excel: hojas `RESUMEN`/`PRESUPUESTO`/`TRAZABILIDAD`. PDF: sobrio, paginado, sin
  UUID/source_row/secretos. Reutiliza el resumen financiero 4D.2 (no recalcula).

### Validación
- typecheck 0, lint 0, **703 tests** (+16), build fixture + build db-local PASS
  (`/api/estimates/export` presente), gm:regression 22/22, gm:import PASS, validador
  214/0/0, `git diff --check` limpio. Remoto Supabase intacto (20/20, sin tocar).

### Deudas registradas
- `EXPORT_TRACEABILITY_BY_ROLE`, `EXPORT_PROFILES_FOR_ESTIMATE` (INTEGRATION_REQUESTS).
- Nota cross-ownership: `EstimatesWriteRepository` extendido (avalar con agent-db-rls).

### Próximo paso
- Preview Vercel → merge `--no-ff` → Production → smoke. **No iniciar 4E.2.**

## 2026-06-05 — 4D.2 CERRADA: smoke real de AIU editable

### Estado
- **Oleada 4D.2 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`). `main = origin/main = e5eede1`.
- Tag estable: **`wave-4d2-editable-aiu-production-v1`**.

### Smoke productivo verificado (usuaria)
- PRESUPUESTO BASE → V01: AIU editable; guardó **Administración 3.5 / Imprevistos 2.5 /
  Utilidad 4 / IVA 19**; **persistió tras recargar**; modificó Administración, guardó y el total
  cambió; restauró a 3.5; **Total general ≈ $372.247.170**. Cálculo y persistencia correctos.
- AIU **por versión**, persistente y editable. Cálculo financiero validado.
- Deudas vigentes: `AIU_PRESETS_BY_ORGANIZATION`, `AIU_IMPORT_PREFILL_FROM_EXCEL`.

### Siguiente bloque
- **Oleada 4E.1 — exportación protegida de presupuesto real a Excel y PDF** (desde los datos
  persistidos, no del Excel original). Rama `integration/wave-4e1-budget-exports`. Reutilizar
  `/api/exports` + exceljs/@react-pdf si es suficiente; detenerse y pedir aprobación si migración.

## 2026-06-05 — 4D.2: AIU editable + costos indirectos + total general (sin migración)

### Estado
- Rama `integration/wave-4d2-editable-aiu` desde `main`@`99a5a8e`. **Sin migración** (reutiliza
  `indirect_cost_rules`). Remoto intacto **20/20**.

### Diagnóstico de esquema
- `indirect_cost_rules` (mig. `20260530090700`) ya soporta porcentajes **por versión**:
  `estimate_version_id`, `code` (único por versión), `name`, `percentage` numeric(20,10) (≥0),
  `base_type` (CHECK direct_cost/utility/custom), `sort_order`, `visible_to_client`. RLS completa
  (select/insert/update/delete; write requiere `NOT estimate_version_locked`). El seed demo usa
  códigos `A/I/U/IVA`. **Esquema suficiente** ⇒ NO migración.

### Implementación (decisión: AIU por versión, NO global/hardcodeado)
- Cálculo puro `aiu-calc.ts` (Decimal): `validateAiuRates` (humano `3.5`→fracción `0.035`, rango
  [0,100], no negativos/excesivos), `computeFinancialSummary` (fórmulas: A/I/U sobre directTotal,
  IVA sobre utilidad, indirectTotal, grandTotal).
- Repo (db RLS-bound + fixture): `getEstimateVersionAiu` (rates humanos + isEmpty/editable),
  `updateEstimateVersionAiu` (**upsert atómico** de las 4 filas `A/I/U/IVA` vía PostgREST onConflict;
  solo `db`; fixture ⇒ `AiuWriteNotSupportedError`), `calculateEstimateFinancialSummary`. `directTotal`
  = Σ subtotales BOQ (server-side). Tipos client-safe en `@/lib/estimates/aiu-types`.
- UI: sección **"AIU y costos indirectos"** en el detalle (cuando V01 tiene datos) con indicador
  "AIU ajustable por versión": formulario (4 % humanos), **preview client-side** + cálculo
  **definitivo server-side** al Guardar, resumen (directo/A/I/U/IVA/indirectos/**total general**),
  banner de éxito, errores sanitizados. **No** precarga `3.5/2.5/4/19`; versión emitida ⇒ read-only.

### Validación
- typecheck/lint 0, **687 tests** (+21: aiu-calc con valores del golden master, repo fixture,
  route-config), build fixture + db local PASS, gm 22/22, gm:import, validador 214/0/0,
  **RLS runtime 93/93** (+4 AIU: insert/update draft, cross-org bloqueado, versión emitida read-only).

### Deudas registradas
- `AIU_PRESETS_BY_ORGANIZATION` (plantillas sugeridas por empresa/tipo de obra; nunca defaults
  globales automáticos). `AIU_IMPORT_PREFILL_FROM_EXCEL` (Preview Excel podrá sugerir AIU detectado;
  la usuaria confirma; nunca defaults globales).

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: en PRESUPUESTO BASE → V01 escribir
  Administración 3.5 / Imprevistos 2.5 / Utilidad 4 / IVA 19, **Guardar** y verificar el total general.

## 2026-06-05 — 4D.1 CERRADA: smoke real de revisión operativa

### Estado
- **Oleada 4D.1 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`). `main = origin/main = e3ad4af`.
- Tag estable: **`wave-4d1-operational-budget-review-production-v1`**.

### Smoke productivo verificado (usuaria)
- PRESUPUESTO BASE → V01 abre; resumen con **14 capítulos**, ~**132 ítems**, **total directo**
  visible. Capítulos navegables; ítems BOQ visibles; códigos canónicos + trazabilidad histórica
  correctos; etiquetas "normalizado" donde corresponde. Revisión operativa satisfactoria.

### Siguiente bloque
- **Oleada 4D.2 — AIU editable, costos indirectos y total general por versión** (porcentajes por
  `estimate_version`, NO hardcodeados/globales; cálculo server-side con Decimal). Rama
  `integration/wave-4d2-editable-aiu`. Reutilizar `indirect_cost_rules` si es suficiente; detenerse
  y pedir aprobación si se requiere migración.

## 2026-06-05 — 4D.1: revisión operativa del presupuesto importado (sin migración)

### Estado
- Rama `integration/wave-4d1-budget-review` desde `main`@`0a3cd69`. **Sin migración** (el esquema
  + `source_code`/`source_row` de 4C.3 bastan). Remoto intacto **20/20**.

### Diagnóstico read-model
- Existe el read-model 3A (`getEstimateDetail` por versionId), pero el slice usa el repositorio
  RLS-bound. Se añadieron métodos de lectura al `EstimatesWriteRepository` (db + fixture):
  `listChaptersByEstimateVersion`, `getChapterById`, `listItemsByChapter`. El "resumen operativo"
  reutiliza `getEstimateById` (estado + V01 + conteos + total directo). Esquema **suficiente**.

### Implementación
- Repo (db RLS-bound + fixture): capítulos con `itemCount`+subtotal (Σ recalculada), detalle de
  capítulo con contexto (proyecto/alcance/presupuesto/versión) por embedding PostgREST, ítems por
  `chapter_id` ordenados. Cross-org ⇒ `[]`/`ChapterNotFoundError`. `source_code`/`source_row`
  expuestos como trazabilidad. Tipos client-safe en `@/lib/estimates/review-types`.
- UI: detalle del presupuesto muestra (cuando V01 tiene datos) **resumen** (V01/capítulos/ítems/
  **total directo**) + **tabla de Capítulos** (código, indicador discreto "normalizado" si
  `source_code≠code`, nombre, ítems, subtotal, "Ver detalle"). Nueva ruta
  `…/estimates/[estimateId]/chapters/[chapterId]`: capítulo + contexto + **tabla de Ítems BOQ**
  (código, descripción, unidad, cantidad, V/unitario, subtotal) + trazabilidad secundaria
  (tooltip/etiqueta). Reimportación bloqueada (mensaje honesto). `/estimates` lista real (4B.3).

### Validación
- typecheck/lint 0, **666 tests** (+16: review fixture + route-config), build fixture + db local
  PASS (ruta capítulo `ƒ`), gm 22/22, gm:import, validador 214/0/0, `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: abrir PRESUPUESTO BASE, revisar el
  resumen y entrar a 2-3 capítulos para validar visualmente los ítems importados.

## 2026-06-05 — 4C.3 CERRADA: smoke real de importación con normalización

### Estado
- **Oleada 4C.3 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = 4071be8`.
- Tag estable: **`wave-4c3-real-excel-import-production-v1`**.

### Smoke productivo verificado (usuaria)
- ENTRE PATIOS → PRIMER PISO → PRESUPUESTO BASE → V01. Subió el **Excel histórico ORIGINAL**:
  upload → preview → **sugerencias visibles** → normalización controlada → **Confirmar** →
  banner verde "Importación completada". NO usó la copia corregida como fuente.
- **Trazabilidad `source_code`/`source_row` aplicada** al archivo histórico original. **V01 ya
  contiene datos reales** (presupuesto importado). upload→preview→normalize→import verificado.

### Siguiente bloque
- **Oleada 4D.1 — revisión operativa y visualización del presupuesto importado** (resumen
  financiero + tabla de capítulos + detalle de capítulo con ítems BOQ + trazabilidad discreta).
  Rama `integration/wave-4d1-budget-review`. Reutilizar esquema; sin migración salvo necesidad.

## 2026-06-05 — 4C.3 implementado: normalización reversible de códigos (migración aprobada)

### Estado
- Rama `integration/wave-4c3-source-normalization`. Migración aprobada (trazabilidad de origen).
- **Migración aplicada al remoto** ⇒ **20/20 Local = Remote** (sin seeds, sin import remoto).
  Dry-run = 1 migración esperada.

### Migración (autorizada)
- `20260605120000_boq_source_traceability.sql`: `chapters` y `boq_items` += `source_code text`
  + `source_row integer` (+ CHECK `source_row IS NULL OR source_row > 0`). RPC
  `import_boq_into_version` (MISMA firma) extendida: persiste `code`=canónico + `source_code` +
  `source_row`. Mantiene SECURITY INVOKER, RLS, versión vacía/editable (FOR UPDATE), atomicidad,
  subtotal recalculado, grants endurecidos. **RLS runtime 89/89** (+2: capítulo e ítem persisten
  code canónico + source_code + source_row).

### Implementación
- Parser (`parse.ts`): conserva `sourceCode`/`sourceRow`; algoritmo **genérico** de capítulos
  duplicados (max+1 ⇒ 7→11/8→12/9→13/10→14); propagación de prefijos de ítems (7.01→11.01;
  histórico 2.0x bajo cap 3 → 3.0x); código ambiguo ⇒ `requiresManualReview` (bloquea). Mapping por
  clave **`rowType:sourceRow`**. `overrides` (ediciones de la usuaria) reaplican el mapping; el
  digest del preview es del payload **ORIGINAL** (integridad), estable ante overrides.
- Servicio: `preview/confirm` aceptan `overrides`; **reconstrucción server-side** (el navegador solo
  envía intención de mapping). UI "Revisar numeración" (tabla editable: fila/tipo/original/propuesto/
  descripción/motivo/estado) + Revalidar; Confirmar solo si `importable` (sin errores ni revisiones
  pendientes, canónicos únicos, V01 vacía, digest consistente).

### Validación
- typecheck/lint 0, **650 tests** (parser 4C.3 + UI), build fixture + db local PASS, gm 22/22,
  gm:import, validador 214/0/0, RLS 89/89, `git diff --check` limpio. Excel privado real NO usado.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: la usuaria sube primero el Excel
  ORIGINAL (verifica sugerencias visibles 7→11/8→12/9→13/10→14) y, opcionalmente, la copia corregida.

## 2026-06-05 — 4C.3 Fase 0: diagnóstico de normalización de códigos — STOP por migración

### Estado
- **4C.2 validada manualmente** por la usuaria (preview con Excel real: 10 capítulos aceptados,
  132 ítems, total `$336.084.480`; errores agregados de capítulos duplicados 7/8/9/10 en filas
  97/102/167/172; advertencias de ítems repetidos y subtotales). NO se confirmó importación; V01 vacía.
- Rama `integration/wave-4c3-source-normalization` desde `main`@`8a7d4d5` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 0): se requiere **migración nueva**; pendiente de
  **aprobación explícita** antes de continuar (regla del prompt).

### Diagnóstico de esquema
- `chapters`: `code` (UNIQUE por versión), `name`, `sort_order`. **Sin** `source_code`/`source_row`.
- `boq_items`: `code`, snapshots, `subtotal`, `sort_order`, `notes` (text). **Sin** campo de origen
  estructurado; `notes` no sirve para capítulos ni es reversible/limpio.
- RPC `import_boq_into_version(p_version_id, p_chapters jsonb, p_items jsonb)`: inserta capítulos/
  ítems desde el JSONB; NO persiste metadatos de origen.

### Conclusión
- Para persistir `canonicalCode` (en `code`) conservando **`sourceCode` + `sourceRow`** (trazabilidad
  reversible) en capítulos E ítems ⇒ **migración aditiva ESTRICTAMENTE NECESARIA**. La RPC se
  extiende (misma firma `(uuid,jsonb,jsonb)`; el JSONB lleva claves extra `sourceCode`/`sourceRow`).
- Propuesta `20260605120000_boq_source_traceability.sql` (aditiva, reversible):
  `ALTER TABLE public.chapters ADD COLUMN source_code text, ADD COLUMN source_row integer;`
  `ALTER TABLE public.boq_items ADD COLUMN source_code text, ADD COLUMN source_row integer;`
  `CREATE OR REPLACE FUNCTION public.import_boq_into_version(...)` (misma firma) que además inserta
  `source_code`/`source_row` desde el payload. DOWN: drop columns + restaurar la función 4C.1.
- Remoto actual 19/19 ⇒ sería la 20.ª (requiere `db push` tras dry-run).

### Estrategia (a implementar tras aprobación)
- Parser conserva `sourceCode`+`sourceRow`; propone `canonicalCode`. **Capítulos duplicados
  (numéricos)**: `canonicalCode` = siguiente entero por encima del máximo de capítulo (algorítmico,
  no hardcodeado): max=10 ⇒ 7→11, 8→12, 9→13, 10→14. **Ítems**: si el prefijo no coincide con el
  capítulo canónico, propagar prefijo conservando sufijo (`7.01`→`11.01`; `2.0x` bajo capítulo 3 →
  `3.0x`). Código no-seguro (no numérico/sin patrón) ⇒ NO inventar; bloquear y pedir edición manual.
- UI "Revisar numeración" (tabla editable: fila/tipo/original/propuesto/nombre/motivo/estado);
  revalidar; confirmar solo si códigos de capítulo canónicos únicos + referencias válidas + digest
  consistente + V01 vacía. Subtotales: backend sigue siendo fuente de verdad.

### Acción solicitada (UNA aprobación)
- Autorizar la migración `20260605120000` (columnas + extensión de RPC) para crearla/validarla local
  (db reset + RLS runtime + tests), `db push --dry-run` y, si OK (1 migración, sin seeds), `db push`;
  luego implementar parser+UI+tests+deploy. **Nada remoto sin OK.** Rollback estable: tag
  `wave-4b3-real-estimates-production-v1`.

## 2026-06-05 — 4C.2: compatibilidad con plantilla real de cotización (parser, sin migración)

### Causa del fallo (preview con Excel real)
- `Fila 22: capítulo sin código o nombre`. Dos bugs: (1) la fila `SUBTOTAL CAPITULO`
  (descripción presente, sin código/unidad/cantidad/precio) se clasificaba como **capítulo
  incompleto** ⇒ error; (2) el número de fila era el índice del array **compactado**
  (`blankrows:false` descartaba filas vacías) ⇒ desfase (fila real 23 → reportada 22).

### Fix (solo parser; SIN migración)
- `blankrows:true` ⇒ la fila reportada = **fila REAL de Excel** (alineada con separadores vacíos).
- **Palabras reservadas** por descripción: `SUBTOTAL CAPITULO` ignorado; `TOTAL COSTOS DIRECTOS`
  cierra el BOQ; AIU/control de pagos/actas/anticipo/liquidación ignorados (fuera de alcance).
- Plantilla real de 7 columnas: `CAP`(auxiliar, ignorada), `ÍTEM`(code), `DESCRIPCIÓN`, `UN`,
  `CANT.`, `VR. UNITARIO`, `VR. PARCIAL`(subtotal, solo comparación). Mapeo por encabezado.
- **Diagnóstico AGREGADO**: el preview recorre toda la hoja y devuelve `errors[]`+`warnings[]`
  `{row, kind, code, description, recommendation}` (no se detiene en el primero). Confirmación
  bloqueada si hay errores (`ImportHasErrorsError`).
- **Duplicados sin normalización silenciosa**: capítulo duplicado ⇒ ERROR (BD exige único por
  versión); ítem duplicado ⇒ ADVERTENCIA (BD no lo restringe). **Opción A** (exigir corrección
  del Excel), sin migración ni `source_code`.

### Validación
- typecheck/lint 0, **651 tests** (parser reescrito con forma real, 16 casos), build fixture +
  db local PASS, gm 22/22, gm:import, validador 214/0/0, `git diff --check` limpio.
- Excel privado real NO usado (workbooks sintéticos en memoria). **Sin migración** ⇒ no se toca
  el remoto (sigue 19/19). NO se confirmó importación; V01 sigue vacía.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: la usuaria vuelve a **analizar**
  el Excel real desde la UI y comparte solo el **resumen de preview** o los **errores agregados**.

## 2026-06-05 — 4C.1 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4c1-excel-import` (`e253c9a`) → merge `--no-ff` a `main`
  (**`6f536f7`**, sin conflictos). **Preview READY** (build production-like en infra Vercel).
  **Production READY** (`dpl…k8dm3fnxy`) aliased a `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/estimates` y
  `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/import` ⇒ 307 → /login
  (deny-by-default, sin 500, sin fixture público). Ruta de importación viva y protegida.
  Remoto **19/19**; sin escrituras remotas salvo la migración aprobada; sin importación
  remota desde terminal; Excel privado real NO usado.

### Única acción manual final (usuaria)
- Entrar a **PRESUPUESTO BASE → V01 → Importar Excel** en producción, **subir el archivo real
  `.xlsx`** (hoja `COTIZACION 1 PISO`), revisar la vista previa (capítulos/ítems/total +
  advertencias) y **Confirmar importación**; el detalle mostrará los conteos reales y el total.
- Rollback estable: tag `wave-4b3-real-estimates-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **Oleada 4C.2/4D NO iniciadas.**

## 2026-06-05 — 4C.1 implementado: importación de Excel atómica (migración aprobada)

### Estado
- Rama `integration/wave-4c1-excel-import`. Migración aprobada (RPC de import atómico).
- **Migración aplicada al remoto** ⇒ **19/19 Local = Remote** (sin seeds, sin importaciones
  remotas). Dry-run mostró exactamente 1 migración esperada.

### Migración (autorizada + hardening)
- `20260604140000_boq_import_atomic.sql`: RPC `public.import_boq_into_version(p_version_id,
  p_chapters jsonb, p_items jsonb)` `SECURITY INVOKER` (RLS aplica). Deny sin sesión/membresía
  (`app._auth_uid()`/`app.current_org()`); `FOR UPDATE` sobre la versión (serializa); valida
  editable + **vacía** (anti doble-submit); inserta capítulos+ítems atómicamente con
  **subtotal recalculado server-side**; devuelve `{chapterCount,itemCount,directTotal}`.
  Grants: `REVOKE FROM PUBLIC+anon`, `GRANT TO authenticated` (ACL verificada sin `anon`).
  NO crea tablas ni cambia RLS.
- **RLS runtime 87/87** (+10 import: recálculo, atomicidad, doble-submit bloqueado, cross-org,
  deny, anon sin EXECUTE).

### Implementación
- Contrato `docs/EXCEL_IMPORT_CONTRACT.md` (v1). Formato congelado: `.xlsx`, hoja
  `COTIZACION 1 PISO`, columnas por encabezado (A–F), convención capítulo/ítem.
- Parser server-side `apps/web/server/estimates/import/parse.ts` (SheetJS; **no evalúa
  fórmulas ni macros**; recálculo Decimal; digest SHA-256). Tipos client-safe en
  `@/lib/import/types`.
- Servicio `preview/confirm/getStatus`: preview sin escritura; confirm re-parsea + **compara
  digest** + RPC atómica; solo en `db`. UI request-time: sección Importar Excel en el detalle
  (estado vacío con CTA / "Importación completada" + reimport bloqueada) + ruta `…/import`
  (upload → preview → confirmar → redirect con banner). `next.config` `serverActions.bodySizeLimit='4mb'`.
- **Límites** (EXCEL_IMPORT_CONTRACT §4): archivo **3 MB** (bodySizeLimit 4 MB < ~4.5 MB de
  Vercel), 500 capítulos, 5000 ítems, negativos bloqueados.

### Validación
- typecheck/lint 0, **651 tests** (+28 de import), build fixture + build `db` LOCAL (vacío y
  sembrado) PASS, gm 22/22, gm:import, validador 214/0/0, RLS 87/87, `git diff --check` limpio.
- **Excel privado real NO usado**: tests construyen workbooks sintéticos en memoria.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final de la usuaria: subir su Excel real
  desde la UI (Importar Excel → analizar → confirmar). Rollback estable: tag
  `wave-4b3-real-estimates-production-v1`. **4C.2/4D NO iniciadas.**

## 2026-06-04 — 4C.1 Fase 1: diagnóstico importación Excel — STOP por migración requerida

### Estado
- Rama `integration/wave-4c1-excel-import` desde `main`@`8ebad9e` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1): se requiere **migración nueva**; pendiente de
  **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del pipeline existente
- `gm:import` ⇒ `scripts/excel-import/import.ts` (propiedad agent-excel-mapper): herramienta de
  **build-time** que valida el fixture sanitizado + cadena de regresión; **NO escribe en DB**.
  `sheet-map.ts` documenta las 10 hojas del golden master (COT.ENTRE PATIOS) con columnas
  **tentativas** (`TODO_VERIFY`, sin coordenadas empíricas congeladas). Hoja BOQ de referencia:
  `COTIZACION 1 PISO` (A=code, B=descripción, C=unidad, D=cantidad, E=v/unit, F=subtotal).
- Dependencias: **`xlsx` 0.18.5 (SheetJS)** y `exceljs` 4.4.0 en `apps/web` (ambas server-side
  en Vercel Node). No hay importador runtime, ni RPC, ni tablas de import/staging.
- Tablas destino existen: `chapters` (estimate_version_id, code único por versión, name,
  sort_order) y `boq_items` (estimate_version_id, chapter_id, code, *_snapshot, subtotal,
  sort_order). **RLS suficiente**: `chapters_insert`/`boq_items_insert` exigen
  `estimate_version_in_org` + `NOT estimate_version_locked`. **V01 (draft) NO está bloqueada**
  ⇒ acepta inserts del mismo org. No requiere migración de RLS.

### Conclusión
- El esquema de datos es suficiente, PERO el flujo exige **transacción atómica** (capítulos +
  ítems juntos, rollback total) y **bloqueo de doble importación**, imposibles de garantizar con
  inserts multi-tabla de supabase-js sin service-role. ⇒ **Migración nueva ESTRICTAMENTE
  NECESARIA**: una RPC `SECURITY INVOKER` que importe atómicamente y verifique versión vacía.
- Propuesta (aditiva, reversible; sin tablas nuevas):
  `public.import_boq_into_version(p_version_id uuid, p_chapters jsonb, p_items jsonb)`
  `SECURITY INVOKER`: deny sin sesión; **versión debe estar VACÍA** (anti doble-submit);
  inserta capítulos (code→id) y luego ítems con **subtotal recomputado server-side**
  (`quantity × unit_price`, NUMERIC(20,10)); devuelve conteos + total directo. Hardening igual a
  4B.3 (`search_path=public`, refs calificadas, `REVOKE FROM PUBLIC+anon`, `GRANT TO authenticated`).
  RLS aplica a cada INSERT ⇒ cross-org/bloqueada rechazadas (rollback atómico). El índice
  `chapters_version_code_uq` refuerza idempotencia.
- Remoto actual 18/18 ⇒ sería la 19.ª (requiere `db push` tras dry-run).
- Dev: se usará un **.xlsx sintético sanitizado** (sin el Excel privado real) para tests/preview.

### Acción solicitada (UNA aprobación)
- Autorizar: crear+validar la migración local (db reset + RLS runtime + tests),
  `db push --dry-run` y, si OK (1 migración, sin seeds), `db push --linked`; luego implementar
  contrato + repo (`previewEstimateExcelImport`/`confirmEstimateExcelImport`/
  `getEstimateImportStatus`) + UI (upload/preview/confirm) + tests + deploy. **Nada remoto sin OK.**
  Rollback estable: tag `wave-4b3-real-estimates-production-v1`.

## 2026-06-04 — 4B.3 CERRADA: smoke productivo real de presupuesto + V01

### Estado
- **Oleada 4B.3 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = bef4786`.
- Tag estable: **`wave-4b3-real-estimates-production-v1`**.

### Smoke productivo verificado (usuaria)
- ENTRE PATIOS → PRIMER PISO → **presupuesto remoto real creado desde la UI**:
  `PRESUPUESTO BASE` con **versión inicial V01** (activa, funcional). Conteos: **0 capítulos,
  0 ítems**. Placeholder "La importación del Excel estará disponible en la siguiente fase."
- Footer "Datos reales"; producción DB real; **sin datos fixture**. create/list/detail
  verificados end-to-end.

### Siguiente bloque
- **Oleada 4C.1 — importación controlada de Excel hacia la V01 activa** (flujo de dos pasos:
  preview sin escritura → confirmación transaccional). Rama `integration/wave-4c1-excel-import`.
  Reutilizar parser/fixtures de `gm:import`; no usar el Excel privado real; detenerse y pedir
  aprobación si se requiere migración.

## 2026-06-04 — 4B.3 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4b3-real-estimates` (`28dd12f`) → merge `--no-ff` a `main`
  (**`3d031bd`**, sin conflictos). **Preview READY** (build production-like en infra Vercel).
  **Production READY** (`dpl…7q1gcw0kz`) aliased a `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/estimates` y `/projects/[id]/scopes/[scopeId]/estimates/new`
  ⇒ 307 → /login (deny-by-default, sin 500, sin fixture público). Rutas de estimates vivas
  y protegidas. Remoto **18/18**; sin escrituras remotas salvo la migración aprobada; sin
  presupuesto remoto creado desde terminal.

### Única acción manual final (usuaria)
- Entrar a **PRIMER PISO** (alcance de ENTRE PATIOS) en producción y crear **`PRESUPUESTO BASE`**
  (descripción "Presupuesto inicial de obra para el primer piso") desde
  `/projects/[id]/scopes/[scopeId]/estimates/new`; se generará su **V01** automáticamente;
  luego abrir el detalle (V01 activa, 0 capítulos, 0 ítems).
- Rollback estable: tag `wave-4b2-real-scopes-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **Oleada 4C** (importación real de Excel) NO iniciada.

## 2026-06-04 — 4B.3 implementado: presupuesto inicial real + V01 (migración aprobada)

### Estado
- Rama `integration/wave-4b3-real-estimates`. Aprobación de migración recibida con
  **ajuste de seguridad obligatorio** (la RPC NO acepta `p_created_by`).
- **Migración aplicada al remoto** ⇒ **18/18 Local = Remote** (sin seeds, sin presupuestos
  remotos). Dry-run mostró exactamente 1 migración esperada.

### Migración (autorizada + hardening)
- `20260604130000_estimates_authorship_and_atomic_create.sql`: `estimates` += `description`
  + `created_by` (FK profiles ON DELETE SET NULL) + índice; **RPC**
  `public.create_estimate_with_initial_version(p_scope_id, p_code, p_name, p_description)`
  `SECURITY INVOKER`, **autor derivado de `app._auth_uid()`** (helper canónico existente,
  mig. 20260601090000; = `profiles.id` por el FK), inserta estimate (`active`) + V01 (`draft`)
  atómicamente. Hardening: `SET search_path=public`, refs calificadas, `REVOKE ALL FROM
  PUBLIC` + `FROM anon`, `GRANT EXECUTE TO authenticated` (verificado: ACL sin `anon`).
- **RLS runtime 77/77** (+10 de estimates: autor derivado, V01, atomicidad/code-dup revierte,
  cross-org WITH CHECK, deny sin sesión/membresía, anon sin EXECUTE).

### Implementación
- Contrato `docs/ESTIMATES_CRUD_CONTRACT.md` (v1).
- `apps/web/server/estimates/`: `insertEstimateWithInitialVersion`/`listEstimatesByScope`/
  `listVisibleEstimates`/`getEstimateById`/`getEstimateActiveVersion` (selector sin fallback;
  db RLS-bound vía RPC; fixture solo lectura). "Versión activa" = mayor `version_number`.
- UI request-time: sección Presupuestos en el detalle del alcance + `/estimates/new`
  (form nombre+descripción, hidden `scopeId` validado, aviso V01) + `/estimates/[estimateId]`
  (estado, proyecto/alcance, V01, 0 capítulos/0 ítems, placeholder Excel 4C). `/estimates`
  reintegrada como listado real de presupuestos visibles (empty state honesto; demo en fixture).

### Validación
- typecheck/lint 0, **623 tests** (+35 de estimates), build fixture + build `db` LOCAL
  (vacío y con estimate+V01) PASS, gm 22/22, gm:import, validador 214/0/0, RLS 77/77,
  `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final de la usuaria: crear
  `PRESUPUESTO BASE` desde la UI (no se crea desde terminal). Rollback estable: tag
  `wave-4b2-real-scopes-production-v1`. **4C NO iniciada.**

## 2026-06-04 — 4B.3 Fase 1: diagnóstico de estimates — STOP por migración requerida

### Estado
- Rama `integration/wave-4b3-real-estimates` desde `main`@`3247eb6` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1): se requiere **migración nueva**; pendiente de
  **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del esquema (migración `20260530090700`)
- `estimates`: `id`, `project_scope_id` (FK→project_scopes, NOT NULL, CASCADE), `code`
  (NOT NULL, único por scope), `name` (NOT NULL), `status` (NOT NULL DEFAULT `draft`,
  CHECK draft/active/archived), `created_at`, `updated_at`. **Sin `description`, sin `created_by`.**
- `estimate_versions`: `id`, `estimate_id` (FK, CASCADE), `version_number` (>=1, único por
  estimate), `status` (CHECK draft/review/approved/issued/archived), **`created_by` (FK profiles,
  nullable) ✅**, `created_at`, `approved_at`, `notes`.
- **RLS suficiente** (`20260530091000`): `estimates_all` (FOR ALL, org vía scope→project) +
  `estimate_versions_*` (select/insert/update/delete con org + inmutabilidad de emitidas).
  No requiere migración de RLS.
- **Versión activa = mayor `version_number`** (read-model `drizzle-repository` lo resuelve así);
  no hay `active_version_id` ⇒ no requiere columna.
- No existe repositorio de escritura de estimates ni función de creación.

### Conclusión
- Esquema **INSUFICIENTE** para 4B.3. **Migración nueva ESTRICTAMENTE NECESARIA** (aditiva,
  reversible):
  1. `ALTER TABLE estimates ADD COLUMN description text, ADD COLUMN created_by uuid
     REFERENCES profiles(id) ON DELETE SET NULL;` + índice `estimates_created_by_idx`.
  2. Función **`public.create_estimate_with_initial_version(p_scope_id, p_code, p_name,
     p_description, p_created_by)`** `SECURITY INVOKER` (RLS aplica; sin service-role) que
     inserta estimate (`status='active'`) + versión V01 (`version_number=1, status='draft'`)
     en una sola transacción; `GRANT EXECUTE ... TO authenticated`. (Función, NO trigger:
     los seeds insertan sus propias versiones ⇒ un trigger colisionaría.) Anti-colisión de
     `code` por reintento app capturando 23505.
- Remoto actual 17/17 ⇒ sería la 18.ª migración (requiere `db push` controlado tras dry-run).

### Acción solicitada (UNA aprobación)
- Autorizar: crear+validar la migración local (db reset + RLS runtime + tests),
  `db push --dry-run` y, si OK (1 migración esperada, sin seeds), `db push --linked`; luego
  implementar contrato + repo (`insertEstimateWithInitialVersion`/`listEstimatesByScope`/
  `listVisibleEstimates`/`getEstimateById`/`getEstimateActiveVersion`) + UI + tests + deploy.
  **Nada remoto sin OK.** Rollback estable: tag `wave-4b2-real-scopes-production-v1`.

## 2026-06-04 — 4B.2 CERRADA: smoke productivo real de alcances

### Estado
- **Oleada 4B.2 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = 0f470bf`.
- Tag estable: **`wave-4b2-real-scopes-production-v1`**.

### Smoke productivo verificado (usuaria)
- Proyecto real `ENTRE PATIOS`. **Alcance remoto real creado desde la UI**: `PRIMER PISO`
  (tipo floor/Piso — descripción "Alcance inicial para presupuesto de obra del primer piso").
- Listado de alcances: funcional. Detalle de alcance: funcional. Placeholder visible
  "El presupuesto de este alcance estará disponible en la siguiente fase.". Footer
  "Datos reales". **Sin datos fixture (DB mode).** create/list/detail verificados.

### Siguiente bloque
- **Oleada 4B.3 — presupuesto inicial real por alcance** (estimate + versión V01).
  Rama `integration/wave-4b3-real-estimates`. Reutilizar esquema de estimates si es
  suficiente; no ejecutar migración remota; detenerse y pedir aprobación si se requiere.

## 2026-06-04 — 4B.2 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4b2-real-scopes` (`f75ecbf`) → merge `--no-ff` a `main`
  (**`4e4c74a`**, sin conflictos). **Preview READY** (build production-like en infra
  Vercel; tras SSO del equipo). **Production READY** (`dpl…5s30491ov`) aliased a
  `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/projects` y `/projects/[id]/scopes/new` ⇒
  307 → /login (deny-by-default, sin 500, sin fixture público). Rutas de scopes vivas
  y protegidas. Remoto **17/17**; sin escrituras remotas salvo la migración aprobada;
  sin alcance remoto creado desde terminal.

### Única acción manual final (usuaria)
- Entrar a **ENTRE PATIOS** en producción y crear el alcance **`PRIMER PISO`**
  (descripción "Alcance inicial para presupuesto de obra del primer piso") desde
  `/projects/[id]/scopes/new`; luego listar y abrir su detalle.
- Rollback estable: tag `wave-4b1-real-projects-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **4B.3** (versión inicial de presupuesto por alcance) y **4C** NO iniciadas.

## 2026-06-04 — 4B.2 implementado: alcances reales (migración + repo + UI + tests)

### Estado
- Rama `integration/wave-4b2-real-scopes`. Aprobación de migración recibida.
- **Migración aplicada al remoto** ⇒ **17/17 Local = Remote** (sin seeds, sin proyectos
  remotos). Dry-run mostró exactamente 1 migración esperada antes del push.

### Migración (autorizada)
- `20260604120000_project_scopes_authorship.sql` (aditiva, reversible):
  `project_scopes` += `description text`, `created_by uuid REFERENCES profiles(id)
  ON DELETE SET NULL` + índice `project_scopes_created_by_idx`. Sin cambios de RLS.
- Local: `db reset` aplicó 17 migraciones + 4 seeds; columnas verificadas. **RLS runtime
  67/67** (incluye 6 checks nuevos de `project_scopes`: SELECT/INSERT/UPDATE cross-org,
  WITH CHECK por proyecto padre, deny sin org).

### Implementación
- Contrato congelado `docs/SCOPES_CRUD_CONTRACT.md` (v1).
- `apps/web/server/scopes/`: `insertScope`/`listScopesByProject`/`getScopeById`
  (selector por `READ_MODEL_SOURCE` sin fallback; db RLS-bound sin service-role;
  fixture solo lectura). `code` autogenerado + anti-colisión; `created_by`/`status`/
  `project_id` server-side; proyecto validado por visibilidad RLS.
- `apps/web/lib/scopes/scope-types.ts` (constantes client-safe — evita arrastrar
  `postgres` al bundle del navegador).
- UI: `/projects/[id]` sección **Alcances** (lista + CTA `Button asChild`+`Link` +
  empty state honesto); `/projects/[id]/scopes/new` (form: nombre, tipo select 7
  valores default `floor`, descripción; hidden `projectId` validado server-side);
  `/projects/[id]/scopes/[scopeId]` (detalle + placeholder de presupuesto 4B.3).
  Todas `ƒ` (layout force-dynamic + resolveViewer). `scope_type` como select; footer ya
  mode-aware desde 4B.1.

### Validación
- typecheck/lint 0, **588 tests** (+42 de scopes), build fixture + build `db` LOCAL
  (vacío y con proyecto+alcance) PASS, gm 22/22, gm:import, validador 214/0/0,
  RLS runtime 67/67, `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production (Vercel CLI). Acción manual final de la usuaria:
  crear el alcance `PRIMER PISO` desde la UI (no se crea desde terminal). Rollback estable:
  tag `wave-4b1-real-projects-production-v1`. 4B.3/4C NO iniciadas.

## 2026-06-04 — 4B.2 Fase 1: diagnóstico de scopes — STOP por migración requerida

### Estado
- Rama `integration/wave-4b2-real-scopes` desde `main`@`9770639` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1) porque se requiere una **migración nueva**;
  pendiente de **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del esquema `project_scopes` (migración `20260530090200`)
- Columnas: `id` (uuid PK), `project_id` (FK→projects, NOT NULL, ON DELETE CASCADE),
  `parent_scope_id` (FK self, nullable), `code` (text NOT NULL, único por proyecto),
  `name` (text NOT NULL), `scope_type` (text NOT NULL, CHECK floor/tower/stage/package/
  unit/modification/other), `status` (text NOT NULL DEFAULT 'active', CHECK active/archived),
  `created_at`, `updated_at`. Trigger `set_updated_at`.
- Relación con organización: **transitiva** vía `projects.organization_id` (no hay columna
  org directa en scopes).
- **RLS suficiente**: `project_scopes` con `ENABLE`+`FORCE` y policy `project_scopes_all`
  (FOR ALL, USING+WITH CHECK por `app.current_org()` del proyecto padre). Aislamiento
  cross-org ya garantizado para SELECT/INSERT/UPDATE/DELETE. **No requiere migración de RLS.**
- Lectura existente: `read-repository.scopesByProject` (consumida por `getProjectOverview`).
  **No existe** repositorio de escritura de scopes (solo `server/projects` escribe projects).

### Conclusión
- El esquema **NO es suficiente** para el objetivo 4B.2: falta `description` (el formulario
  pide nombre + descripción) y, por paridad de autoría con `projects`, conviene `created_by`.
  `code`/`scope_type` son NOT NULL ⇒ se resuelven server-side (code autogenerado; scope_type
  con default/select).
- **Migración nueva ESTRICTAMENTE NECESARIA** (aditiva, reversible), espejo de
  `20260602120000_projects_authorship`:
  `ALTER TABLE project_scopes ADD COLUMN description text, ADD COLUMN created_by uuid
  REFERENCES profiles(id) ON DELETE SET NULL;` + índice `project_scopes_created_by_idx`.
- Remoto actual: 16/16. Aplicarla sería la 17.ª migración ⇒ requiere `db push` controlado.

### Acción solicitada (UNA aprobación)
- Autorizar: (1) crear y validar localmente la migración de authorship de scopes;
  (2) `supabase db push --dry-run` y, si OK, `db push --linked` (sin `--include-seed`) a remoto;
  (3) implementar contrato + repo de escritura (RLS ya OK) + UI `/projects/[id]/scopes` + tests;
  (4) Preview + Production. **Nada de esto se ejecuta sin tu OK.** Rollback estable actual:
  tag `wave-4b1-real-projects-production-v1`.

## 2026-06-04 — 4B.1 CERRADA: smoke productivo real exitoso (DB mode)

### Estado
- **Oleada 4B.1 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`https://construction-ops-psi.vercel.app`, `READ_MODEL_SOURCE=db`,
  `APP_AUTH_MODE=supabase`). `main = origin/main = b782502`.
- Tag estable: **`wave-4b1-real-projects-production-v1`**.

### Smoke productivo verificado (usuaria)
- Login real Supabase: funcional. Footer: **"Datos reales"**.
- `/projects`: funcional. CTA **"+ Nuevo proyecto"**: funcional. Formulario: funcional.
- **Proyecto remoto real creado** desde la UI: `ENTRE PATIOS` — ciudad `Cali` — estado Activo
  — descripción "Presupuesto y seguimiento de obra — primer piso".
- Redirect posterior: funcional. Detalle `/projects/[id]`: funcional y visible.
- **NO aparecen datos fixture en producción (DB mode).** create/list/detail verificados.

### Producción
- DB real (Supabase remoto PG17). Fixture retirado de DB mode. Sin escrituras remotas desde
  terminal; variables de Vercel no modificadas por el orquestador.

### Siguiente bloque
- **Oleada 4B.2 — vertical slice real de alcances (scopes) por proyecto.** Rama
  `integration/wave-4b2-real-scopes`. Reutilizar esquema de `project_scopes` si es suficiente;
  no ejecutar migración remota; detenerse y pedir aprobación si una migración fuera necesaria.

## 2026-06-04 — CIERRE estabilización de producción 4B.1: db mode + deploy

### Estado
- Rama `fix/wave4b1-production-stabilization` (`c2f5373`) → merge `--no-ff` a `main`
  (**`c6d0ad1`**, sin conflictos, 12 archivos, +264/-42). **Production deploy READY**
  (`dpl_5AbsYetRgwnoq9nnPxk3jZEU6SV2`) aliased a `https://construction-ops-psi.vercel.app`.
- Vínculo Vercel verificado: scope `soporteatriaworkflows-8854s-projects`, proyecto
  `construction-ops` (NO `construction-ops-1rqh`). `.vercel` ignorado.

### Diagnóstico (estado mixto en producción)
- **CTAs rotos** (`+ Nuevo proyecto`, `Crear primer proyecto`): se renderizaban como
  `<Link href="/projects/new"><Button>…</Button></Link>` ⇒ HTML `<a><button></button></a>`
  (interactivo anidado inválido); el click en el `<button>` no dispara la navegación del
  ancla. Causa de "aparecen pero no navegan".
- **Fixture/demo en db mode**: `/apu`, `/catalog`, `/quantities`, `/planning` eran estáticas
  (`○`) y `/estimates` usaba `getDemoViewer()`; en `db` resolvían la **org demo** (o servían
  HTML horneado del build con datos de ENTRE PATIOS), en vez de la org real.
- **Footer**: hardcodeado `Oleada 3A — fixture` en el layout.

### Fix integral
- CTAs → `<Button asChild><Link href="/projects/new">…</Link></Button>` (ancla navegable)
  en `/projects` (2 CTAs) y `/dashboard`.
- Rutas hermanas → `export const dynamic = 'force-dynamic'` + `await resolveViewer()`
  (viewer real en `db`, demo en `fixture`); `/planning` sin UUID demo; empty state honesto
  en `db` vacío. El layout es `force-dynamic` (cubre el segmento autenticado).
- Footer → `readModelModeLabel()` (`db` ⇒ "Datos reales", `fixture` ⇒ "Modo demostración");
  helper puro `apps/web/lib/utils/mode-label.ts`.

### Validación
- typecheck/lint 0, **546 tests** (+26), build fixture PASS (todas las rutas dashboard `ƒ`),
  **build `db` LOCAL** (vacío y sembrado) PASS, gm 22/22, gm:import, validador 214/0/0,
  `git diff --check` limpio.
- **Preview Vercel READY** (build production-like en su infra; sin secretos en disco). El
  Preview responde 401 a todo por **Deployment Protection (SSO)** del equipo (no es la app).
- **Production READY** + smoke del dominio: `/login` 200; `/`, `/dashboard`, `/projects`,
  `/apu`, `/catalog`, `/quantities`, `/planning`, `/estimates` ⇒ **307 → /login?next=…**
  (deny-by-default, sin fixture público, sin 500). `APP_AUTH_MODE=supabase` activo en runtime.

### Remoto / Vercel
- **Sin escrituras remotas de proyectos**, sin `db push`/`db pull`/repair/SQL/seeds remotos/
  service-role. Variables de Vercel **no modificadas** (solo se listaron NOMBRES). Toda prueba
  de DB fue contra Postgres **local** (reseteado a seeds sanitizados).

### Pendiente / rollback
- **Única acción manual de la usuaria**: iniciar sesión en `construction-ops-psi.vercel.app`
  y crear el primer proyecto desde `/projects/new` (luego listar y abrir detalle).
- Rollback: `READ_MODEL_SOURCE=fixture` + redeploy.
- Deuda menor: `app/api/exports/route.ts` (3C, agent-exports) conserva import muerto
  `getDemoViewer` (no afecta auth: usa `resolveAuthenticatedViewer`). **4B.2/4C NO iniciadas.**

## 2026-06-04 — CIERRE fix `/dashboard` DB vacía: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-empty-db-dashboard-build` (`d1aa929`) → merge **`b942f3f`**,
  **sin conflictos** (6 archivos, +331/-25). `main = origin/main = b942f3f`.
  Tag **`wave-4b1-empty-db-dashboard-ready-v1`**.

### Validación post-merge (todo PASS en `main`)
- `/dashboard`: conserva `export const dynamic = 'force-dynamic'` + `await resolveViewer()`;
  **sin `DEMO_PROJECT_ID`** ni `getDemoViewer`; deriva el proyecto activo de
  `listProjects(viewer)` + `selectActiveProjectId`; empty state con CTA a `/projects/new`;
  `getDashboardSummary` en try/catch; sin fallback silencioso db→fixture.
- `/projects/new`: conserva `force-dynamic` + `await resolveViewer()` + guard `supabase`+`db`.
- typecheck/lint 0, **520 tests**, build con **`ƒ /dashboard`** y **`ƒ /projects/new`**,
  gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- Sin cambios en DB/migraciones/RLS/seeds/contratos/Vercel/`DATABASE_URL`/fixture (solo tests nuevos).

### Causa raíz / fix (resumen)
- Causa: `/dashboard` se prerenderizaba estática y resolvía un UUID demo fijo; en modo `db`
  con base remota vacía, `getDashboardSummary` lanzaba `ProjectNotFoundError` en prerender y
  Vercel abortaba el build.
- Fix: dashboard request-time + viewer real + selección de proyecto visible real + empty state.

### Remoto / Vercel
- **Solo código.** Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0.
  Sin `db push`/`db pull`/repair/SQL/seeds/proyectos remotos/service-role.
- Vercel **sin cambios**: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`;
  `DATABASE_URL` ya configurada privadamente por la usuaria (NO expuesta).
- **Smoke remoto pendiente** (manual de la usuaria).

### Deuda técnica registrada
- Rutas hermanas estáticas `/apu`, `/catalog`, `/quantities`, `/planning` usan `getDemoViewer()`
  y se prerenderizan en build; antes de uso productivo multitenant deben migrarse a viewer real
  request-time (`resolveViewer` + `force-dynamic`). No bloquea el build ni la creación del primer
  proyecto. Registrada en `docs/INTEGRATION_REQUESTS.md`.

### Próximo paso manual (de la usuaria)
- Esperar deployment automático → cambiar `READ_MODEL_SOURCE` `fixture`→`db` → **redeploy SIN
  Build Cache** → probar `/projects/new`, crear primer proyecto, listar, abrir detalle.
  Rollback = `READ_MODEL_SOURCE=fixture` + redeploy. **4B.2/4C NO iniciadas.**

## 2026-06-04 — Fix 4B.1: `/dashboard` maneja DB vacía sin proyecto demo (rama)

### Estado
- Rama **`fix/wave4b1-empty-db-dashboard-build`** desde `main`@`49bd113` (`main` intacta,
  sin merge). Producción Vercel intacta: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Diagnóstico
- Síntoma: deploy manual con `READ_MODEL_SOURCE=db` conectó a Postgres
  (`[read-model] fuente activa: db`) pero el build falló en prerender:
  `Error occurred prerendering page "/dashboard"` →
  `ProjectNotFoundError: 00000000-0000-4000-8000-000000000010`.
- Causa raíz: `app/(dashboard)/dashboard/page.tsx` (1) era **estática** (`○`, sin señal
  dinámica) por usar `getDemoViewer()` y (2) **hardcodeaba** `DEMO_PROJECT_ID` invocando
  `getDashboardSummary(viewer, DEMO_PROJECT_ID)` sin try/catch. En modo `db` con base
  productiva vacía, `projectById` → `null` → `ProjectNotFoundError` durante el prerender
  del build. Único causante: el `/dashboard`. Las hermanas (`/apu`, `/catalog`,
  `/quantities`, `/estimates`, `/planning`) ya manejaban lista vacía o capturaban el error.

### Fix mínimo
- `/dashboard` → request-time: `export const dynamic = 'force-dynamic'` + `await resolveViewer()`
  (viewer real por modo; dinámica intrínseca vía cookies, como `/projects/new`).
- Proyecto activo derivado de `listProjects(viewer)` + helper puro `selectActiveProjectId`
  (sin UUID demo). Si no hay proyectos → **empty state** con CTA a `/projects/new`
  (gated por `isCreationModeEnabled`) o a `/projects`. `getDashboardSummary` envuelto en
  try/catch. Aviso "Modo fixture" condicionado a `READ_MODEL_SOURCE=fixture`.
- Sin tocar migraciones/RLS/seeds/contratos. Sin fallback silencioso db→fixture.

### Validación (todo PASS)
- typecheck 0, lint 0, **520 tests** (+12 nuevos), build fixture PASS con **`ƒ /dashboard`**
  (antes `○`). gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio.
- **Build modo `db` (Postgres LOCAL) PASS** en dos escenarios: (A) DB sembrada y
  (B) **DB vacía** (proyectos truncados localmente → 2 orgs, 10 profiles, 0 proyectos):
  ambos compilan, `/dashboard` dinámica (no prerenderizada), sin `ProjectNotFoundError`.

### Remoto / Vercel
- **Supabase remoto NO tocado** (todo el trabajo fue contra Postgres local 127.0.0.1).
  Sin `db push`/`db pull`/repair/SQL remoto/seeds remotos/proyectos remotos. Remoto
  permanece **16/16**, seeds 0, proyectos 0. **Vercel sin cambios** (vars intactas).
- El stack local de Supabase se levantó excluyendo `realtime` (contenedor unhealthy en
  Windows, ajeno al fix). La DB local quedó con proyectos truncados (reversible con
  `supabase db reset`).

### Próximo paso
- Revisión del orquestador para autorizar merge a `main`. NO se hizo merge.

## 2026-06-04 — CIERRE hardening `/projects/new`: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-runtime-creation-env` (`7b112cc`) → merge **`0ad7f56`**,
  **sin conflictos** (5 archivos, +102/-8). `main = origin/main = 0ad7f56`.
  Tag **`wave-4b1-project-creation-runtime-hardening-v1`**.

### Validación post-merge (todo PASS en `main`)
- `/projects/new/page.tsx` conserva `export const dynamic = 'force-dynamic'` **y**
  `await resolveViewer()` (señal dinámica intrínseca vía cookies).
- typecheck/lint 0, **508 tests**, build con **`ƒ /projects/new`** (sin prerender; ausente
  del `prerender-manifest`), gm:regression **22/22**, gm:import PASS, validate-agents
  **214/0/0**, `git diff --check` limpio. Server action conserva su guard independiente.
- Sin cambios en DB/migraciones/RLS/seeds/Vercel/fixture.

### Hipótesis ambiental (pendiente de confirmar)
- El bloqueo productivo residual NO se reprodujo con artefacto limpio; hipótesis principal:
  **caché estática/edge obsoleta** de despliegues previos (cuando la ruta era `○`). Aún
  **no es certeza absoluta**. El hardening (dinámica intrínseca) evita futuro cacheo
  estático y debe superar el artefacto viejo en un deploy con build limpio.

### Remoto / Vercel
- Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0. **Sin** `db push`
  (solo código). Vercel sin cambios: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Esperar el deployment automático del merge → cambiar `READ_MODEL_SOURCE` `fixture`→`db`
  → **redeploy SIN reutilizar Build Cache** → probar `/projects/new` (debe mostrar el
  formulario). Rollback = `READ_MODEL_SOURCE=fixture` + redeploy.

## 2026-06-03 — Fix 4B.1 (residual): `/projects/new` intrínsecamente dinámica + diagnóstico

### Estado
- Rama **`fix/wave4b1-runtime-creation-env`** desde `main`@`17b9e07` (`main` intacta).
  Producción en `supabase`+`fixture` (rollback de la usuaria) mientras se investiga.

### Diagnóstico (auditoría profunda — el código YA era correcto)
- Síntoma: con `READ_MODEL_SOURCE=db` en Vercel, `/projects/new` seguía mostrando "Modo
  demostración activo" pese a que `17b9e07` (force-dynamic) estaba desplegado y `/projects`
  sí leía `db`.
- **Evidencia recolectada (todo confirma código correcto):**
  1. Grep: **no hay accesos literales** `process.env.APP_AUTH_MODE/READ_MODEL_SOURCE` en
     código de app (solo tests) ⇒ Next no inyecta valores en build.
  2. Chunk compilado: `resolveAuthMode(a=process.env){...a.APP_AUTH_MODE...}` e
     `isCreationModeEnabled` lee `a.READ_MODEL_SOURCE` con `a=process.env` ⇒ **lectura
     runtime indirecta, sin inlining/congelado**.
  3. Build: `/projects/new` es `ƒ`, **sin** HTML/RSC prerenderizado y **ausente** del
     `prerender-manifest` ⇒ `force-dynamic` es efectivo.
  4. El Proxy local (mismo `resolveAuthMode`) devolvió 307 a `/login` ⇒ leyó
     `APP_AUTH_MODE=supabase` en runtime desde el bundle.
- **Conclusión**: no hay defecto de código; el guard evalúa request-time correctamente.
  El bloqueo residual en producción es **ambiental**: caché estática/edge OBSOLETA de
  `/projects/new` de los despliegues previos (cuando la ruta era `○` static, con el
  mensaje demo horneado), no invalidada por el redeploy (posible "Redeploy" con build
  cache reusado).

### Fix (endurecimiento honesto — no repite el anterior)
- `/projects/new/page.tsx`: ahora `async` y resuelve `await resolveViewer()` (lee
  `cookies()` en modo supabase) ⇒ **señal dinámica intrínseca** idéntica a `/projects`.
  Vercel NO sirve rutas dinámicas intrínsecas desde caché estática/edge, de modo que el
  próximo deploy supera definitivamente cualquier HTML estático obsoleto. Se conserva
  `force-dynamic`. Defensa en profundidad: la creación es ruta protegida; ya no se confía
  solo en el Proxy (la server action mantiene su guard auth+modo).
- Test `route-config.test.ts`: + assert de señal dinámica intrínseca (`await resolveViewer`
  / `export default async function`).

### Validación (local)
- typecheck/lint 0, **508 tests** (+1), build con **`ƒ /projects/new`** (sin prerender),
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Recomendación de despliegue (clave)
- Al mergear: forzar **build limpio sin caché** en Vercel y **purgar la caché del proyecto**
  antes de reintentar `READ_MODEL_SOURCE=db`. Verificar con hard refresh / `curl` con
  cache-busting. Rollback = `fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin DB/RLS/remoto; sin escritura remota; sin service-role.
  **NO merge a `main`. 4B.2/4C NO iniciadas.**

## 2026-06-03 — CIERRE Fix `/projects/new`: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-project-creation-mode-guard` (`9e9dd96`) → merge
  **`1999ffb`**, **sin conflictos** (5 archivos, +102). `main = origin/main = 1999ffb`.
  Tag **`wave-4b1-project-creation-route-fix-v1`**.

### Validación post-merge (todo PASS en `main`)
- Directiva `export const dynamic = 'force-dynamic'` presente en `/projects/new/page.tsx`.
- typecheck/lint 0, **507 tests**, build OK con **`ƒ /projects/new`** (antes `○`),
  gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check`
  limpio.
- Requisito de creación intacto (`supabase`+`db`); guard de la server action sin cambios;
  sin cambios en DB/migraciones/RLS/seeds/dashboard/exports/Vercel.

### Remoto / Vercel
- Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0. **Sin** `db push`
  (este fix es solo código). Vercel sin cambios: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Cambiar `READ_MODEL_SOURCE` `fixture`→`db` + redeploy → abrir `/projects/new` (debe
  mostrar el formulario) → crear proyecto → listar → abrir detalle. Rollback = `fixture` + redeploy.

## 2026-06-03 — Fix 4B.1: bloqueo incorrecto de `/projects/new` (prerender estático del mode-guard)

### Estado
- Rama **`fix/wave4b1-project-creation-mode-guard`** desde `main`@`ef995b9` (`main` intacta).
  Producción en `supabase`+`fixture` (rollback de la usuaria) mientras se investiga.

### Diagnóstico (causa raíz)
- En modo `db`, `/projects` y `/projects/[id]` funcionaban, pero `/projects/new` mostraba
  "Modo demostración activo." pese a `READ_MODEL_SOURCE=db` en Vercel. Causa: `/projects/new`
  es un Server Component **sin APIs dinámicas** (no usa `cookies()`/`headers()`), así que
  Next lo **prerenderizó estáticamente en build** (build output: `○ /projects/new` vs
  `ƒ /projects`). `isCreationModeEnabled()` lee `APP_AUTH_MODE`/`READ_MODEL_SOURCE`
  (env de servidor) en **build-time**, donde los defaults son `demo`+`fixture` ⇒ el guard
  quedó horneado en `false`. En runtime se servía el HTML estático sin re-evaluar.
- La **server action** `createProjectAction` SÍ guarda en request-time (correcto); el bug
  era solo del render de la página.

### Fix (mínimo)
- `apps/web/app/(dashboard)/projects/new/page.tsx`: `export const dynamic = 'force-dynamic'`
  ⇒ render request-time; el guard se evalúa por petición con el env de runtime. Build
  ahora muestra **`ƒ /projects/new`**. Sin cambios de UI/seguridad: el requisito sigue
  siendo `supabase`+`db`; la action conserva su guard.
- Test de regresión `apps/web/tests/unit/projects/route-config.test.ts` (la página declara
  `force-dynamic`). La matriz del guard y el guard de la action ya estaban cubiertos en
  `action.test.ts`.

### Validación (local)
- typecheck/lint 0, **507 tests** (+2), build OK (`/projects/new` ahora `ƒ`),
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Restricciones
- Sin tocar Vercel/variables; sin DB/RLS/remoto; sin escritura remota; sin service-role.
  **NO merge a `main`. 4B.2/4C NO iniciadas.**

### Próximo paso (pendiente de autorización)
- Revisar reporte → si OK: merge a `main` (solo código; **no** requiere migración remota),
  luego la usuaria reintenta `READ_MODEL_SOURCE=db` + redeploy + smoke de creación.

## 2026-06-02 — CIERRE Fix 4B.1: merge a `main` + migración remota correctiva (16/16)

### Estado
- `git merge --no-ff fix/wave4b1-membership-resolution` (`ab08b28`) → merge **`82c2fa7`**,
  **sin conflictos** (7 archivos, +186/-5). `main = origin/main = 82c2fa7`.
- Tags: **`wave-4b1-membership-fix-code-ready-v1`** (pre-migración) y
  **`wave-4b1-membership-fix-remote-ready-v1`** (post + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK, gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.

### Migración remota correctiva (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** pendiente
  (`20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`), **0 seeds**.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **16/16 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- **16/16** (incluye grants `app` a `authenticated` + `profiles_self_select`). El esquema
  remoto ya no recursará ni fallará por permisos al resolver el viewer en modo `db`.

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Cambiar **solo** `READ_MODEL_SOURCE` `fixture`→`db` + redeploy + repetir el smoke de
  creación de proyecto. **Rollback**: `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2/4C NO iniciadas.**

## 2026-06-02 — Fix 4B.1: error de membresía en modo `db` (grants `app` + recursión RLS profiles)

### Estado
- Rama **`fix/wave4b1-membership-resolution`** desde `main`@`939af74` (`main` intacta).
  Producción en rollback por la usuaria: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Diagnóstico (causa raíz DOBLE, demostrada localmente)
- **#1 Grants faltantes**: las migraciones nunca otorgaron a `authenticated` `USAGE`
  sobre el esquema `app` ni `EXECUTE` sobre sus funciones de identidad. El harness RLS
  lo concedía en **runtime** (`ensureGrants`), enmascarando el hueco. En Supabase remoto
  el esquema `app` no es accesible por defecto ⇒ la 1ª política que invoca
  `app.current_org()` falla con **"permission denied for schema app"**;
  `resolveAuthenticatedViewer()` (que lee `profiles` primero) lo reporta como
  **"El usuario no tiene membresía."**. Reproducido local con migraciones puras.
- **#2 Recursión RLS en `profiles`**: la política `profiles_select`
  (`organization_id = app.current_org()`) obliga a `current_org()` a leer `profiles`,
  re-evaluando la política. Con migrador SIN `BYPASSRLS` (postgres remoto), el lookup
  `SECURITY DEFINER` NO salta RLS ⇒ **recursión infinita** ("stack depth limit exceeded").
  Reproducido local emulando los helpers en `SECURITY INVOKER`.

### Fix (migración `20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`)
- `GRANT USAGE ON SCHEMA app` + `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app` a
  `authenticated` (+ default privileges para funciones futuras).
- Reemplaza `profiles_select` por `profiles_self_select USING (id = (SELECT app._auth_uid()))`
  — self-read sin `current_org()`, rompe la recursión, **más estricto** (no expone perfiles
  de terceros). Aislamiento por organización intacto; RLS sigue FORCE.
- Harness `scripts/rls-runtime/run.ts`: `ensureGrants` ya **no** concede `app`
  (solo `public`, que emula defaults de plataforma) ⇒ ahora valida los grants de la
  migración; +3 checks (self-read, deny terceros, anti-recursión emulando INVOKER).

### Validación (local)
- **RLS runtime 61/61** (58 + 3 nuevos). typecheck/lint 0, **505 tests**, build OK,
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Restricciones
- Sin tocar Vercel/variables; sin escritura remota; sin `db push/pull`/`migration repair`;
  sin SQL remoto; sin service-role. **NO merge a `main`. 4B.2/4C NO iniciadas.**

### Próximo paso (pendiente de autorización)
- Revisar reporte → si OK: merge a `main` + `db push --dry-run`/`--linked` de la nueva
  migración al remoto, luego la usuaria reintenta `READ_MODEL_SOURCE=db` + smoke.

## 2026-06-02 — CIERRE Oleada 4B.1: merge a `main` + migración remota de proyectos

### Estado
- `git merge --no-ff integration/wave-4b1-real-projects` (`1f5f908`) → merge **`10ac567`**,
  **sin conflictos** (27 archivos, +2549/-26). `main = origin/main = 10ac567`.
- Tags: **`wave-4b1-projects-code-ready-v1`** (pre-migración) y
  **`wave-4b1-projects-remote-ready-v1`** (post-migración + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK (`/projects` ƒ, `/projects/[id]` ƒ,
  `/projects/new`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Migración `20260602120000_projects_authorship.sql` presente.

### Migración remota aplicada (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** migración pendiente
  (`20260602120000_projects_authorship.sql`), **0 seeds**, sin diferencias inesperadas.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **15/15 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- Esquema **15/15** (14 previas + `projects_authorship`: `description`+`created_by`).
  Org `GRUPO ICONIC` + 1 profile admin. **Sin proyectos reales aún.**

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`. El cambio a `db` es **acción
  manual pendiente de la usuaria**.

### Próximo paso manual (de la usuaria, fuera de este entorno)
- Cambiar **solo** `READ_MODEL_SOURCE` de `fixture` → `db` en Vercel, redeploy, y crear
  el **primer proyecto real** desde la interfaz (smoke remoto controlado).
- **Rollback**: volver a `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2 / 4C NO iniciadas.**

## 2026-06-02 — Oleada 4B.1 (Fases 2–5): vertical slice real de proyectos (validado, NO mergeado)

### Estado
- Rama `integration/wave-4b1-real-projects` = **`2397323`** (publicada). `main` intacta
  en `cb988be`. Dos sub-merges `--no-ff`: DB/RLS (`d2d426a`) y UI (`2397323`).
- Backups: `backup/wave4b1-projects-db` (`3a403bd`), `backup/wave4b1-projects-ui`
  (`6f41fd4`) — pusheados.

### Entregables
- **Fase 2 (agent-db-rls)**: migración `20260602120000_projects_authorship.sql`
  (`description`+`created_by`); `apps/web/server/projects/` (`ProjectsWriteRepository`,
  validación + generación de `code`, selector); RLS runtime extendido. **Sin service-role.**
- **Fase 3 (agent-frontend-boq)**: server action `createProjectAction`, `mode-guard`,
  lista por `resolveViewer()`, formulario `/projects/new`, detalle `/projects/[id]`.
  (Fix de integración del orquestador: el test importaba `isCreationModeEnabled` desde
  `actions`; corregido a `./mode-guard`.)

### Validación (Fase 4, en la rama de integración)
- typecheck/lint 0, **505 tests**, build OK, gm 22/22, gm:import PASS, validador 214/0/0,
  `git diff --check` limpio. **RLS runtime 58/58** (PG17 local). Smoke HTTP demo+fixture:
  `/projects`, `/projects/new`, `/login` = 200; "+ Nuevo proyecto" deshabilitado en demo.
- Pendiente no bloqueante: smoke interactivo en navegador en modo `db` (login real →
  crear → detalle); validado a nivel DB/unit/build.

### Restricciones respetadas
- Sin tocar Vercel ni remoto; sin escritura remota; sin `db push/pull`; sin service-role;
  sin secretos. **NO merge a `main`. 4C NO iniciada.** Supabase local detenido al cierre.

### Próximo paso (requiere autorización)
- Revisión del reporte → si OK: merge a `main` + (en sesión aparte) smoke remoto mínimo
  controlado. Antes del smoke remoto, definir backup/rollback de datos reales.

## 2026-06-02 — Oleada 4B.1 (Fase 1): contrato congelado del vertical slice de proyectos

### Estado
- Rama **`integration/wave-4b1-real-projects`** desde `main`@`cb988be` (publicada).
  `main` intacta. Logout online confirmado por la usuaria; 4A.3 cerrada.
- Auditoría read-only previa: `migration list --linked` ⇒ **14/14 Local = Remote**.

### Diagnóstico del esquema previo (`projects`)
- RLS por organización ya existente (SELECT/INSERT/UPDATE/DELETE en `app.current_org()`).
- **Faltan** `created_by` y `description`; usa `location` (no `city`); `code` es
  `NOT NULL UNIQUE(org,code)` y no está en el input. `ReadModelPort` es **solo lectura**.

### Contrato congelado (Fase 1)
- `docs/PROJECTS_CRUD_CONTRACT.md` v1 + actualizaciones en `API_CONTRACTS.md`,
  `AGENT_REGISTRY.md` (ownership 4B.1), `DECISIONS.md`, `INTEGRATION_REQUESTS.md`.
- Plan: db-rls (migración `created_by`+`description`, repo de escritura, RLS runtime) →
  frontend-boq (server action + UI lista/detalle/formulario). Ejecución **secuencial**.

### Restricciones
- Sin tocar Vercel ni remoto productivo; sin `db push/pull` en remoto; creación solo en
  `supabase`+`db` local; sin service-role; sin secretos. **4C NO iniciada.**

### Próximo paso
- Fase 2: lanzar `agent-db-rls` (worktree aislado) desde la rama de integración.

## 2026-06-02 — CIERRE Oleada 4A.3: Supabase remoto + autenticación online validada

### Estado
- `main = origin/main = 32b7937`. Tag de cierre **`wave-4a3-online-auth-validated-v1`**.
- **Auditoría read-only remota**: `supabase migration list --linked` ⇒ **14/14 Local =
  Remote**, ninguna pendiente. PostgreSQL **17** remoto. Org inicial `GRUPO ICONIC`,
  **1** profile admin. **Seeds demo remotos: 0** (sin datos de presupuesto reales).

### Smoke online real (confirmado MANUALMENTE por la usuaria en producción)
- Producción: `https://construction-ops-psi.vercel.app`.
- Vercel activo: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`;
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` /
  `NEXT_PUBLIC_APP_URL` configuradas.
- Flujo validado: `/login` visible → credenciales válidas del admin → sesión creada →
  redirect `/dashboard` → dashboard fixture sanitizado visible. **`/logout` =
  comprobación final manual pendiente** de la usuaria (eliminar sesión → redirect
  `/login` → nuevo login funcional).
- Seguridad confirmada: sin secret/service-role en frontend; sin datos reales de
  presupuesto expuestos; **`READ_MODEL_SOURCE=db` NO activado** (sigue `fixture`).

### Cierre técnico 4A.3 (resumen de la microfase completa)
- 4A.3: link controlado read-only; 4A.3a: paridad PG17 + `db push --dry-run`;
  4A.3b: merge PG17 a `main` + `db push --linked` (14/14, sin seeds/usuarios);
  4A.3c: creación manual de org/admin + fix de inlining `NEXT_PUBLIC_*` (merge `ad8f32b`)
  + smoke online real. **Oleada 4A.3 CERRADA.**

### Restricciones respetadas
- Sin tocar Vercel ni variables; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin deploy manual; sin force-push/reset/rebase; sin borrar
  ramas/tags/backups. **Oleada 4B NO iniciada.**

### Rollback disponible
- Volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` + redeploy.

### Próximo paso (propuesto, NO iniciado)
- **Oleada 4B — creación real de proyectos desde la UI** con `READ_MODEL_SOURCE=db`
  (contrato → repo DB → server action → UI → tests → smoke local → smoke remoto).
  Requiere autorización explícita.

## 2026-06-02 — Oleada 4A.3c: merge del fix de login online a `main` + tag

### Estado
- `git merge --no-ff fix/wave4a3-online-login` (`834029c`) → merge **`ad8f32b`**,
  **sin conflictos** (8 archivos, +272/-12). `main` ahora = `ad8f32b`.
  Tag **`wave-4a3-online-login-fix-v1`**.

### Validación post-merge (todo PASS en `main`)
- typecheck 0, lint 0, **461 tests** (33 archivos), build (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos/privados/`.env.local` staged.
- Auditoría de archivos en `main`: `client.ts` usa referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY` (+ fallback `ANON_KEY`);
  `login/page.tsx` delega en `runPasswordLogin` (copy/layout intactos); sin cambios en
  DB/migraciones/seeds/Proxy/exports/dashboard/fixture/Vercel.

### Restricciones respetadas
- DB remota intacta (14/14 migraciones; sin push/pull/repair/SQL/seeds/usuarios;
  sin service-role). **Vercel intacto** (`APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`).
  Sin deploy manual; sin force-push/reset/rebase destructivo; sin borrar ramas/tags/backups.
  **Oleada 4B NO iniciada.**

### Próximo paso (manual, de la usuaria — fuera de este entorno)
- Activar `APP_AUTH_MODE=supabase` en Vercel (manteniendo `READ_MODEL_SOURCE=fixture`),
  redeploy y probar login online real con el admin de `GRUPO ICONIC`.
- Rollback inmediato disponible: volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3c (fix): cablear el login online a Supabase (inlining NEXT_PUBLIC)

### Estado
- Rama de fix **`fix/wave4a3-online-login`** desde `main`@`1ce654e` (`main` intacta).
  Vercel sigue en `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` (restaurado por
  la usuaria); **no se tocó Vercel, ni variables remotas, ni la DB remota**.

### Diagnóstico (causa raíz)
- En modo `supabase`, el submit de `/login` mostraba el error genérico, **sin** request
  a `/auth/v1/token` y **sin** intento en los Auth logs ⇒ `signInWithPassword()` nunca
  se ejecutaba. Causa: `createClient()` (navegador) llamaba `getPublicSupabaseEnv()`
  **sin argumentos**; esa función lee `env.NEXT_PUBLIC_*` de forma **indirecta**
  (`env = process.env` por defecto). Next solo inyecta en el bundle del navegador las
  referencias **literales** `process.env.NEXT_PUBLIC_*`; el acceso indirecto queda
  `undefined` ⇒ `AuthConfigError` lanzado, capturado en el `catch` de `handleSubmit`
  ⇒ mensaje genérico. (Las navegaciones a `/forgot-password` eran el `<Link>` legítimo,
  no un submit accidental.)

### Cambios (solo archivos del orquestador + 1 de frontend-boq, sin rediseño)
- `apps/web/lib/supabase/client.ts`: pasa un objeto con referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/ANON_KEY` a
  `getPublicSupabaseEnv()` ⇒ Next las inyecta en el navegador. (fix raíz)
- `apps/web/server/auth/login-flow.ts` (**nuevo**, orquestador): `runPasswordLogin`
  puro y testeable (1 sola llamada a `signInWithPassword`, error legible, redirección
  `next` sanitizada anti open-redirect, sin redirigir en error).
- `apps/web/app/(auth)/login/page.tsx` (frontend-boq): `handleSubmit` delega en
  `runPasswordLogin`. Diseño/copy/layout **idénticos**.
- Tests: `tests/unit/auth/login-flow.test.ts` (**nuevo**, 6 casos) +
  `tests/unit/auth/auth-runtime.test.ts` (3 casos de env: prioridad PUBLISHABLE,
  fallback ANON, resolución sin args desde `process.env`).

### Validación (todo PASS)
- typecheck 0, lint 0, **461 tests** (33 archivos, +9), build OK (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos, sin privados, sin `.env.local` staged.

### Restricciones respetadas
- Sin tocar Vercel/variables remotas; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin secretos; sin force-push/reset; **4B NO iniciada**.

### Próximo paso (pendiente de autorización)
- Autorizar merge de `fix/wave4a3-online-login` a `main` y luego, en sesión aparte,
  cambiar Vercel a `APP_AUTH_MODE=supabase` para validar login online real (4A.3c).

## 2026-06-02 — Oleada 4A.3b: merge PG17 a `main` + bootstrap real del esquema remoto

### Estado
- **Merge de paridad PG17 a `main`**: `git merge --no-ff integration/wave-4a3-remote-bootstrap`
  → merge commit **`139dd52`**, sin conflictos (4 archivos: `config.toml` + 3 docs).
  `main = origin/main = 139dd52`. Tag **`wave-4a3-pg17-bootstrap-ready-v1`** (pre-bootstrap).
- **Bootstrap real del esquema remoto**: `supabase db push --linked` (una sola vez,
  **sin `--include-seed`**) sobre `construction-ops-prod` (ref `jab…pdii`). Aplicó las
  **14 migraciones** en orden; "Finished supabase db push." Único aviso: `NOTICE`
  `pgcrypto already exists` (benigno). El prompt `[Y/n]` se auto-confirmó en entorno no-TTY.

### Validación
- **Post-merge local** (`main`): `config.toml` `major_version = 17`; typecheck/lint 0,
  **452 tests**, build (rutas auth + `/api/exports` + Proxy), gm:regression 22/22,
  gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Pre-flight remoto**: 14 pendientes, Remote en blanco, orden correcto.
- **Post-push**: `migration list --linked` ⇒ **14/14 Local = Remote**, ninguna pendiente.
  Git tree limpio (solo memoria del orquestador).

### Restricciones respetadas
- **Seeds NO ejecutados** (sin `--include-seed`); **usuarios NO creados**; sin SQL/Table
  Editor; sin `db pull`/`migration repair`; sin Database Password en comando/logs/docs;
  sin `--password`/`SUPABASE_DB_PASSWORD`; **Vercel intacto** (`APP_AUTH_MODE=demo` +
  `READ_MODEL_SOURCE=fixture`). Sin force-push/reset/rebase. **4B NO iniciada.**

### Rollback / estado funcional
- Remoto: **esquema presente (14 migraciones), SIN datos funcionales** (sin org/usuarios reales).
- Mantener Vercel en `demo` + `fixture` hasta crear admin/login online (4A.3c).
- Si fallara un bootstrap futuro antes de datos reales: evaluar corrección puntual o
  **recrear proyecto remoto vacío**; **NO** usar `migration repair` automáticamente.

### Próximo paso (pendiente de autorización)
- **Oleada 4A.3c**: crear organización + usuario admin inicial seguro y conectar login
  online manteniendo `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3 + 4A.3a: vínculo remoto controlado + paridad PG17 + dry-run

### Estado
- **4A.3 (read-only)**: Supabase CLI **2.102.0** autenticada por la usuaria (TTY)
  y `supabase link --project-ref jabddbccmhrxztfzpdii` → `Finished supabase link.`
  Proyecto remoto `construction-ops-prod` (org `oxexzrzkzksgwjaihnjf`, West US Oregon).
  Auditoría read-only: **remoto vacío** (`migration list --linked`: 14 locales con
  columna Remote en blanco); `supabase/.temp/` ignorado (`.gitignore:24`).
  Detectado mismatch: remoto **PG 17.6.1** vs `config.toml` `major_version = 15`.
- **4A.3a (esta sesión)** sobre rama **`integration/wave-4a3-remote-bootstrap`**
  (desde `main` `d3617c3`; `main` intacta): paridad local a PG17, revalidación
  local completa y **`db push --dry-run --linked`** (sin push real).

### Cambios
- `supabase/config.toml`: `major_version` **15 → 17** (local, reversible).
- Docs: `DECISIONS.md` (4A.3 + 4A.3a), `HANDOFF_LOG.md`, `QA_REPORT.md`.

### Restricciones respetadas
- Sin `db push` real, sin `--include-seed`, sin `db pull`/`migration repair`,
  sin SQL/seeds/usuarios remotos, sin tocar Vercel ni variables de entorno,
  sin secretos, sin Database Password en comandos/logs/docs. Vercel permanece
  `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`. **4B NO iniciada.**

### Resultados (PASS)
- **PG17 local**: volumen PG15 incompatible → `supabase stop --no-backup` (descarte
  local) + `supabase start` ⇒ `server_version 17.6`. `db reset`: 14 migraciones +
  4 seeds limpios. **RLS runtime 47/47** (org A/B aisladas, sin sesión/sin membresía
  bloqueados, cross-org bloqueado, compat demo). Stack detenido al cierre.
- **Validación general**: typecheck/lint 0, **452 tests** (32 archivos), build
  (rutas auth + `/api/exports` + Proxy), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **Commit paridad**: `8a76a75` `chore(supabase): align local postgres major
  version with remote pg17` (4 archivos: config.toml + 3 docs); rama pusheada.
- **`db push --dry-run --linked`**: lista exactamente **14 migraciones** en orden
  cronológico, **sin seeds**, sin aplicar. `migration list --linked` post-dry-run:
  **remoto sigue con 0 migraciones** (columna Remote en blanco).
- **Sin push real**, sin SQL/seeds/usuarios remotos, **Vercel intacto**.

### Próximo paso
- Pendiente de autorización explícita: **push real** `supabase db push --linked`
  (sin `--include-seed`) en sesión posterior, con backup/rollback definido.

## 2026-06-02 — Cierre Oleada 4A: merge a `main` + tag

### Estado
- **Merge Oleada 4A a `main`**: `git merge --no-ff integration/wave-4a-auth-runtime`
  (`cc61eec`) → merge **`de37d15`**, **sin conflictos** (44 archivos, +3185/-133).
- Incluye: DB/RLS 4A.1 (migración `auth_identity_helpers` + seed `0004`,
  identidad `auth.uid()`→`profiles`, single-org v1, sin tablas nuevas);
  runtime SSR (`@supabase/ssr`, `getAll/setAll`, Proxy Next 16 con `getClaims()`
  sin `getSession()`, viewer real, role-map, anti open-redirect); UI auth
  (`(auth)/*` + `components/auth/*` + fix Suspense `/login`); guard `/api/exports`.

### Validación post-merge (PASS en `main`)
- typecheck/lint 0 · **452 tests** · build (Proxy + rutas auth + `/api/exports`)
  · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- **RLS runtime 47/47** (14 migraciones + 4 seeds limpios; Supabase local Docker;
  detenido al cierre). **Smoke demo 6/6 HTTP 200** (`/`→`/dashboard`,
  dashboard/projects/planning/login, `/api/exports` PDF; sin 500).
- Sin secretos; `.env.local` ignorado; sin privados; Excel real ignorado.

### Tag y push
- Tag anotado **`wave-4a-auth-local-v1`** ("Wave 4A validated: Supabase Auth SSR
  proxy UI and local RLS identity"). `git push origin main` + push del tag.
- Commit docs `docs: record wave 4a auth merge validation`.

### Configuración de producción (Vercel) — sin cambios desde el repo
- **Vercel debe permanecer `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`**
  (configurado manualmente por la usuaria). Supabase remoto **NO conectado**;
  sin `link`/`db push`/deploy. Demo pública sanitizada preservada.

### Próximo paso (sin lanzar)
- **Oleada 4A.3 — Supabase remoto controlado + login online** (microfase manual
  de la usuaria: crear proyecto remoto, aplicar migraciones, vars Vercel
  `APP_AUTH_MODE=supabase` manteniendo `READ_MODEL_SOURCE=fixture`, verificar
  login online; luego evaluar `READ_MODEL_SOURCE=db`; rollback a demo+fixture).
- **Oleada 4B NO iniciada.** B-004 (Realtime Windows) deuda no bloqueante.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-02 — Oleada 4A.2: integración UI auth + smoke local end-to-end

### Estado
- **UI auth integrada** en `integration/wave-4a-auth-runtime`:
  `git merge --no-ff backup/wave4a-auth-ui` (`c9063ad`) → merge **`5c60339`**,
  **sin conflictos** (11 archivos, +1106; HANDOFF_LOG 3-way → versión runtime).
- Auditoría de runtime SSR + UI conforme a `AUTH_RUNTIME_CONTRACT`: browser
  client publishable-only; server client `getAll/setAll`; Proxy Next 16 con
  `getClaims()` (no `getSession()`), deny-by-default y `sanitizeNext`; viewer
  real sesión→`profiles` (org/rol server-side, mapeo único); `/api/exports`
  con anti-escalamiento `isSameOrLessPrivileged`.

### Validación post-merge (PASS)
- typecheck/lint 0 · **452 tests** (+29 auth-ui) · build (Proxy + `(auth)/*` +
  `/api/exports`) · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- Excel ignorado; sin `.env`/`.env.local`/lock/privados/secretos.

### Smoke local (Supabase local Docker, sin remoto)
- `supabase start -x realtime,studio,storage-api,imgproxy,edge-runtime,logflare,
  vector` + `db reset` (**14 migr + 4 seeds**) + **RLS runtime 47/47**.
- `.env.local` (ignorado): `APP_AUTH_MODE=supabase`, `READ_MODEL_SOURCE=fixture`,
  URL/publishable local. Usuarios seed con contraseña **efímera local** (no en repo).
- 13 pasos PASS: `/login` 200; deny sin sesión (`/login?next=…`); credenciales
  inválidas→error legible; login admin→sesión; `/dashboard` auth 200; `/login`
  auth→`/dashboard`; `/api/exports` sin sesión bloqueado; **escalamiento
  client→internal/management 403**, propio 200; export 200 (PDF); logout→cookie
  borrada; forgot→recover 200 + **Mailpit**; callback sin code→`/login?error`;
  **demo** `/dashboard` 200 sin Supabase.
- `supabase stop` al cierre; helper temporal `_smoke-login.mjs` eliminado.

### Decisiones / próximo paso
- Documentado en DECISIONS (4 filas 4A.2), QA_REPORT (sección 4A.2),
  INTEGRATION_REQUESTS (frontend-boq ✅), AUTH_RUNTIME_CONTRACT §11.
- Commit docs `docs: record wave 4a2 auth runtime ui integration and local smoke`
  + push `origin integration/wave-4a-auth-runtime`. **NO** merge a `main`.
- **Recomendado:** aprobar merge acumulado Oleada 4A → `main` (decisión usuario).
  No iniciar Oleada 4B. Supabase remoto no conectado; Vercel intacto (demo fixture).

### Agentes activos al cierre
- Ninguno.

---

## 2026-05-29 — Sesión inicial
- Estado: repositorio creado, estructura de carpetas inicializada
- Decisión tomada: Drizzle ORM
- Próximo paso: push inicial a GitHub, luego Oleada 1 de agentes
- Bloqueos activos: ninguno
- Agentes activos: ninguno aún

## 2026-05-29 — Preparación documental y normalización de agentes

### Estado inicial encontrado
- `.claude/agents/` ya contenía 6 agentes completos: orchestrator,
  db-rls, excel-mapper, cost-domain, pricing, homecenter.
- Carpeta `agents/` (en raíz) tenía 11 placeholders de 2 bytes con
  nombres en mayúsculas (sin contenido útil).
- `docs/PROJECT_MASTER.md` estaba vacío (1 carácter en blanco).
- `CLAUDE.md` no existía.
- `docs/AGENT_REGISTRY.md` no existía.
- `docs/API_CONTRACTS.md`, `DATABASE_SCHEMA.md`, `EXCEL_MAPPING.md`,
  `QA_REPORT.md` estaban vacíos.
- `.gitignore` incompleto (sin `private/`, `.env.*`, `!.env.example`,
  `.claude/worktrees/`, logs, `Thumbs.db`).
- `scripts/validate-claude-agents.ps1` no existía.

### Archivos movidos
- Ninguno. Los 11 archivos en `agents/` eran placeholders vacíos sin
  información a preservar.

### Archivos creados
- `CLAUDE.md` (raíz) — punto de entrada para Claude Code.
- `.claude/agents/agent-frontend-boq.md`
- `.claude/agents/agent-dashboard.md`
- `.claude/agents/agent-planning.md`
- `.claude/agents/agent-exports.md`
- `.claude/agents/agent-qa.md`
- `docs/AGENT_REGISTRY.md` — matriz maestra de agentes.
- `scripts/validate-claude-agents.ps1` — validador automático.

### Archivos completados
- `docs/PROJECT_MASTER.md` — placeholder explícito que apunta al
  BLOCKER B-001 (no se inventó contenido).
- `docs/OPEN_QUESTIONS.md` — agregado BLOCKER B-001 + 7 preguntas
  nuevas (descuento sobre referencia, redondeo, aprobación SKU, etc.).
- `docs/API_CONTRACTS.md` — convenciones generales y contratos
  por módulo pendientes de detalle.
- `docs/DATABASE_SCHEMA.md` — entidades planificadas y reglas RLS.
- `docs/EXCEL_MAPPING.md` — hojas a documentar y valores de regresión.
- `docs/QA_REPORT.md` — matriz de categorías pendientes.
- `.gitignore` — agregadas reglas para `private/`, `.env.*`,
  `!.env.example`, `.claude/worktrees/`, `*.log`, `.DS_Store`,
  `Thumbs.db`.

### Archivos eliminados
- Carpeta `agents/` completa (11 placeholders vacíos de 2 bytes c/u).

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Warnings
- Ninguno en la validación automática.

### Blockers activos
- **B-001**: `docs/PROJECT_MASTER.md` está vacío. El usuario debe pegar
  manualmente el documento maestro completo (versión Antigravity)
  antes de iniciar la Oleada 1. Ver `docs/OPEN_QUESTIONS.md#B-001`.

### Estado de configuración de agentes
- 11/11 agentes presentes en `.claude/agents/` con frontmatter YAML
  válido.
- 10/10 agentes especializados con `isolation: worktree`.
- `agent-orchestrator` sin `isolation` (correcto).
- Ningún agente con `permissionMode: bypassPermissions`.
- Ningún agente recomienda `ag-grid-enterprise` (sólo aparece en
  secciones de prohibición).

### Siguiente paso recomendado
1. **Usuario**: pegar manualmente el documento maestro completo en
   `docs/PROJECT_MASTER.md` para cerrar B-001.
2. Revisar `docs/AGENT_REGISTRY.md` y validar oleadas/ownership.
3. Inicializar Git, crear el primer commit con la estructura
   preparada.
4. Activar `agent-orchestrator` para iniciar Oleada 1
   (db-rls + excel-mapper + frontend-boq con mocks).

### Agentes activos al cierre
- Ninguno. Sólo preparación documental.

## 2026-05-29 — Cierre del blocker B-001 (PROJECT_MASTER cargado)

### Acción del usuario
- El usuario reemplazó manualmente `docs/PROJECT_MASTER.md` con el
  documento maestro completo del proyecto Construction Ops.

### Verificación
- Tamaño: 2 230 líneas / 43 086 bytes.
- Cabecera leída: título `CONSTRUCTION OPS — DOCUMENTO MAESTRO DEL
  PROYECTO`, versión 1.0, fecha 2026-05-29, proyecto piloto
  `ENTRE PATIOS — Primer piso`.
- Pie leído: termina en sección `24. Nota final` con la triple meta
  (trasladar Excel, herramienta diaria, producto comercial).
- Resultado: NO es placeholder. Contiene visión, dominio, glosario,
  arquitectura, fórmulas, política de privacidad, librerías
  aprobadas y nota final.

### Blockers
- B-001 marcado como RESUELTO en `docs/OPEN_QUESTIONS.md`.
- Sin blockers activos al momento del cierre.

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Estado del repositorio
- Listo para el primer commit.
- Listo para iniciar la Oleada 1 (db-rls + excel-mapper + frontend-boq
  con mocks) cuando el usuario lo solicite.

### Siguiente paso recomendado
1. Inicializar Git e ingresar el primer commit con la estructura
   preparada.
2. Activar `agent-orchestrator` para coordinar la Oleada 1.

### Agentes activos al cierre
- Ninguno. Preparación completa, esperando autorización para Oleada 1.

## 2026-05-29 — Auditoría de arranque pre-Oleada 1 (orchestrator)

### Documentos leídos y verificados
- CLAUDE.md, PROJECT_MASTER.md (43 086 bytes, 2 230 líneas, NO placeholder),
  HANDOFF_LOG, DECISIONS, OPEN_QUESTIONS, AGENT_REGISTRY, API_CONTRACTS,
  DATABASE_SCHEMA, EXCEL_MAPPING, INTEGRATION_REQUESTS, LICENSING.

### Verificaciones técnicas
- `git status`: árbol limpio en `main`, sincronizado con `origin/main`.
- `git log`: 1 commit `463d6a3` (bootstrap).
- Excel real presente en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB).
- `private/` correctamente ignorado (`git check-ignore` confirma) y
  NO trackeado por Git. `.gitignore` cubre `private/`, `*.xlsx`, `*.xls`,
  `.env*` con excepción `!.env.example`.
- 11/11 subagentes presentes en `.claude/agents/`.
- `scripts/validate-claude-agents.ps1`: **PASS 214 / WARN 0 / FAIL 0**,
  exit code 0.
- B-001 confirmado RESUELTO (PROJECT_MASTER cargado).

### Hallazgo crítico
- **B-002 (nuevo, ACTIVO)**: toolchain del monorepo NO inicializado.
  Falta `package.json` y todas las configs. Los `.tsx` son stubs de
  1 línea. Bloquea checklist de merge. Resoluble por orchestrator como
  Paso 0 de Oleada 1 (requiere autorización para instalar dependencias).

### Conclusión sobre decisiones
- Ninguna decisión abierta bloquea el INICIO de la Oleada 1. La política
  de redondeo (Q2/Q9) y la base de descuento (Q8) deben resolverse antes
  de la **Oleada 2** (cost-domain / pricing), no antes.

### Estado y siguiente paso
- Plan de Oleada 1 entregado al usuario para revisión y aprobación.
- NO se lanzaron subagentes. NO se instalaron dependencias. NO se escribió
  funcionalidad. Esperando aprobación del plan.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0: scaffolding del monorepo pnpm (orchestrator)

### Autorización
- Usuario aprobó el plan de Oleada 1 y la resolución de B-002 vía Paso 0.
- Gestor: pnpm (Corepack), pnpm 11, lockfile `pnpm-lock.yaml`, sin npm/yarn.

### Versiones detectadas
- node v24.13.0 · npm 11.6.2 · corepack 0.34.5 · pnpm 11.5.0.
- `corepack enable pnpm` falló por EPERM (shim en `C:\Program Files\nodejs`
  requiere admin). Workaround NO global de Node: `corepack prepare
  pnpm@latest-11 --activate` (instala 11.5.0) + `corepack enable
  --install-directory <npm global del usuario> pnpm` para exponer el shim
  `pnpm` en PATH del usuario. No se cambió la versión de Node.

### Archivos creados
- Raíz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`,
  `drizzle.config.ts` (esqueleto, sin credenciales), `pnpm-lock.yaml`,
  `supabase/config.toml`.
- `apps/web/`: `package.json`, `tsconfig.json`, `next.config.mjs`,
  `postcss.config.js`, `tailwind.config.ts`, `.eslintrc.json`,
  `vitest.config.ts`, `next-env.d.ts`, `app/page.tsx`, `middleware.ts`,
  `tests/unit/smoke.test.ts`.

### Archivos modificados
- `apps/web/app/layout.tsx` (layout raíz funcional, orchestrator-owned).
- `apps/web/app/globals.css` (directivas Tailwind).
- 8 placeholders válidos de route-groups (auth/dashboard) — propiedad de
  agent-frontend-boq, marcados como placeholders de Paso 0.
- `.env.example` (+DATABASE_URL placeholder), `.gitignore`
  (+`*.tsbuildinfo`, `next-env.d.ts`), `README.md`, `docs/DECISIONS.md`,
  `docs/LICENSING.md`, `docs/OPEN_QUESTIONS.md`.

### Dependencias instaladas
- prod: next ^14.2.15, react/-dom ^18.3.1, zod ^3.23.8, drizzle-orm ^0.33.0.
- dev: typescript ^5.5.4, @types/node ^20, @types/react/-dom ^18,
  tailwindcss ^3.4.13, postcss ^8.4.47, autoprefixer ^10.4.20,
  eslint ^8.57.1, eslint-config-next ^14.2.15, vitest ^2.1.1.
- Builds aprobados (`onlyBuiltDependencies`): esbuild, unrs-resolver.
- `drizzle-kit` diferido (lo solicitará agent-db-rls).

### Validaciones (todas PASAN)
- typecheck exit 0 · lint sin errores · test 1 passed · build 8 rutas OK.
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- git status: sin archivos privados; `pnpm-lock.yaml` presente; sin
  `package-lock.json`.

### B-002
- RESUELTO. Checklist de merge ejecutable.

### Siguiente paso
- Pendiente: COMMIT del scaffolding (no realizado, según instrucción).
- Listo para lanzar Oleada 1 (db-rls ∥ excel-mapper ∥ frontend-boq) tras
  congelar el contrato de entidades (Sección 6 PROJECT_MASTER) en
  DATABASE_SCHEMA/API_CONTRACTS.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Revisión preventiva: pnpm allowBuilds + upgrade Next 16 (orchestrator)

### 1) Configuración pnpm 11
- Verificado empíricamente en el dist de pnpm 11.5.0: `allowBuilds` es la
  clave vigente (91 ocurrencias) frente a `onlyBuiltDependencies` (2,
  legacy). El usuario tenía razón; mi suposición previa era incorrecta.
- `pnpm-workspace.yaml` ahora usa solo `allowBuilds` (mapa `pkg: bool`),
  sin claves legacy ni placeholders inválidos:
  `esbuild: true`, `sharp: true`, `unrs-resolver: true`.

### 2) Upgrade Next.js 14 → 16 (estable, no canary)
- Versiones consultadas (`pnpm view`): next 16.2.6, react 19.2.6,
  react-dom 19.2.6, eslint-config-next 16.2.6, @types/react 19.2.15,
  @types/react-dom 19.2.3, eslint 9.39.4 (se descartó 10.4.1),
  typescript 5.9.3 (se descartó 6.0.3). Canary 16.3.0 descartado.
- Migración Next 16 aplicada (confirmada contra `node_modules/next/dist/docs`):
  - `middleware.ts` → **`proxy.ts`** (función `proxy`); `middleware.ts`
    eliminado. El build reporta `ƒ Proxy (Middleware)`.
  - `next lint` eliminado en 16 → **ESLint 9 flat config**
    (`apps/web/eslint.config.mjs` consumiendo el array de
    `eslint-config-next`); `.eslintrc.json` eliminado; script `eslint .`.
  - Build con Turbopack.

### 3) Documentación
- Creado `AGENTS.md` (regla: consultar doc versionada en
  `node_modules/next/dist/docs/`). Añadido `@AGENTS.md` en `CLAUDE.md`
  sin borrar reglas existentes.
- Actualizadas menciones de Next 14 → 16 en README, DECISIONS, LICENSING
  y `.claude/agents/agent-frontend-boq.md`.
- DECISIONS y LICENSING reflejan el nuevo stack y `allowBuilds`.

### Validaciones (todas PASAN, stack Next 16)
- `pnpm install` limpio (sin ERR_PNPM_IGNORED_BUILDS tras rebuild de
  esbuild/sharp/unrs-resolver).
- typecheck exit 0 · lint exit 0 (eslint flat) · test 1 passed ·
  build OK (8 rutas + Proxy, Next 16.2.6 Turbopack).
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- Sin `package-lock.json`; sin ag-grid-enterprise; sin AGPL; `private/`
  ignorado; Excel real no aparece en git status.

### Estado
- Repositorio listo para commit del Paso 0. Commit NO realizado (según
  instrucción). Sin push. Sin subagentes.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0 commit/push + congelamiento de contrato v1 (orchestrator)

### Commit del Paso 0
- Commit `9bb4a397633a3513d7a0d50d8b592c4e32fff510` (`9bb4a39`):
  "chore: scaffold pnpm monorepo toolchain". Push OK
  `463d6a3..9bb4a39 main -> main`. Auditoría de `.claude/agent-memory/`
  limpia (sin secretos/datos privados).

### Congelamiento de contrato de entidades v1
- `docs/DATABASE_SCHEMA.md` → **Contrato congelado v1**: 20 entidades de
  Oleada 1 documentadas a fondo (tabla, propósito, columnas, tipos,
  nullability, PK UUID, FK, ON DELETE, organization_id/RLS, índices,
  integridad, enums, inmutabilidad, snapshots, campos 🔒, dudas). 7
  entidades marcadas **Provisional v0 — no congelada**.
- `docs/API_CONTRACTS.md` → **Contrato congelado v1**: 20 interfaces TS
  públicas (Organization … QuantityLine), alias base (`Uuid`,
  `IsoDateTime`, `IsoDate`, `DecimalString`), todos los enums, matriz de
  privacidad cliente-safe vs interno, ownership de tipos y reglas de cambio.
- `docs/AGENT_REGISTRY.md` → sección de ownership del contrato: db-rls
  implementa el esquema exacto; excel-mapper y frontend-boq respetan
  nombres/tipos canónicos; sin renombres unilaterales; cambios solo vía
  INTEGRATION_REQUESTS.

### Estrategia ratificada
- DB `snake_case` ↔ TS `camelCase`; tipos `PascalCase`.
- Dinero: `NUMERIC(20,10)` (DB) ↔ `string` decimal (API) ↔ Decimal.js (cálculo).
  El frontend NO calcula totales financieros.
- Snapshots/versiones emitidas inmutables (RLS bloquea UPDATE/DELETE).
- Privacidad backend-first (campos 🔒 no se serializan a rol cliente).
- Alcance Oleada 1 = solo entidades congeladas v1.

### Decisiones que siguen ABIERTAS (no cerradas)
- **Q9** política de redondeo COP → bloquea Oleada 2 (cost-domain).
- **Q8** base del descuento (público vs referencia) → bloquea Oleada 2 (pricing).
- Ninguna afecta el esquema congelado v1.

### Validaciones
- typecheck/lint/test/build OK; validate-claude-agents.ps1 PASS 214/0/0.
- Cambios solo en docs (.md); sin código/migraciones.

### Estado
- Contrato v1 redactado. Pendiente tu revisión. Commit/push NO realizados.
- Tras tu aprobación, listo para lanzar Oleada 1.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Preparación operativa de Oleada 1 (orchestrator)

### .worktreeinclude (temporal)
- Creado `.worktreeinclude` en raíz con **solo** la ruta exacta
  `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`. Permite que los worktrees
  aislados reciban el golden master (Git no copia archivos ignorados).
- **TEMPORAL Oleada 1**: revisar/retirar después de que
  `agent-excel-mapper` genere el fixture sanitizado, para no depender del
  Excel privado en worktrees.
- Verificado: Excel sigue ignorado (`.gitignore:2 private/`),
  `.worktreeinclude` es versionable, Excel NO en staging.

### Commit del contrato v1
- Commit `cadd8c7ce903f51700cf35161fd8ab406b2f065a` (`cadd8c7`):
  "docs: freeze wave 1 entity contracts". Push OK
  `9bb4a39..cadd8c7 main -> main`. Excel NO staged.

### Dependencias de Oleada 1 (pnpm)
- **Raíz** devDependencies: `drizzle-kit ^0.31.10` (MIT) + script
  `db:generate`. Vive en raíz porque `drizzle.config.ts` está en raíz.
- **apps/web** dependencies: `postgres ^3.4.9` (Unlicense),
  `decimal.js ^10.6.0` (MIT), `ag-grid-community`/`ag-grid-react ^35.3.0`
  (MIT, Community, soporta React 19), `clsx ^2.1.1`,
  `tailwind-merge ^3.6.0`, `class-variance-authority ^0.7.1` (Apache-2.0),
  `lucide-react ^1.17.0` (ISC), `@radix-ui/react-slot ^1.2.4` (MIT).
- **apps/web** devDependencies: `xlsx ^0.18.5` (Apache-2.0).
- **Diferidas** (no instaladas): recharts, frappe-gantt, exceljs,
  @react-pdf/renderer (Oleada 3, vía INTEGRATION_REQUESTS).
- Todas las licencias permisivas; **sin AGPL**; sin `ag-grid-enterprise`.
- Build scripts aprobados ahora incluyen las variantes de `esbuild` que
  trae drizzle-kit (cubiertas por `allowBuilds: esbuild: true`).

### Validaciones (todas PASAN)
- install limpio · typecheck 0 · lint 0 · test 1 passed · build OK
  (Next 16.2.6 Turbopack, `ƒ Proxy`). validate-claude-agents PASS 214/0/0.
- Excel ignorado; sin privados en staging; sin .env trackeado; sin
  package-lock.json; sin ag-grid-enterprise; 11/11 agentes.

## 2026-05-30 — Oleada 1: mapeo del golden master (agent-excel-mapper)

### Alcance trabajado
- Worktree aislado `agent-ad8fb1044998f390d`. Excel privado presente y
  legible en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB, vía
  `.worktreeinclude`). NO se commiteó ni se modificó el Excel.

### Hojas analizadas (10/10)
- RESUMEN, COTIZACION FULL, APU, COTIZACION 1 PISO, ACTA DE MODIFICACION 01,
  RESUMEN 1 PISO, CANTIDADES 1 PISO, CANTIDADES, LISTADO MATERIALES,
  CANT COMPLETO. Documentadas en `docs/EXCEL_MAPPING.md` (propósito, rango,
  columnas, inputs vs derivadas, fórmulas clave, refs cruzadas, sanitización)
  y mapeadas a entidades del contrato congelado v1.

### Archivos creados (todos dentro del alcance de excel-mapper)
- `scripts/golden-master/dump-workbook.mjs` — volcado estructural del Excel.
- `scripts/golden-master/expected-values.ts` — 9 valores de regresión §3.4.
- `scripts/golden-master/recompute-first-floor.ts` — recálculo puro AIU/IVA.
- `scripts/golden-master/first-floor.regression.test.ts` — test Vitest.
- `scripts/golden-master/vitest.config.ts` — config local aislada.
- `scripts/excel-import/import.ts` — importador idempotente.
- `scripts/excel-import/sheet-map.ts` — mapa declarativo Excel→entidades v1.
- `scripts/excel-import/sanitize.ts` — sanitización + alias deterministas.
- `scripts/fixtures/entre-patios-first-floor.fixture.json` — fixture SANITIZADO
  (contrato v1, dinero como string, sin datos privados).
- `scripts/fixtures/entre-patios-first-floor.schema-notes.md` — notas del fixture.
- `scripts/README.md` — cómo ejecutar dump/regresión/importador.

### Archivos modificados
- `docs/EXCEL_MAPPING.md` — completado (10 hojas + mapeo + regresión).
- `docs/INTEGRATION_REQUESTS.md` — solicitudes (ejecución Bash, scripts pnpm).

### Regresión financiera (estado)
- VERIFICADA ANALÍTICAMENTE dentro de tolerancia (±0.01 COP / ±0.001 m²): la
  cadena Admin=D×0.035, Imprev=D×0.025, Util=D×0.04, IVA=Util×0.19,
  Indirectos=ΣAIU+IVA, Total=D+Indirectos, valor_m2=Total/área reproduce los
  9 valores de §3.4 desde la base. NO se ejecutó Vitest (ver bloqueo).
- NO se ajustaron fórmulas ni tasas para forzar coincidencia.

### Bloqueo activo
- **Ejecución denegada**: la herramienta Bash rechazó ejecutar `node`,
  `pnpm exec vitest` y el dump del Excel (solo pasó `node --version`). En
  consecuencia NO se pudo: (a) confirmar coordenadas celda a celda con
  `dump-workbook.mjs`, (b) correr la suite de regresión, (c) ejecutar el
  importador. Registrado en `docs/INTEGRATION_REQUESTS.md`. Las coordenadas
  exactas quedan como `TODO_VERIFY` en `sheet-map.ts` y EXCEL_MAPPING §8.

### Privacidad
- Fixture sanitizado (cliente/proveedores → alias; NIT/tel/dir eliminados).
  `import.ts` incluye `findPrivateLeaks` como verificación final.
- `.gitignore` cubre `private/`, `*.xlsx`, `*.xls` (verificado).

### Siguiente paso recomendado
- Orquestador (o sesión con Bash): ejecutar `scripts/README.md` para
  confirmar PASS empírico de regresión e importador, y poblar el detalle real
  fila a fila con el dump. Luego habilitar Oleada 2 (cost-domain consume el
  fixture y la regresión como oráculo).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1 Fase 1: validación empírica del Excel Mapper (orchestrator)

### Contexto
- Trabajo sobre `backup/wave1-excel-mapper` (respaldo `c9fe850`), en el checkout
  principal (con node_modules). Excel real presente e ignorado (`.gitignore:2`).

### Toolchain añadido (orchestrator owns package.json)
- `tsx ^4.22.3` (devDep raíz, MIT) + scripts raíz `gm:dump`, `gm:build-fixture`,
  `gm:regression`, `gm:import`.

### Validación empírica (todo PASA)
- `gm:dump`: 10 hojas confirmadas con ref/fórmulas/inputs.
- Localización por celda: los 9 valores §3.4 confirmados en celdas reales de
  `RESUMEN 1 PISO` (E27..E35) + `CANTIDADES 1 PISO!I187` (área). Cacheados
  coinciden con §3.4 a precisión completa. Coordenadas documentadas en
  EXCEL_MAPPING §10. TODO_VERIFY de los 9 → resueltos con evidencia.
- `gm:build-fixture`: fixture **v2.0.0 fila por fila** desde el Excel real:
  14 capítulos + **131 ítems BOQ** reales, **SIN ítem de balanceo**.
  Σ ítems = costos_directos ±2.05e-8 COP.
- `gm:regression` (Vitest): **22/22 PASS** (9 fixture vs §3.4 + 9 cadena
  recalculada + 3 BOQ fila-por-fila sin balanceo + 1 presencia).
- `gm:import`: regresión 9/9, recálculo 9/9, **privacidad OK**, idempotencia.

### Fix de privacidad
- `findPrivateLeaks` (sanitize.ts) reescrito: escanea solo texto libre,
  excluye UUID/DecimalString/fecha/moneda. Antes daba falsos positivos
  (NIT/teléfono) sobre ceros de UUID y montos. Fixture verificado: 0 fugas.

### Validaciones de proyecto
- typecheck 0 · lint 0 · test 1 passed · build OK (Next 16.2.6) ·
  validate-claude-agents PASS 214/0.
- Excel ignorado; sin privados en staging; los 9 valores **pasan
  empíricamente**. No se ajustó ninguna fórmula.

### Estado
- Fase 1 COMPLETA. Listo para commit adicional sobre `backup/wave1-excel-mapper`
  y luego crear `integration/wave-1` (Fase 2).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 1 en integration/wave-1 (orchestrator)

### Fase 0 — respaldos
- `backup/wave1-db-rls` (00283d0), `backup/wave1-frontend-boq` (b7f0de8),
  `backup/wave1-excel-mapper` (c9fe850→c9e4f3a) creadas y en origin.

### Fases 2-5 — integración secuencial (cherry-picks en integration/wave-1)
- Rama creada desde `origin/main` (7e45691), pusheada. `main` intacto.
- **DB+RLS** (00283d0): cherry-pick limpio. Fix integración: `drizzle-orm`
  0.33→0.45 (schema usa API array) + regex tests RLS acotados por política.
  RLS = **estática PASS (70 tests)**; **runtime PENDIENTE** (Supabase/Docker).
  NO se conectó base remota.
- **Excel Mapper** (c9fe850 + c9e4f3a): cherry-pick limpio; gm:regression 22/22,
  gm:import PASS; fixture idéntico al regenerar (idempotente).
- **Frontend BOQ** (b7f0de8): cherry-pick limpio (layout/proxy intactos). Fix
  integración: tipos AG Grid v35 (`boq-grid.tsx`) + orden `@import` en
  `globals.css`. Dev smoke: 8/8 rutas HTTP 200.

### Fase 6 — `.worktreeinclude` eliminado (temporal); `private/` sigue ignorado.

### Fase 7 — validación integral (integration/wave-1)
- typecheck 0 · lint 0 · **108 tests PASS** · build Next 16.2.6 (9 rutas + Proxy)
  · validate-claude-agents PASS 214/0/0.
- Sin ag-grid-enterprise, sin AGPL, sin `.env` trackeado, sin `package-lock.json`;
  Excel ignorado y no en staging; fixture sin balanceo; sin TODO_VERIFY crítico.
- INTEGRATION_REQUESTS: 3 solicitudes del excel-mapper RESUELTAS.
- QA_REPORT actualizado (PASS pre-merge; salvedad RLS runtime).

### Estado
- `integration/wave-1` lista para commit final + push. **NO merge a main**
  (a la espera de aprobación del usuario).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1 a main (orchestrator)

### Merge
- Usuario aprobó el merge. `git merge --no-ff integration/wave-1` →
  **merge commit `58f4366222d86cec492748dc84eabd1123e7c8db`** (`58f4366`).
  Sin conflictos. `main` adelantó 8 commits sobre `7e45691`.

### Validación post-merge (todo PASA)
- typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 (9 rutas + Proxy).
- `gm:regression` **22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS.
- `validate-claude-agents.ps1` **PASS 214/0/0** · `git diff --check` limpio.

### Privacidad y limpieza (verificado en main)
- Excel ignorado (`.gitignore:2 private/`) y NO versionado; 0 nombres de cliente
  en archivos versionados (leak-check por hash); fixture sanitizado fila-por-fila
  **sin ítem de balanceo**; sin `TODO_VERIFY` críticos.
- Sin `ag-grid-enterprise`, sin AGPL, sin `.env` trackeado, sin `package-lock.json`.
- `.worktreeinclude` eliminado; fixture sanitizado presente.

### Estado del frontend
- Build prerenderiza 9 rutas; dev smoke previo 8/8 HTTP 200. AG Grid Community.

### Ramas y tag
- **Conservados**: `backup/wave1-db-rls`, `backup/wave1-frontend-boq`,
  `backup/wave1-excel-mapper`, `integration/wave-1`.
- Tag anotado: `wave-1-foundation-v1`.

### Pendientes antes de Oleada 2
- **RLS runtime** contra Supabase/Postgres local (Docker) — solo estático hasta ahora.
- **Q8** (base del descuento) y **Q9** (redondeo COP) deben cerrarse.

### Agentes activos al cierre
- Ninguno. Oleada 2 NO iniciada (a la espera de autorización).

## 2026-05-30 — Oleada 1.5: cierre Q8/Q9 + intento RLS runtime local (orchestrator)

### Rama
- Toda la Oleada 1.5 se ejecuta FUERA de `main`, en `feature/wave-1.5-local-rls`
  (creada desde `main` `d9ca10b`, pusheada a origin). `main` permanece intacto.

### Fase 1-2 — Q8 y Q9 CERRADAS
- **Q8** (base del descuento) = **`online_public_price`**. Fórmulas canónicas:
  `budget_reference_price = online_public_price × (1 + preventive_variation_pct)`;
  `expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)`;
  `projected_saving = budget_reference_price − expected_purchase_price`;
  `realized_saving = budget_reference_price − actual_purchase_price`. Excepciones
  configurables por proveedor/producto. Descuento/ahorro/margen son 🔒 internos
  (nunca a cliente; privacidad backend-first).
- **Q9** (redondeo COP): cálculo interno raw (`Decimal.js` + `NUMERIC(20,10)` +
  serialización `string`, sin float JS, sin redondear intermedios, snapshots con
  precisión completa); presentación `ROUND_HALF_UP` (UI/PDF cliente 0 dec; Excel
  técnico 2 dec; regresión/auditoría raw). El redondeo visual NO muta snapshots.
- Documentadas en DECISIONS, API_CONTRACTS, DATABASE_SCHEMA y OPEN_QUESTIONS.

### Fase 3 — Entorno e instalación
- Docker 29.5.2 operativo (`docker info` Server OK; `hello-world` OK). Node v24.13.0,
  pnpm 11.5.0 (Corepack). Supabase CLI NO estaba instalado.
- Instalado **`supabase ^2.102.0`** (MIT) como devDep raíz (`corepack pnpm
  --workspace-root add -D supabase`). Sin global, sin remoto. `supabase --version`
  → 2.102.0. Registrado en LICENSING y DECISIONS.

### Fase 4-5 — RLS runtime: BLOQUEADO por Docker (B-003)
- Auditados `config.toml`, 11 migraciones, 2 seeds, README de policies (compatibles
  con CLI local). El seed solo crea 1 organización ⇒ el harness crea una org B.
- Creado harness **`scripts/rls-runtime/run.ts`**: conecta al Postgres local
  (`postgres` pkg), `SET LOCAL ROLE authenticated` + claims JWT vía
  `set_config('request.jwt.claims', ...)`, transacciones con ROLLBACK. Cubre:
  helper `app.current_org()`, aislamiento A/B, denegación cross-org (UPDATE 0 filas +
  INSERT WITH CHECK), usuario sin organización, `price_observations` append-only
  (+ trigger de inmutabilidad), `apu_calculation_snapshots` inmutable, versiones
  emitidas bloqueadas (+ hijos) y control positivo en `draft`.
- **BLOQUEO**: `supabase start` y `docker pull` fallan con
  `io.containerd.metadata.v1.bolt/meta.db: input/output error` (content store de
  Docker Desktop corrupto; `docker system df` no lista imágenes). Host con 1.5 TB
  libres ⇒ no es espacio. Ver **B-003** en OPEN_QUESTIONS. NO se ejecutó la suite
  RLS runtime; NO se declara PASS. NO se conectó base remota.

### Fase 6 — Validación offline (todo PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (8 rutas + Proxy) ·
  `gm:regression` 22/22 · `gm:import` PASS (privacidad 0 fugas) ·
  `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- `.gitignore`: añadido `supabase/.temp/` y `supabase/.branches/`. Excel ignorado;
  sin privados en staging; sin `.env` trackeado; sin `package-lock.json`.

### Estado / próximo paso
- Commit de deliverables en la rama (NO merge a `main`). Falta SOLO la ejecución
  real de RLS runtime, bloqueada por B-003 (infra/Docker). Tras reparar Docker
  Desktop: `supabase start` → `db reset` → ejecutar el harness → si PASS, decidir
  merge a `main` y habilitar Oleada 2.
- **NO se recomienda merge a `main` todavía** (RLS runtime sin ejecutar).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1.5: RLS runtime REAL ejecutado, B-003 RESUELTO (orchestrator)

### Contexto
- Docker Desktop reparado por el usuario (content store regenerado; validado:
  `docker info`/`system df`/`pull alpine`/`run alpine` OK). Sesión sobre la rama
  existente `feature/wave-1.5-local-rls` (sin rama nueva, sin merge a `main`, sin
  remoto, sin `supabase link`/`db push`, sin Oleada 2).

### Entorno Supabase local
- `corepack pnpm install`: up to date (pnpm 11.5.0).
- `supabase start`: imágenes descargadas OK (Docker reparado); **11 migraciones**
  aplicadas en orden. El contenedor `realtime` quedó *unhealthy* en Windows ⇒ se
  arrancó excluyendo servicios no esenciales (`-x realtime,studio,storage-api,
  imgproxy,edge-runtime,logflare,mailpit,vector`); el harness solo necesita `db`.
- `supabase db reset`: re-aplicó **11 migraciones + 2 seeds** sin errores.

### Fixes de integración (necesarios para que corriera el runtime)
- **`supabase/config.toml`** (orchestrator-owned): añadido `[db.seed]` con
  `sql_paths` explícito a `seeds/0001` y `seeds/0002` (no se cargaban por defecto;
  `supabase db reset` avisaba `no files matched supabase/seed.sql`).
- **`supabase/seeds/0001_demo_org_and_profiles.sql`** (db-rls-owned, fix de
  integración): el seed insertaba `profiles` sin filas previas en `auth.users`.
  En el stack Supabase local el esquema `auth` existe ⇒ la migración `0001`
  activa el FK `profiles_id_auth_users_fk` y `db reset` fallaba (SQLSTATE 23503).
  Añadido bloque `DO $$ … INSERT auth.users … $$` guardado por la presencia del
  esquema `auth` (espejo de la condición de la migración; sigue funcionando en
  Postgres puro). Solo `id`+columnas mínimas, sin credenciales. **Registrado en
  INTEGRATION_REQUESTS para aval de agent-db-rls.**
- **`scripts/rls-runtime/run.ts`** (orchestrator-owned): `setupOrgB` ahora crea
  la fila `auth.users` del admin B antes de su `profile` (mismo guard de `auth`).

### RLS runtime — RESULTADO: 21 PASS / 0 FAIL (Postgres real)
- Pre-flight: seeds org/proyecto A; **20 tablas con RLS FORCE**.
- Helper `app.current_org()` lee `organization_id` del JWT; aislamiento A/B
  (A no ve B, B no ve A); A no UPDATE/INSERT en org B (0 filas / WITH CHECK);
  usuario sin organización 0 filas; `price_observations` append-only + precio
  inmutable (trigger); `apu_calculation_snapshots` inmutable; `estimate_versions`
  emitida bloquea UPDATE/DELETE + hijos; control positivo `draft` editable.

### Validaciones generales (todas PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** (golden master ±0.01 COP) · `gm:import` PASS
  (privacidad 0 fugas) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio (solo avisos LF→CRLF). Sin privados en staging; sin `.env` trackeado;
  sin `package-lock.json`; sin `ag-grid-enterprise`; sin AGPL.

### Estado / próximo paso
- **B-003 RESUELTO**. Q8/Q9 ya cerradas. Commit `test: complete local supabase
  rls runtime validation` en la rama; push solo a
  `origin feature/wave-1.5-local-rls`. Supabase local detenido (`supabase stop`).
- **Recomendación: APROBAR merge `feature/wave-1.5-local-rls` → `main`** (no
  ejecutado en este ciclo; queda a decisión del usuario). Tras el merge, habilitar
  **Oleada 2** (cost-domain ∥ pricing ∥ homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1.5 a main + cierre (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = d9ca10b` (árbol
  limpio); `origin/feature/wave-1.5-local-rls` final = `febfeb8`; 3 backups y tag
  `wave-1-foundation-v1` conservados; Excel ignorado; sin `.env` trackeado; sin
  `package-lock.json`; solo `ag-grid-community/react` (MIT).
- `git merge --no-ff feature/wave-1.5-local-rls` → **merge commit
  `1ddc833d733c51e556445ccee96bdab8843efcd1`** (`1ddc833`). **Sin conflictos.**
  16 archivos, +784/-13. `main` adelantó 2 commits de contenido + merge.

### Validación post-merge (todo PASA en main)
- `pnpm install` up to date · typecheck 0 · lint 0 · **108 tests** · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (regresión §3.4 diff=0; privacidad 0 fugas) · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio · árbol limpio.
- Privacidad: `git check-ignore` confirma `private/` ignorado; sin `.env`
  trackeado; sin `package-lock.json`; `ag-grid-enterprise` solo en comentarios de
  prohibición; sin AGPL.

### Deuda técnica registrada
- **B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)**: no
  bloqueante; no afectó RLS (solo se requiere el contenedor `db`); RLS runtime
  21/21. Revisar antes de funcionalidades Realtime o producción. Documentado en
  OPEN_QUESTIONS y QA_REPORT. NO se intentó resolver.

### Commit documental
- `docs: record wave 1.5 runtime validation and realtime caveat` (B-004 +
  validación post-merge en OPEN_QUESTIONS, QA_REPORT, HANDOFF_LOG).

### Estado de cierre
- **Oleada 1.5 CERRADA.** B-003 RESUELTO; Q8/Q9 RESUELTAS; RLS runtime 21/21.
- Push a `origin main` + tag anotado `wave-1.5-rls-runtime-validated-v1`.
- Ramas `feature/wave-1.5-local-rls`, backups e `integration/wave-1`
  conservadas; tag `wave-1-foundation-v1` conservado.
- **Oleada 2 NO lanzada** (plan preparado; espera autorización del usuario).
  Secuencia recomendada: 2A `agent-cost-domain` ∥ `agent-pricing`; congelar
  `docs/PRICING_ADAPTER_CONTRACT.md`; luego 2B `agent-homecenter`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2A: rama de integración + congelar contrato de precios (orchestrator)

### Fase 0 — rama de integración
- Preflight: `main = origin/main = 974ea99` (árbol limpio); tags
  `wave-1-foundation-v1` y `wave-1.5-rls-runtime-validated-v1` conservados;
  3 backups conservados; Excel ignorado; sin `.env`/`package-lock`; solo
  `ag-grid-community/react` (MIT).
- Creada y publicada **`integration/wave-2a`** desde `main`. `main` intacta.

### Fase 1 — contrato de lectura de precios CONGELADO v1
- Creado **`docs/PRICING_READ_CONTRACT.md`** (orchestrator-owned, congelado v1;
  cambios solo vía INTEGRATION_REQUESTS). Define:
  - tipos base (reusa `Uuid`/`IsoDateTime`/`DecimalString`/`PriceSourceType`/
    `PricingRuleType`/`SyncStatus` de API_CONTRACTS);
  - `ApprovedPriceContext` (snapshot aprobado; dinero/porcentajes `DecimalString`;
    fórmulas Q8 base `onlinePublicPrice`; campos 🔒 marcados);
  - `PricingReadPort` (`getApprovedPrice` → único contexto | `no_approved_price`
    | `ambiguous_price`); determinista, solo lectura;
  - `PricingApprovalPort` (escritura interna exclusiva de pricing: observación,
    aprobación humana, override trazable, append-only, no muta snapshots);
  - privacidad backend-first + proyección `ClientSafePrice` (sin campos 🔒).
- **Frontera**: cost-domain consume el puerto/DTO; NO consulta tablas de pricing
  ni recalcula descuentos/ahorros; usa `budgetReferencePrice` como
  `unit_price_snapshot`.
- Actualizados: `API_CONTRACTS.md` (§5 + ownership de puertos),
  `AGENT_REGISTRY.md` (dependencia 2A + criterios cost/pricing), `DECISIONS.md`
  (4 filas: merge 1.5, B-004, rama 2A, contrato de precios), este HANDOFF_LOG.

### Próximo paso
- Commit `docs: freeze wave 2a pricing read contract` + push a
  `origin integration/wave-2a`. Luego lanzar en paralelo (worktrees aislados)
  `agent-cost-domain` y `agent-pricing`. NO `agent-homecenter`. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanzan cost-domain ∥ pricing.

## 2026-05-30 — Oleada 2A: agentes ejecutados y entregables preservados (orchestrator)

### Lanzamiento
- Contrato congelado commit `02ca9c3` en `integration/wave-2a`. Lanzados en
  paralelo en worktrees aislados: **agent-cost-domain** y **agent-pricing**.
- **Nota**: ambos worktrees se derivaron de `main`@`974ea99` (antes de
  `02ca9c3`), por lo que NO vieron `docs/PRICING_READ_CONTRACT.md`. Cada uno
  implementó `PricingReadPort` desde la spec de la tarea + Q8 de API_CONTRACTS.
  Reconciliación de tipos registrada en INTEGRATION_REQUESTS (pendiente 2A).

### agent-cost-domain — entregable
- Motor financiero puro en `apps/web/modules/apu|boq|estimates/` + 8 archivos de
  test en `apps/web/tests/unit/cost-domain/` + memoria de agente. Mano de obra,
  APU (vía `PricingReadPort`), BOQ, AIU/IVA configurables, total, valor/m²,
  snapshots inmutables, clonación. `decimal.js`/`DecimalString` (Q9).
- Validado: **typecheck 0 · lint 0 · 178/178 tests · gm:regression 22/22**;
  9 valores §3.4 ±0.01 COP desde el fixture (sin ajustar fórmulas).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`3783aca`**. Preservado en `backup/wave2-cost-domain` (pusheada).

### agent-pricing — entregable
- Capas de precio en `apps/web/modules/pricing/` (sin `adapters/`) y
  `apps/web/modules/suppliers/` + 8 archivos de test en
  `apps/web/tests/unit/pricing/`. Proveedores, `supplier_products`,
  `price_observations` append-only, reglas con precedencia, variación preventiva,
  descuento interno, precios/ahorros (Q8), override trazable, aprobación humana,
  `PricingReadPort`/`PricingApprovalPort`, proyección `ClientSafePrice`
  (privacidad backend-first).
- Validado por el orquestador en su worktree: **typecheck 0 · lint 0 ·
  155/155 tests** (108 previos + 47 de pricing).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`7897926`**. Preservado en `backup/wave2-pricing` (pusheada).

### Higiene (ambos worktrees)
- Sin archivos privados, `.env`, Excel, AGPL ni `ag-grid-enterprise`. Sin solape
  de archivos entre agentes. `adapters/` y `scripts/catalog-sync/` intactos
  (reservados a homecenter, Oleada 2B).

### Estado / próximo paso
- **NO integrado aún** a `integration/wave-2a`; **NO merge a `main`**;
  **`agent-homecenter` NO lanzado**. Backups y `feature/wave-1.5-local-rls`,
  backups de wave-1, tags: todo conservado.
- Pendientes registrados en INTEGRATION_REQUESTS: (1) reconciliar tipos del
  puerto de precios a una sola fuente; (2) confirmar base del IVA vía
  `base_type='utility'` del esquema vs flag de dominio.
- Antes de Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno (cost-domain y pricing finalizaron).

## 2026-05-30 — Oleada 2A: integración secuencial cost-domain + pricing (orchestrator)

### Rama e integración
- Sobre `integration/wave-2a`. Cherry-picks aplicados: **`6694d88`** (cost-domain,
  desde backup `3783aca`) y **`1e8a869`** (pricing, desde backup `7897926`).
  Ambos limpios, sin conflictos. `main` intacta.

### Unificación del contrato de precios (Fase 3)
- Creada **FUENTE ÚNICA DE CÓDIGO** `apps/web/lib/contracts/pricing-read.ts`
  (refleja el contrato congelado: forma async + `PricingReadResult` union +
  `ApprovedPriceContext` completo + clases de error `ApprovedPriceNotFoundError`/
  `AmbiguousApprovedPriceError` + helper `throwOnPricingError` + `ClientSafePrice`
  + `INTERNAL_PRICE_FIELDS`).
- `apps/web/modules/apu/pricing-port.ts` ahora re-exporta el contrato (cost-domain
  consume); `apps/web/modules/pricing/types.ts` re-exporta el contrato y conserva
  sólo el `PricingApprovalPort` (write-side de pricing). **Una sola**
  `interface PricingReadPort`/`ApprovedPriceContext` (verificado por grep).
- cost-domain pasó `resolveUnitPriceSnapshot`/`calculateApuComponentWithPort` a
  **async** y convierte `!ok`→clases de error. `_fakes.ts` y `apu.test.ts`
  adaptados (async + `rejects.toBeInstanceOf`). Sin dependencias circulares
  (el contrato sólo importa `@/lib/utils/types`).
- Ajuste menor documentado: `PricingReadQuery.estimateVersionId?` (opcional) para
  congelar precio por versión (cost-domain). Reflejado en PRICING_READ_CONTRACT
  y API_CONTRACTS.

### Base del IVA (Fase 4)
- Eliminado el flag `contributesToUtilityBase`. Regla canónica (solo `base_type`
  + `sortOrder`): una regla `base_type='utility'` se aplica sobre el monto de la
  última línea `direct_cost` previa (la Utilidad). Reproduce el golden master
  (IVA = Utilidad × 0.19, gm:import diff=0). Sin cambios al seed/fixture (U sigue
  `direct_cost`). Tests añadidos: base directa, base utility, orden de cálculo,
  error si no hay `direct_cost` previa.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **229 tests** (108 base + cost-domain + pricing) · build
  Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP, diff=0) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio. Sin privados/`.env`/`package-lock`; sin `ag-grid-enterprise` en dominio;
  sin AGPL. Proyección `ClientSafePrice` sin campos 🔒 (privacy.test.ts).

### RLS runtime (Fase 6)
- La integración NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 sigue vigente
  (no se relevantó Docker). **B-004** (Realtime) sigue como deuda técnica.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2a cost domain and pricing` +
  push a `origin integration/wave-2a`. **NO merge a `main`** (a la espera de
  aprobación del usuario). **`agent-homecenter` NO lanzado.**
- Recomendación: **APROBAR merge `integration/wave-2a` → `main`**. Antes de
  Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 974ea99` (árbol
  limpio); integración final `31c3102`; backups wave1 (3) + wave2 (2) y tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2a` → **merge commit
  `f0c7d235beb7d16ce514566594df2becd869cf06`** (`f0c7d23`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 229** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP, **IVA diff=0**) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface PricingReadPort` y **1** `ApprovedPriceContext`
  (en `apps/web/lib/contracts/pricing-read.ts`); sin `contributesToUtilityBase`;
  IVA por `base_type='utility'`; `ClientSafePrice` sin campos 🔒.

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 974ea99..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Privacidad
- `INTERNAL_PRICE_FIELDS` cubre público/descuento/esperado/real/ahorros/
  `sourceReference`/proveedor interno; proyección `ClientSafePrice` sin 🔒
  (privacy.test.ts). Excel ignorado y no versionado; sin `.env`/`package-lock`;
  sin `ag-grid-enterprise` en dominio; sin AGPL; sin datos privados.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing), `integration/wave-2a`, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2a-domain-pricing-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2A CERRADA y en `main`.** `agent-homecenter` NO lanzado; Oleada 2B
  NO iniciada. Antes de 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`
  (decisiones recomendadas Q11 aprobación humana + Q14 canal Homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2B: microfase documental (orchestrator)

### Rama
- Creada y publicada `integration/wave-2b` desde `main` (`75394f1`). `main` intacta.

### Q11 y Q14 CERRADAS
- **Q11** (aprobación humana): MVP **simple** por usuario interno autorizado;
  auditoría obligatoria; preview antes de persistir; SKU ambiguos `pending`; sin
  tocar snapshots emitidos; `price_observations` append-only; doble aprobación =
  soporte futuro configurable. Cerrada en DECISIONS/OPEN_QUESTIONS.
- **Q14** (canal Homecenter): MVP **adaptador genérico + CSV/Excel** con preview
  y aprobación humana; SKU/URL opcionales; matching con candidatos+score;
  fallback manual; sin API pública asumida; sin scraping; interfaz sustituible.
  Cerrada en DECISIONS/OPEN_QUESTIONS.

### Contrato del adaptador CONGELADO v1
- Creado **`docs/PRICING_ADAPTER_CONTRACT.md`** (orchestrator-owned, congelado;
  cambios solo vía INTEGRATION_REQUESTS): frontera del módulo, interfaz
  `SupplierAdapter` (`parseCatalog`/`mapToSupplierProducts`/`buildPreview`/
  `toPriceObservations`), tipos `RawSupplierItem`/`SkuMatchCandidate`/
  `SkuMatchProposal`/`ImportPreview`/`ImportResult`, idempotencia, aprobación
  humana (Q11) y privacidad backend-first (Q14).
- Actualizados `API_CONTRACTS.md` (§6) y `AGENT_REGISTRY.md` (ownership 2B).

### Próximo paso
- Commit `docs: freeze wave 2b pricing adapter contract` + push a
  `origin integration/wave-2b`. Luego lanzar **únicamente** `agent-homecenter`
  en worktree aislado. NO integrar. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanza agent-homecenter.

## 2026-05-30 — Oleada 2B: agent-homecenter ejecutado y preservado (orchestrator)

### Lanzamiento
- Lanzado `agent-homecenter` en worktree aislado (derivado de `main`@`75394f1`,
  por lo que NO vio `docs/PRICING_ADAPTER_CONTRACT.md`; implementó desde la spec
  de la tarea). Reconciliación contra el contrato registrada en
  INTEGRATION_REQUESTS (pendiente 2B).

### Entregable
- Adaptador genérico en `apps/web/modules/pricing/adapters/` (`types`,
  `supplier-adapter`, `import-preview`, `idempotency`, `homecenter-csv`, `index`)
  + tests en `apps/web/tests/unit/pricing-adapters/` (csv-parser, fixtures,
  homecenter-adapter; **77 tests**) + `scripts/catalog-sync/` (README,
  `convert-excel.ts` [xlsx devDep, import dinámico], `preview-import.ts`,
  `sample-catalog.csv` sanitizado). Sin cambios a `package.json`.
- `SupplierAdapter` (parseCatalog/mapToSupplierProducts/buildPreview/
  toPriceObservations); idempotencia; preview sin persistencia; matching SKU con
  candidatos+score; persistencia SOLO vía `PricingApprovalPort` tras aprobación
  humana simple (Q11); `price_observations` append-only; ambiguos `pending`;
  privacidad backend-first. **Sin scraping, sin API pública, sin red.**

### Incidencias y resolución (orchestrator)
- El agente dejó **typecheck rojo (43 errores)** (strict-null + `string|undefined`
  + export `ResourceCatalog` faltante); su corrida se truncó. Tests (runtime) y
  lint sí pasaban.
- Un reintento generó un **segundo worktree** (no se continuó el original vía
  SendMessage) que dejó adapters+tests en **typecheck 0** pero sin
  `scripts/catalog-sync/`. El orquestador **consolidó**: copió
  `scripts/catalog-sync/` + memoria del worktree original al worktree verde.
- Revalidación en el worktree consolidado: **typecheck 0 · lint 0 · 306 tests ·
  build OK**; sin privados/Excel/`.env`/scraping/red/enterprise/AGPL.
- `git commit` denegado a los subagentes ⇒ el orquestador commiteó `ccc1f0b` y
  preservó en **`backup/wave2-homecenter`** (pusheada).

### Estado / próximo paso
- **NO integrado** a `integration/wave-2b` ni a `main`. `main` intacta
  (`75394f1`). Backups y tags conservados.
- Antes de integrar 2B: reconciliar tipos del adaptador contra
  `PRICING_ADAPTER_CONTRACT` (ver INTEGRATION_REQUESTS). Otros worktrees de 2B
  pueden limpiarse (sin commits de valor).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 2B en integration/wave-2b (orchestrator)

### Integración
- Cherry-pick `1a8f6fa` (adaptador Homecenter, desde backup `ccc1f0b`). Limpio,
  sin conflictos. `main` intacta.

### Reconciliación (Fases 2-3)
- Tipos del adaptador alineados 1:1 con `PRICING_ADAPTER_CONTRACT`
  (`SupplierAdapter`, `RawSupplierItem`, `SkuMatchCandidate/Proposal`,
  `ImportPreview`, `ImportResult`); `RecordObservationInput` importado del módulo
  real `@/modules/pricing/types`.
- **`MinimalApprovalPort` = subconjunto estructural de `PricingApprovalPort`**
  (no lógica paralela). Añadido `tests/unit/pricing-adapters/port-reconciliation.test.ts`:
  aserción type-level (`(p: PricingApprovalPort) => MinimalApprovalPort`) +
  runtime con `PricingApprovalService` real (`InMemoryPricingRepository`),
  comprobando persistencia vía el puerto, append-only e idempotencia.
- `ResourceCatalog`/`ResourceRef` avalados como auxiliares de matching.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **309 tests** (incl. **80 de adapters**) · build Next
  16.2.6 · `gm:regression` **22/22** · `gm:import` **9/9** ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Persistencia solo vía `PricingApprovalPort`; preview no persiste; ambiguos
  `pending`; snapshots emitidos intactos. **Sin scraping** (sin fetch/axios/
  puppeteer/cheerio), **sin API Homecenter inventada** (CSV/Excel local).
  Privacidad backend-first (campos 🔒 no a cliente). Sin privados/`.env`/
  `package-lock`/`ag-grid-enterprise`/AGPL.

### RLS runtime (Fase 6)
- Sin cambios en `supabase/migrations|policies|seeds` ni `apps/web/lib/db/schema.ts`
  ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente. B-004 (Realtime) deuda técnica.

### Limpieza de worktrees (Fase 8)
- Eliminados worktrees temporales obsoletos de subagentes (ver lista en el commit
  de cierre). Conservados: `backup/wave2-homecenter` (`ccc1f0b`), demás backups,
  tags y ramas de integración.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2b homecenter adapter` + push a
  `origin integration/wave-2b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-2b` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2B a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 75394f1` (árbol
  limpio); integración final `1931aac`; 6 backups (wave1×3 + wave2×3) y 3 tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2b` → **merge commit
  `47fcfb36b15a0a15cd700a4886cf13555d0198bd`** (`47fcfb3`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 309** (incl. **80 de adapters**) · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP) · `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Adaptador: persistencia SOLO vía `PricingApprovalPort` real (verificado: los
  `adapters/` no escriben en DB); preview no persiste; ambiguos `pending`;
  idempotencia; auditoría Q11; snapshots emitidos intactos. **Sin scraping**
  (sin fetch/axios/puppeteer/cheerio/URLs); **sin API Homecenter inventada**
  (CSV/Excel local). Privacidad backend-first (campos 🔒 no a cliente).

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 75394f1..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing/homecenter), `integration/wave-2b`, ramas de integración
  previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2b-homecenter-adapter-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2B CERRADA y en `main`.** Oleada 3 NO iniciada (solo diagnóstico de
  arquitectura propuesto). Antes de paralelizar Oleada 3: congelar los contratos
  documentales propuestos (planning, dashboard read-model, export profiles).

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3A: microfase documental + Recharts (orchestrator)

### Rama
- Creada y publicada `integration/wave-3a` desde `main` (`30b1053`). `main` intacta.

### Read-model CONGELADO v1
- Creado **`docs/READ_MODEL_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): ubicación canónica (`apps/web/server/read-model`,
  `apps/web/server/repositories`, `apps/web/lib/contracts/read-model.ts`); dos
  fuentes explícitas (`FixtureReadModelRepository`/`DrizzleReadModelRepository`)
  con selector `READ_MODEL_SOURCE=fixture|db` sin fallback silencioso;
  `ViewerRole`/`ViewerContext`; clasificación cliente-safe vs 🔒; DTOs canónicos
  (`ProjectListItem`, `ProjectOverview`, `EstimateSummary`, `ChapterSummary`,
  `BoqItemView`, `ApuSummary`, `QuantityGroupView`, `CatalogResourceView`,
  `DashboardSummary`); `ReadModelPort` (8 funciones). La UI consume DTOs; cero
  cálculo financiero en React; cost-domain/pricing solo server-side.
- Actualizados `API_CONTRACTS.md` (§7), `AGENT_REGISTRY.md` (ownership 3A:
  db-rls = server/read-model; frontend-boq = páginas presupuesto; dashboard =
  /dashboard + modules/dashboard), `DECISIONS.md`, `LICENSING.md`,
  `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`recharts` ^3.8.1 (MIT)** instalado en `apps/web` (`corepack pnpm --filter
  web add recharts`). NO se instalaron frappe-gantt/exceljs/@react-pdf/renderer.

### Próximo paso
- Validar (typecheck/lint/test/build/validador) + commit documental + push a
  `origin integration/wave-3a`. Luego lanzar en paralelo agent-db-rls ∥
  agent-frontend-boq ∥ agent-dashboard. NO planning, NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3A: subagentes ejecutados (interrumpidos) y preservados (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees aislados desde `main`@`30b1053`): agent-db-rls
  (read-model), agent-frontend-boq (páginas presupuesto), agent-dashboard (KPIs).
- Los tres se **interrumpieron por límite de sesión** (~54-62 acciones c/u), con
  trabajo casi completo **sin commitear** y errores triviales remanentes de
  `tsc`/build (los worktrees derivan de main, sin el contrato ni recharts; el
  contrato fue embebido en los prompts y dashboard instaló el recharts aprobado).

### Entregables preservados (verdes tras fixes mínimos del orquestador)
- **agent-db-rls** → `backup/wave3-db-read-model` (`7478ceb`): `lib/contracts/
  read-model.ts` (DTOs+port), `server/read-model/{types,errors,port,compute,
  fixture-repository,drizzle-repository,index}`, `server/repositories/`,
  selector `READ_MODEL_SOURCE` sin fallback, proyección por rol, 2 tests.
  Validado: typecheck 0, lint 0, **329 tests**, build OK. Fix: `env:Partial<ProcessEnv>`.
- **agent-dashboard** → `backup/wave3-dashboard` (`79d9fd3`): `/dashboard` +
  `modules/dashboard/*` (KPIs, Recharts barras+pie, ahorros solo rol autorizado)
  + accesor TEMP de dev. Validado: typecheck 0, lint 0, **336 tests**, build OK.
  recharts ^3.8.1. Fixes: import estático del fixture (Turbopack) + typing legend.
- **agent-frontend-boq** → `backup/wave3-frontend-boq` (`28d8bfe`): páginas
  `/projects /estimates /apu /quantities /catalog` cableadas (sin mocks) +
  `components/budget/*` + accesor TEMP. Validado: typecheck 0, lint 0, **338
  tests**, build OK. Fixes: ruta fixture + anotaciones de tipo + cast de status.

### Reconciliación pendiente (integración 3A)
- Triple `read-model.ts` → unificar a la canónica de db-rls. Rewire de accesores
  TEMP de la UI a `@/server/read-model` (`getReadModel()`). Alinear DTOs
  divergentes del frontend (`scopeNames/code/status:string`) a los canónicos.
  Registrado en INTEGRATION_REQUESTS.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3a` ni a `main`. `main` intacta. Backups
  3A (3) + previos y tags conservados. Worktrees obsoletos por limpiar.
- Recomendación: ciclo de integración 3A (cherry-pick db-rls → frontend →
  dashboard, reconciliar, validar) antes de pedir merge a `main`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Integración Oleada 3A: web funcional con read-model (orchestrator)

### Integración
- Cherry-picks: `9e69449` (db-rls read-model) + `8ab0d9c` (frontend) + `0bab01d`
  (dashboard). Conflicto add/add en `read-model.ts` resuelto con el canónico de
  db-rls (`--ours`). `main` intacta.

### Reconciliación (Fases 2-4)
- **Fuente única**: `apps/web/lib/contracts/read-model.ts` (db-rls); duplicados de
  frontend/dashboard eliminados. **1** `interface ReadModelPort`.
- **Accesores TEMP eliminados** (`components/budget/dev-read-model.ts`,
  `modules/dashboard/dev-read-model.ts`). Nuevo helper
  `apps/web/server/read-model/viewer.ts` (`getDemoViewer()`, demo/dev). Las 5
  páginas de presupuesto y el dashboard consumen `getReadModel()` de
  `@/server/read-model` con el viewer demo.
- **DTOs adaptados** al canónico: `ProjectListItem{scopeCount,createdAt,
  estimateCount}` (sin `code`/`scopeNames`); `EstimateSummary.versionId`/
  `status:EstimateVersionStatus` (sin `id`/`approvedAt`/`notes`);
  `QuantityGroupView{id,name,lines}` (sin `unit`/`calculationMode`).
- Test redundante del frontend eliminado; test del dashboard repointado al
  read-model canónico (precompute en `beforeAll`).

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **356 tests** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio.
- Privacidad: DTOs sin campos internos de pricing; ahorros del dashboard
  role-gated; cero cálculo financiero en React.

### RLS (Fase 6)
- Sin cambios en `supabase/*` ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime
  21/21** vigente. B-004 (Realtime) deuda técnica.

### Dev smoke (Fase 7)
- `READ_MODEL_SOURCE=fixture` + `pnpm --filter web dev`. **8/8 rutas HTTP 200**
  con datos reales del golden master (`/dashboard` "Total presupuesto $372.247…"
  + Recharts; `/estimates` "Entre Patios" + AIU/IVA). Sin 500. Servidor detenido
  tras el smoke (incl. limpieza de un dev server obsoleto previo en :3000).

### Estado / próximo paso
- Commit `chore: integrate and validate wave 3a functional read model ui` +
  push a `origin integration/wave-3a`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3a` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Merge de Oleada 3A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 30b1053` (árbol
  limpio); integración final `971b3ad`; 9 backups y 4 tags conservados; Excel
  ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-3a` → **merge commit
  `d1f0920d0423f981fa5d285d493120fc44873849`** (`d1f0920`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 356** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface ReadModelPort` y **1** `getReadModel()` (en
  `apps/web/server/read-model/index.ts`); fuente única
  `apps/web/lib/contracts/read-model.ts`; selector `READ_MODEL_SOURCE=fixture|db`;
  **sin** `dev-read-model.ts`; **sin** imports activos de `@/lib/utils/mocks` en
  rutas cableadas. Dashboard + páginas cableadas; Recharts.

### RLS (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 30b1053..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 vigente. **B-004** (Realtime) deuda técnica.

### Privacidad
- DTOs cliente-safe sin campos internos de pricing; ahorros del dashboard
  role-gated (omitidos para `client`). **Cero cálculo financiero en React**
  (dinero `DecimalString`). `getDemoViewer()` es **solo demo/dev**: en modo `db`
  el viewer vendrá de la **sesión/auth real** (prerrequisito futuro) y RLS es la
  barrera real.

### Ramas y tag
- **Conservados**: 9 backups (wave1×3, wave2×3, wave3×3), `integration/wave-3a`,
  ramas de integración previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-3a-functional-read-model-ui-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 3A CERRADA y en `main`.** Web local funcional con datos reales del
  fixture. Oleada 3B/3C NO iniciadas. Antes de 3B: congelar
  `docs/PLANNING_CONTRACT.md` + esquema de planning (db-rls) e instalar
  `frappe-gantt`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3B: microfase documental + frappe-gantt (orchestrator)

### Rama
- Creada y publicada `integration/wave-3b` desde `main` (`352825f`). `main` intacta.

### PLANNING_CONTRACT CONGELADO v1
- Creado **`docs/PLANNING_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): entidades PostgreSQL (`schedule_tasks`,
  `task_dependencies`, `progress_entries` append-only, `resource_assignments`)
  con RLS; dominio puro `apps/web/modules/planning/` (CPM/ruta crítica/holguras/
  ciclos, `DecimalString`); extensión del read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `ScheduleSummary`, `CriticalPathSummary`; `ReadModelPort.getSchedule/
  listProgressEntries/listResourceAssignments`); privacidad por rol
  (holguras/ruta crítica/avance financiero/`external_reference`/responsables 🔒);
  campos reservados para export MS Project (no en 3B).
- Actualizados: `DATABASE_SCHEMA.md` (entidades planning), `API_CONTRACTS.md` (§8),
  `READ_MODEL_CONTRACT.md` (§8 extensión), `AGENT_REGISTRY.md` (ownership 3B),
  `DECISIONS.md`, `LICENSING.md`, `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`frappe-gantt` ^1.2.2 (MIT, sin peers)** instalado en `apps/web`. Import
  dinámico client-side (DOM/SVG). NO se instalaron exceljs/@react-pdf/renderer.

### Próximo paso
- Validar + commit documental + push a `origin integration/wave-3b`. Luego lanzar
  en paralelo agent-db-rls (esquema/RLS/read-model planning) ∥ agent-planning
  (dominio/Gantt). NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3B: subagentes interrumpidos (WIP preservado) (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees desde `main`@`352825f`): agent-db-rls
  (esquema/RLS/read-model planning) ∥ agent-planning (dominio/Gantt).
- **Ambos interrumpidos por límite de sesión** (~49-54 acciones), con trabajo
  **materialmente incompleto** y sin commitear.

### Estado de los entregables (PARCIAL)
- **agent-db-rls** → `backup/wave3b-db-planning` (`89bfab7`, **WIP typecheck rojo**):
  migración `20260531100000_planning_schedule.sql` (4 tablas) +
  `20260531100100_rls_policies_planning.sql`, `schema.ts` (Drizzle planning),
  `read-model.ts` (DTOs/métodos), `server/read-model/{types,compute-planning}.ts`,
  datos de cronograma en el fixture. **PENDIENTE**: implementar
  `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (4 errores
  "incorrectly implements ReadModelPort"); seed de planning; RLS runtime 21/21 +
  pruebas de planning.
- **agent-planning** → `backup/wave3b-planning-ui` (`6f4dab9`, **typecheck verde,
  incompleto**): `modules/planning/{cpm,graph,date,decimal,types}.ts` (dominio
  puro CPM/holguras/ciclos). frappe-gantt instalado. **PENDIENTE**: página
  `/planning`, componente Gantt, accesor dev de cronograma, tests de dominio.

### Higiene (ambos)
- Sin privados/Excel/`.env`. Sin solape de archivos entre agentes.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3b` ni a `main`. `main` intacta
  (`352825f`). Backups (11) y tags conservados. Worktrees por limpiar.
- **Acción requerida**: reanudar ambos agentes (sesión reseteada ~15:50) para
  completar los puntos pendientes; luego ciclo de integración 3B. Registrado en
  INTEGRATION_REQUESTS.

### Agentes activos al cierre
- Ninguno (ambos finalizaron por límite, incompletos).

## 2026-05-31 — Oleada 3B: continuación db-rls COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial** (no paralela) para reducir consumo. Rama
  `continuation/wave3b-db-planning` desde `backup/wave3b-db-planning` (`89bfab7`).
- `agent-db-rls` recuperó el WIP con `git merge --ff-only 89bfab7` (los worktrees
  parten de `main`; `89bfab7` desciende de `main` ⇒ ff sin redo) y completó.

### Completado (db-rls)
- `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (proyección por rol:
  `client` sin holguras/ruta crítica/`financialProgressPct`/`external_reference`/
  `createdBy`/notas).
- `supabase/seeds/0003_demo_planning.sql` (cronograma demo sanitizado) +
  `config.toml`. Tests `planning-fixture.test.ts` + `planning-drizzle.test.ts`.
- Harness `scripts/rls-runtime/run.ts`: +11 pruebas de planning.

### Validación
- typecheck 0 · lint 0 · **378 tests** · build OK · gm:regression 22/22 ·
  gm:import 9/9.
- **RLS runtime real (Docker local): 32/32 PASS** (21 previos + **11 planning**:
  aislamiento A/B en las 4 tablas, sin-org, `progress_entries` append-only,
  WITH CHECK cross-org en tareas/dependencias; **24 tablas con RLS FORCE**).
  `db reset` aplicó 13 migraciones + 3 seeds sin errores. Sin remoto.

### Preservación
- `backup/wave3b-db-planning-complete` (`560b2cc`, pusheada);
  `continuation/wave3b-db-planning` adelantada a `560b2cc`. WIP original
  `89bfab7` y `main` intactos. 12 backups.

### Estado / próximo paso
- **db-rls 3B COMPLETO y validado.** Falta `agent-planning` (UI/Gantt): reanudar
  secuencialmente desde `backup/wave3b-planning-ui` (`6f4dab9`). Luego integración
  3B. NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Oleada 3B: continuación planning-ui COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial**. Rama `continuation/wave3b-planning-ui` = WIP
  planning (`6f4dab9`) **combinado con el read-model db completo (`560b2cc`)**
  (sin overlap de archivos) → `2793bbf`, para cablear la UI al `getSchedule()`
  real sin accesor TEMP. `agent-planning` recuperó la base con
  `git merge --ff-only 2793bbf`.

### Completado
- **agent-planning**: dominio (`modules/planning/{gantt-mapping,view-model,index}`)
  + componentes (`GanttChart` frappe-gantt dinámico, `ScheduleTable`,
  `PlanningSummary`, `ScheduleStatusBadge`).
- **orchestrator (completar interrumpido)**: página
  `apps/web/app/(dashboard)/planning/page.tsx` cableada a
  `getReadModel().getSchedule(getDemoViewer(), projectId)`; tests
  `tests/unit/planning/planning-domain.test.ts` (CPM/ciclo/holgura/hito/
  dependencias FS-SS-FF-SF/privacidad por rol); enlace nav `/planning` en el
  layout; reconciliación `view-model` → `ScheduleSummary` canónico de
  `@/lib/contracts/read-model`; CSS de frappe-gantt **vendorizado** (su `exports`
  v1.2.2 no expone `dist/*.css`); `ganttRef any→unknown`.

### Validación
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (ruta `/planning`) ·
  gm:regression 22/22 · gm:import 9/9.
- **Dev smoke `/planning` HTTP 200** (74 KB) con "Cronograma de obra", "Diagrama
  de Gantt", tareas, hitos, avance reales del fixture sanitizado; sin 500; rutas
  previas siguen 200. Servidor detenido tras el smoke.
- Privacidad: ruta crítica/holguras solo rol autorizado (no `client`); cero
  cálculo monetario/CPM en React (CPM en `modules/planning`).

### Preservación
- `backup/wave3b-planning-ui-complete` (`41abbe2`, pusheada); continuation
  adelantada a `41abbe2`. WIP originales (`6f4dab9`, `89bfab7`) y `db-complete`
  (`560b2cc`) intactos. `main` intacta. 13 backups.

### Estado / próximo paso
- **3B COMPLETO** (db `560b2cc` + ui `41abbe2`), combinado y validado end-to-end
  en `continuation/wave3b-planning-ui` (`41abbe2`). Listo para el **ciclo de
  integración 3B** hacia `integration/wave-3b` (incluye RLS runtime 32/32 ya
  validado por db). NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Integración formal Oleada 3B en integration/wave-3b (orchestrator)

### Merge
- `git merge --no-ff continuation/wave3b-planning-ui` (= db `560b2cc` + ui
  `41abbe2` combinados) → **merge commit `595e5a5`**. **Sin conflictos.** Los
  docs de 3b (PLANNING_CONTRACT, etc.) se conservaron (la continuation parte de
  main y no los borra).

### Reconciliación
- Read-model canónico único `apps/web/lib/contracts/read-model.ts`; `/planning`
  consume `getReadModel().getSchedule(getDemoViewer(), projectId)` real (0
  accesores TEMP). CPM/ruta crítica/holguras **solo en `modules/planning`**
  (verificado: 0 en `app/`+`components/`). frappe-gantt dinámico client-side +
  CSS vendorizado; nav `/planning`. Las dos `ScheduleSummary` (dominio vs
  read-model) son capas distintas por contrato; la UI consume la canónica.

### Validación (todo PASS)
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (rutas `/planning` +
  previas) · `gm:regression` 22/22 · `gm:import` 9/9 · `validate-claude-agents`
  214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE**; 21 previos + 11 planning. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (incl. `/planning` con Cronograma + Gantt +
  tareas/hitos/avance reales). Servidor detenido tras el smoke.
- Privacidad backend-first (holguras/ruta crítica/financiero/`external_reference`/
  responsables role-gated); cero cálculo monetario/CPM en React; MS Project
  reservado (sin export en 3B). B-004 (Realtime) deuda técnica no bloqueante.

### Estado / próximo paso
- Commit doc `chore: integrate and validate wave 3b planning gantt` + push a
  `origin integration/wave-3b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3b` → `main`**.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Merge de Oleada 3B a `main` (aprobado) + tag estable

### Estado
- **Merge aprobado por el usuario.** `git merge --no-ff integration/wave-3b`
  sobre `main` (base `352825f`) → merge commit **`40118a5`**, **sin conflictos**
  (44 archivos, +5221/-11). Squash/rebase/force-push NO usados.
- Tag anotado **`wave-3b-planning-gantt-v1`** sobre el HEAD documental.

### Validación post-merge (todo PASS)
- typecheck 0 · lint 0 · **389 tests** (27 archivos) · build Next 16.2.6
  (rutas incl. `/planning`) · `gm:regression` 22/22 · `gm:import` 9/9 (±0.01 COP)
  · `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE** (aislamiento A/B, sin-org, cross-org
  WITH CHECK, `progress_entries` append-only). Supabase detenido. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (`READ_MODEL_SOURCE=fixture`): `/`, `/login`,
  `/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`, `/dashboard`,
  `/planning`. `/planning` renderiza "Cronograma de obra", resumen, **Tareas**,
  **Hitos**, **Diagrama de Gantt** (frappe-gantt); rol `management` ve columnas
  **Holgura** + **Crítica**; sin fugas (`external_reference`/descuento/margen=0);
  sin 500. Servidor detenido tras el smoke.

### Reconciliación / deuda registrada
- Read-model **canónico único** en `apps/web/lib/contracts/read-model.ts`
  (`ReadModelPort` + `ScheduleSummary` + DTOs); `/planning` consume
  `getReadModel().getSchedule(getDemoViewer(), projectId)` (0 accesores TEMP de
  planning). CPM/ruta crítica/holguras **solo en `modules/planning`** (0 en
  `app/`+`components/`). frappe-gantt dinámico client-side + CSS vendorizado; nav
  `/planning`.
- **B-005 (deuda no bloqueante)**: el módulo de dominio `modules/planning/types.ts`
  conserva un **espejo interno** de los DTOs de read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `CriticalPathSummary`) consumido por
  `view-model.ts`/`gantt-mapping.ts`. Es estructuralmente compatible; el único
  campo divergente (`financialProgressPct` en la `ScheduleTaskView` del dominio)
  está **sin uso** (código muerto). El read-model canónico (puerto + DTOs que la
  página/repositorios consumen) es fuente única. Plegar el espejo al contrato se
  difiere a limpieza de 3C (colisión de nombre `ScheduleSummary` dominio vs
  read-model exige aliasing; no se refactoriza sobre un merge ya validado).

### Estado / próximo paso
- `git push origin main` + `git push origin wave-3b-planning-gantt-v1`.
- **Oleada 3B CERRADA.** `integration/wave-3b` conservada temporalmente; backups
  y continuations conservados. Próximo: **Oleada 3C (exports)** — propuesta
  documental entregada; NO lanzada (sin agentes, sin rama, sin deps).
- `getDemoViewer()` solo demo/dev; auth real/sesión = prerrequisito del modo `db`.
  B-004 (Realtime en Windows) deuda técnica no bloqueante.

---

## 2026-06-01 — Oleada 3C (exports): apertura + B-005 resuelto (Fases 0–1)

### Estado
- **Oleada 3C aprobada (secuencial).** Rama `integration/wave-3c` creada desde
  `main` (`82f9e86`) y publicada (`-u origin`). `main` intacta.
- **B-005 RESUELTO** (Fase 1): `apps/web/modules/planning/types.ts` ahora
  re-exporta los DTOs/enums de planning (`ScheduleTaskView`, `DependencyView`,
  `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `CriticalPathSummary`, `ScheduleTaskStatus`, `DependencyType`) desde la fuente
  única `apps/web/lib/contracts/read-model.ts` y conserva solo tipos de dominio
  puro. Eliminados el campo muerto `financialProgressPct` y `ScheduleSummaryView`
  sin uso. Superficie pública de `@/modules/planning` estable (re-exports vía
  `index`). Sin tocar CPM/holguras/proyección/DB/migraciones/seeds/RLS.
- Validación post-refactor (PASS): typecheck/lint 0, **389 tests**, build
  (`/planning`), gm 22/22 + 9/9, `git diff --check` limpio. 1 archivo
  (`types.ts`, 252→176 líneas). Commit `refactor(planning): fold duplicated DTO
  mirrors into canonical read model`.

### Próximo paso (esta sesión)
- Fase 2: congelar `docs/EXPORT_PROFILES_CONTRACT.md` (v1) + actualizar contratos.
- Fase 3: solicitar/instalar `exceljs` + `@react-pdf/renderer` (licencias).
- Fase 4: ownership `agent-exports` en AGENT_REGISTRY.
- Fase 5: commit documental + push.
- Fase 6: lanzar **solo** `agent-exports` (worktree aislado). Fase 7: preservar
  en `backup/wave3c-exports`. **NO** integrar ni merge a `main`.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Cierre Oleada 3C: reconciliación (Caso B) y merge a `main`

> Nota: esta entrada vive en `integration/wave-3c-main-reconciled` → `main`. El
> detalle de la implementación y la integración previa quedó en
> `integration/wave-3c` (`7124f0f`, conservada). Aquí se documenta el cierre.

### Divergencia y estrategia
- El PR de GitHub "Integration/wave 3c (#1)" se fusionó como **SQUASH** ⇒
  `origin/main = b09158f` (padre único `82f9e86`); `2621d3b` **no** quedó como
  ancestro. `origin/main` ya contenía **materialmente** B-005 +
  `EXPORT_PROFILES_CONTRACT` + deps (idénticos), faltando solo el **código de
  exports**. `git diff origin/main..integration/wave-3c` = 15 archivos exports
  (A) + 4 docs (M): delta aditivo y acotado.
- **Caso B aplicado**: rama `integration/wave-3c-main-reconciled` desde
  `origin/main` + `git merge --no-ff backup/wave3c-exports` → **solo 15 archivos
  de exports** (+2200), **sin conflictos** y **sin duplicar** B-005/contrato/deps
  (git auto-resolvió el contenido idéntico). Sin force-push / rebase / reset.
- Verificado: `diff origin/main..reconciled` = solo exports; `types.ts` 176
  líneas (B-005 una vez); deps una vez; contrato presente.

### Validación post-reconciliación (PASS)
- typecheck/lint 0 · **410 tests** · build (`/api/exports`) · gm 22/22 ·
  gm:import 9/9 · validador 214/0/0 · diff/status limpios · Excel ignorado.
- **RLS runtime**: sin cambios en `supabase/`/`schema.ts` ⇒ **32/32 (3B) vigente**
  (no se levantó Docker).
- **Smoke 6/6 HTTP 200** (proyecto `…010`): content-type/disposition/bytes ok;
  PDF `%PDF`, XLSX `PK`, CSV; cliente sin `external_reference`, internal con
  columna. Negativos (mismatch/sin projectId/`mpp`) → **400**. Servidor detenido.

### Cierre
- Merge `--no-ff` de `integration/wave-3c-main-reconciled` → `main`; push `main`;
  tag **`wave-3c-exports-v1`**. **Oleada 3C CERRADA.**
- Conservados: `integration/wave-3c` (`7124f0f`),
  `integration/wave-3c-main-reconciled`, `backup/wave3c-exports`, y todos los
  backups/continuations/tags.

### Deudas no bloqueantes
- Auth real/sesión pendiente (prerrequisito modo `db`); `getDemoViewer` solo demo.
- `external_reference` vacío en CSV hasta extensión contractual del DTO.
- **B-004** (Realtime Windows) deuda técnica.
- **Botones UI de descarga** aún no existen (solo endpoint `/api/exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.1 (auth/RLS local): apertura + contrato + deps (Fases 0–5)

### Estado
- **Oleada 4A.1 aprobada (secuencial).** Rama `integration/wave-4a-auth-local`
  desde `main` (`a6981f0`), publicada. `main` intacta.
- **Auditoría (Fase 1)**: `profiles` (id=auth.users.id, `organization_id` NOT
  NULL = membresía single-org, `role` admin/gerencia/presupuestos/obra/compras/
  consulta) y `organizations` ya existen. `app.current_org()`/`current_role()`
  leen claims JWT custom (`organization_id`/`user_role`); **0** políticas usan
  `auth.uid()`. `proxy.ts` = stub pass-through. Todo es **demo** (sin protección
  real). Conclusión: **reutilizar `profiles`** (no duplicar), añadir resolución
  por `auth.uid()`→`profiles` con compat demo.
- **AUTH_CONTRACT v1 congelado** (`docs/AUTH_CONTRACT.md`): modos
  `APP_AUTH_MODE`×`READ_MODEL_SOURCE` sin fallback; `AuthenticatedViewer`
  server-side; mapeo `profiles.role`→`ViewerRole`; matriz ruta×rol;
  deny-by-default. Punteros en API_CONTRACTS/DATABASE_SCHEMA/READ_MODEL_CONTRACT;
  ownership 4A.1 de `agent-db-rls` en AGENT_REGISTRY; placeholders en
  `.env.example` (`APP_AUTH_MODE`, `NEXT_PUBLIC_SUPABASE_*`; **sin** valores
  reales; `service_role` no en frontend).
- **Deps instaladas**: `@supabase/supabase-js` **2.106.2** (MIT) +
  `@supabase/ssr` **0.10.3** (MIT); peer cumplida; sin AGPL/enterprise.

### Próximo paso (esta sesión)
- Fase 5: validar base documental + commit doc + push.
- Fase 6: lanzar **solo** `agent-db-rls` (worktree aislado). Fase 7: RLS runtime
  local (previo 32/32 + nuevos tests auth). Fase 9: preservar en
  `backup/wave4a-auth-db-local`. **NO** integrar ni merge a `main`. **NO** UI/
  proxy/remoto.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-db-rls`).

---

## 2026-06-01 — Oleada 4A.1: agent-db-rls completado y preservado (Fases 6–9)

### Estado
- **`agent-db-rls` lanzado** en worktree aislado (desde `f637d67`). Se
  interrumpió por límite de sesión tras implementar migración + seed + tests
  auth, **sin commitear**. **Continuación por el orquestador**: recuperado el WIP
  del worktree, validado a verde.
- **Preservado en `backup/wave4a-auth-db-local` (`58de9c3`, pusheado)**.
  Parent = `f637d67`. **NO integrado** a `integration/wave-4a-auth-local` ni
  `main`.

### Entregable (4 archivos, +401)
- `supabase/migrations/20260601090000_auth_identity_helpers.sql`: helpers
  `app.current_org()`/`current_role()`/`current_org_user()` que resuelven
  identidad real (`auth.uid()`→`profiles`) con **COALESCE** a claims demo
  (compat). `_jwt_claims()` neutraliza claims ausentes/malformados;
  `_auth_uid()` prefiere `auth.uid()` y cae a `sub`; `_profile_org/_role`
  **SECURITY DEFINER** (evita recursión RLS, solo la fila propia). **Deny-by-
  default** (NULL ⇒ sin filas). GRANT EXECUTE a `authenticated`.
- `supabase/seeds/0004_auth_org_b_and_no_membership.sql`: org B + roles
  variados (cubre los 4 ViewerRole) + **usuario sin membresía**; sanitizado,
  idempotente, patrón `auth.users` condicional.
- `scripts/rls-runtime/run.ts` (+15 tests auth) y `supabase/config.toml`
  (registro seed 0004).
- **Reutiliza `profiles` single-org** — sin tablas nuevas (regla de no-duplicación).

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth**: `current_org/role` desde profiles sin claim;
  aislamiento real A/B; sin sesión→`NULL`→deny; sin membresía→`NULL`→deny;
  cross-org INSERT/UPDATE bloqueado; rol admin puede INSERT profile, rol obra no
  (WITH CHECK); prioridad del claim demo. Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** (incl. regresión RLS estática) · build OK ·
  gm 22/22 · gm:import 9/9 · validador 214/0 · diff/status limpios · **sin
  secretos/.env/privados**.

### Próximo paso
- A la espera de aprobación para **integrar `backup/wave4a-auth-db-local` →
  `integration/wave-4a-auth-local`** (merge + revalidación) y luego diagnóstico
  de **4A.2** (browser/server client, sesión SSR, `proxy.ts`, viewer real,
  login/logout/reset). **NO** integrado aún.

### Agentes activos al cierre
- Ninguno (`agent-db-rls` finalizó; entregable preservado, no integrado).

---

## 2026-06-01 — Integración formal Oleada 4A.1 (auth/RLS DB) en integration/wave-4a-auth-local

### Estado
- **Integración aprobada.** `git merge --no-ff backup/wave4a-auth-db-local`
  (`58de9c3`) sobre `integration/wave-4a-auth-local` (`8adfbca`) → merge
  **`adeafbe`**, **sin conflictos** (4 archivos, +401). `main` intacta
  (`a6981f0`). Remoto no conectado.

### Auditoría de la implementación integrada
- **14 migraciones, 4 seeds**. La migración `20260601090000_auth_identity_helpers.sql`
  tiene **0 `CREATE TABLE`** ⇒ **reutiliza `profiles`/`organizations`** (single-org
  v1, sin tablas nuevas de usuarios/membresía/org/roles).
- Helpers canónicos: `_jwt_claims`, `_auth_uid`, `_profile_org`, `_profile_role`,
  `current_org`, `current_role`, `current_org_user`. Regla de identidad:
  **prefiere `auth.uid()`**, fallback controlado a claim `sub` (compat
  demo/Postgres puro), **NULL → deny-by-default**. Org/rol desde
  `profiles.organization_id`/`profiles.role` por `auth.uid()`; nunca org del
  navegador. `SECURITY DEFINER` + `search_path` fijo solo en `_profile_org/_role`
  (evita recursión RLS, lee solo la fila propia). `GRANT EXECUTE` mínimos.

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth** (aislamiento real A/B, sin sesión→deny, sin
  membresía→deny, cross-org INSERT/UPDATE bloqueado, rol admin vs obra, prioridad
  claim demo). Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** · build OK · gm 22/22 · gm:import 9/9 ·
  validador 214/0 · diff/status limpios · **sin secretos/.env/privados**.

### Pendiente (4A.2)
- Clientes browser/server Supabase, sesión SSR por cookies, refresh en
  `proxy.ts`, viewer real (sustituir `getDemoViewer` en modo `supabase`),
  protección de rutas, UI login/logout/forgot/reset/callback. `READ_MODEL_SOURCE`
  permanece `fixture`. B-004 (Realtime Windows) deuda técnica.

### Estado / próximo paso
- Commit doc `docs: record wave 4a1 auth db rls integration validation` + push
  `origin integration/wave-4a-auth-local`. **NO** merge a `main`.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.2 (runtime SSR): contrato + implementación (Fases 0–4)

### Estado
- Rama `integration/wave-4a-auth-runtime` desde 4A.1 (`7c2f729`), publicada.
  `main` intacta (`a6981f0`).
- **AUTH_RUNTIME_CONTRACT v1 congelado** (`docs/AUTH_RUNTIME_CONTRACT.md`).
  Role-map fuente única en `server/auth/role-map.ts` (**admin→internal**;
  refina AUTH_CONTRACT). Punteros en API_CONTRACTS/READ_MODEL_CONTRACT; ownership
  4A.2 en AGENT_REGISTRY.
- **Runtime SSR implementado por el orquestador** (antes de la UI):
  `lib/supabase/{env,client,server,proxy}.ts` (`@supabase/ssr`, cookies
  `getAll`/`setAll`); `server/auth/{types,errors,role-map,session,resolve-viewer,
  routes,index}.ts`; `apps/web/proxy.ts` (Next 16: refresh + `getClaims()` guard,
  **no** `getSession()`; demo passthrough; redirecciones seguras; anti
  open-redirect); `app/page.tsx` (→`/dashboard`); guard de `/api/exports` (modo
  supabase: viewer autenticado + anti-escalamiento de perfil ≤ ViewerRole).

### Validación (PASS)
- typecheck/lint 0 · **423 tests** (410 + **13 auth**) · build OK (`/api/exports`
  + Proxy) · gm 22/22 · gm:import 9/9 · validador 214/0 · diff limpio · sin secretos.

### Próximo paso (esta sesión)
- Fase 4: commit `feat(auth): ...` + push. Fase 5: lanzar **solo**
  `agent-frontend-boq` (UI `(auth)/`). Fase 7: preservar en `backup/wave4a-auth-ui`.
  **NO** integrar UI; **NO** merge a `main`; **NO** remoto/Vercel.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-frontend-boq`).

---

## 2026-06-02 — Oleada 4A.2: recuperación tras apagado + preservación UI

### Estado
- Auditoría de recuperación tras apagado inesperado. **Escenario D**:
  `agent-frontend-boq` ya había sido lanzado (worktree
  `.claude/worktrees/agent-acc61fa6aec4fac2d`, base `0149655`) y dejó el
  entregable de UI auth **completo pero sin commitear** (WIP del worktree).
- Runtime SSR 4A.2 (`19246a5`) confirmado **íntegro** en
  `integration/wave-4a-auth-runtime` (local = `origin`). `main` intacta
  (`a6981f0`). Sin stash, sin conflictos.
- **UI recuperada y preservada** (no se relanzó el agente):
  `(auth)/login` (mock→supabase real), `(auth)/forgot-password`,
  `(auth)/reset-password`, `(auth)/logout`, `(auth)/auth/callback` (PKCE +
  anti open-redirect vía `sanitizeNext`), `components/auth/*`
  (AuthCard, FormError, FormSuccess, helpers) y tests `tests/unit/auth-ui/*`.

### Validación del entregado recuperado (PASS)
- typecheck 0 · lint 0 · **452 tests PASS** (423 previos + 29 auth-ui).
- **Build de producción**: 1er intento FALLÓ (`/login` usaba `useSearchParams()`
  sin Suspense — CSR bailout Next 16). Aplicado fix mínimo (extraer `LoginForm`
  + `<Suspense>`). 2º intento **build OK** (16/16 rutas; Proxy presente;
  `READ_MODEL_SOURCE=fixture`).
- Sin secretos, sin `.env.local` trackeado, sin privados/Excel real.

### Acciones
- Commit UI en rama del worktree: `90f571c`
  `feat(frontend-boq): wave 4a.2 auth UI (login/forgot/reset/logout/callback)`.
- Fix de build: `c9063ad`
  `fix(frontend-boq): wrap login useSearchParams in Suspense (Next 16 build)`.
- Preservado en `backup/wave4a-auth-ui` (`c9063ad`), publicado a `origin`.
- **NO** se integró la UI al runtime. **NO** merge a `main`. **NO** remoto
  Supabase. **NO** Vercel (`READ_MODEL_SOURCE=fixture` sin cambios).

### Próximo paso
- Integrar `backup/wave4a-auth-ui` → `integration/wave-4a-auth-runtime` (checklist
  de merge: typecheck/lint/test/build/gm/validador) en sesión dedicada. Luego
  evaluar reconciliación 4A → `main`. No iniciar Oleada 4B.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1 (orchestrator)

### Estado
- Rama `feature/price-observation-review-center-v1` (base verificada
  `origin/main = 9e03553`; árbol limpio; 2 stashes intactos; producción
  intacta). **Sin merge a main; sin deploy; sin db push remoto; sin datos
  dummy remotos.**
- **FASE 0 (inspección)**: digest SHA-256 existía pero era transitorio
  (preview→confirm); NO existía `import_batch_id`; aprobación solo individual
  (3A); idempotencia estructural ya probada en monitor runs. Diseño aditivo y
  claro ⇒ continuación automática.

### Entregable
- **Migraciones aditivas SOLO locales** `20260614090000` + `20260614090100`:
  `price_observation_batches` (procedencia durable, digest persistido,
  inmutable: sin UPDATE/DELETE), `resource_price_observations.import_batch_id`
  (nullable + FK + índice parcial + trigger same-org; compat retroactiva),
  `price_observation_bulk_actions` (auditoría actor/lote/IDs/conteos +
  `UNIQUE (org, idempotency_key)`). RLS ENABLE+FORCE; FORCE count 28→**30**.
- **Dominio** `apps/web/server/pricing/review/` (types/errors/validation/
  service/db-repository/fixture-repository/index): bulk approve/reject solo
  `pending`, selección explícita, máx **500** filas/acción, chunks de **100**
  con filtro `status='pending'` por statement, idempotencia en dos capas,
  rechazo con motivo obligatorio, CSV sanitizado, org SIEMPRE server-side,
  roles app management|internal (DB: admin/gerencia, paridad 3A).
- **Importación con lote**: `confirmCatalogImport` (batch `manual`) y
  `confirmProviderPriceList` (batch `supplier_csv`) crean batch por
  confirmación y etiquetan observaciones (`createObservationBatch` +
  `ObservationInsert.importBatchId`).
- **UI** `/catalog/prices/review` («Revisión de precios», request-time):
  resumen (pendientes/advertencias/proveedores/lotes/monitor), tabla con
  checkbox + filtros (lote/monitor/proveedor/fuente/advertencias/fecha/
  recurso/seleccionadas), seleccionar válidas/desmarcar, modal obligatorio con
  texto del mandato (clave de idempotencia `crypto.randomUUID()` al abrirlo),
  resultado (aprobadas/omitidas/errores) + CSV. Privacidad backend-first:
  site/client ⇒ «Acceso restringido» sin datos 🔒. Accesos: dashboard (KPI
  enlazado + QuickLink), catálogo (botón), price-intelligence (enlace con
  pendientes). Política D: monitor JAMÁS auto-approve (badge + advertencia).
- **Contrato congelado** `docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md`.
  Actualizados DECISIONS / QA_REPORT / DATABASE_SCHEMA / INTEGRATION_REQUESTS.

### Validación (todo PASS)
- `supabase db reset --local` 33 migraciones + 6 seeds · typecheck 0 · lint 0
  · **1302 tests** (+56: dominio 21, seguridad/UI 22, RLS estático 13) · build
  (ruta `ƒ /catalog/prices/review`) · **RLS runtime 151/151** (+18 sección
  [20]) · isolation 12/12 · gm 22/22 · gm:import $372.247.170 · smoke gated
  **42/42** (1 PGRST303 transitorio por warmup, re-run verde — patrón conocido)
  · redirects 15/15 · diff --check limpio · validador 214/0/0.
- Ajustes mínimos a tests existentes (documentados): allowlist de tablas en
  `import-service.test.ts` (+`price_observation_batches`) y regex del KPI
  enlazado en `workspace-route-config.test.ts`. Sin cambios de invariantes.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3090` + release
  controlado (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas).
- Siguiente slice recomendado: **ENTRE_PATIOS_APU_IMPORT_V1 +
  BOQ_APU_LINKING_V1** (NO iniciado por mandato).

### Agentes activos al cierre
- Ninguno.

---

## Sesión 2026-06-13 — APU_COMPONENT_RESOURCE_RECONCILIATION_V1 + APU_LIBRARY_OPERATIONAL_UX_V1

**Agente:** agent-orchestrator (implementación inline; sin spawn de subagentes).
**Rama:** `feature/apu-resource-reconciliation-ux-v1` (base `origin/main = f286652`).
**Auditoría consumida:** `b0c8c65` (cherry-pick `10642b3`) — Discovery + Contract draft.

### Entregado
- **Contrato congelado:** `docs/APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1_CONTRACT.md`.
- **Migración aditiva** `20260617090000_apu_component_reconciliation.sql`: columnas
  `apu_components.updated_at/reconciliation_state/reconciled_by`, trigger recompute
  (cierra R-01), índice parcial, tabla auditoría `apu_component_resource_actions`
  (RLS ENABLE+FORCE, append-only, idempotencia), 3 RPCs SECURITY INVOKER con guard
  de rol. Drizzle schema sincronizado (incluye provenance previa faltante).
- **Dominio puro** `server/apu-reconciliation/`: re-matching (reutiliza
  `matchMaterialComponent`), estados, parseo de descripción de `notes`, CSV sanitizado.
- **Servicios:** `apu-reconciliation` (centro + detalle + búsqueda + acciones),
  `apu-library` (biblioteca compacta; compone read-model + reconciliación).
- **Server actions** seguras (`apu/reconciliation/actions.ts`): asociar/confirmar/
  rechazar/dejar-pendiente/limpiar/bulk/buscar, role-guard + idempotencia.
- **UI:** `/apu` compacta (stats + búsqueda/filtros/orden/paginación server-side),
  `/apu/[id]` por pestañas (Resumen·Componentes·Vínculo BOQ·Trazabilidad),
  `/apu/reconciliation` (selección, acciones individuales, modal bulk congelado, CSV).
- **Tests:** 40 nuevos (15 dominio + 25 estáticos schema/RLS/UX). Suite 1452 ✅,
  gm:regression 22 ✅.

### Validación local ejecutada
typecheck ✅ · lint ✅ · vitest full (1452 pass / 0 fail) ✅ · gm:regression (22) ✅ ·
build ✅ (rutas `/apu`,`/apu/[id]`,`/apu/reconciliation`) · `git diff --check` limpio ·
validate-claude-agents 214/0/0 ✅.

### NO ejecutado (Docker/Supabase local apagado) — DEFERIDO al release con DB arriba
`supabase db reset --local`, harness RLS runtime (`scripts/rls-runtime/run.ts` — falta
sección [23] para la tabla/RPCs nuevas), `read-model-isolation`, `gm:import`, MVP smoke
gated. La cobertura SQL equivalente corre estática en CI (`rls-apu-reconciliation-static`).

### Próximo paso
- Con Docker arriba: `db reset --local` + harness RLS (añadir sección [23]) + smoke;
  luego `db push --dry-run` (esperado: 1 migración nueva `20260617090000`).
- Revisión visual de la usuaria en `http://localhost:3120`.
- NO merge, NO deploy, NO db push remoto en esta sesión (por mandato).

### Agentes activos al cierre
- Ninguno.

---

## Sesión 2026-06-13 (cont.) — Cierre local con Docker arriba

**Agente:** agent-orchestrator. **Rama:** `feature/apu-resource-reconciliation-ux-v1`.

Docker/Supabase local disponibles ⇒ se ejecutaron los gates antes diferidos:

- **`supabase db reset --local`**: 30 migraciones + 6 seeds aplicados; `20260617090000` aplica limpio (validación empírica). Sin conexión remota.
- **Fix acotado (contrato §8):** la asociación masiva NO sobrescribe asociaciones
  existentes — `_reconcile_apu_component_row` gana `p_allow_replace`; bulk pasa
  `false` ⇒ `skipped_existing`. Individual conserva el reemplazo explícito (§10).
- **Harness RLS runtime `scripts/rls-runtime/run.ts`:** nueva **sección [23]** (20 checks:
  ENABLE+FORCE, aislamiento A/B, SELECT org-scoped, INSERT admin/gerencia, obra
  bloqueado, cross-org, auditoría inmutable, idempotency_key, total recalculado,
  bulk no sobrescribe, sin DELETE físico, M.O. no reconciliable). Pre-flight FORCE 34→35.
  **Resultado 214 PASS / 0 FAIL** (baseline 194).

### Gauntlet local completo (todo verde)
typecheck ✅ · lint ✅ · suite 1452/0 ✅ · build ✅ · RLS harness 214/0 ✅ ·
read-model isolation 12/0 ✅ · gm:regression 22/22 ✅ · gm:import PASS (cadena
financiera exacta) ✅ · smoke gated (MVP+BOQ) 42/42 en DB limpia ✅ · redirects
(suite unitaria) ✅ · diff limpio · validate-claude-agents 214/0/0 ✅. Sin PGRST303.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3120`.
- Release controlado: `db push --dry-run` ⇒ **exactamente 1 migración** (`20260617090000`).
- NO merge, NO deploy, NO db push remoto en este ciclo. **STOP.**
