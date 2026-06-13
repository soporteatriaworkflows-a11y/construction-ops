# APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1 — Contrato congelado

- **Estado**: CONGELADO (v1).
- **Rama**: `feature/apu-manual-builder-boq-add-v1`.
- **Base autorizada**: `origin/main = 56b7c0a`.
- **Autor**: agent-orchestrator.
- **Alcance**: crear APU manualmente desde la UI (sin Excel) y agregar una
  actividad APU existente a un presupuesto editable como ítem BOQ vinculado.
- **Relacionado**: `APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md`,
  `APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1_CONTRACT.md`,
  `BOQ_MANUAL_EDITING_CONTRACT.md`, `ESTIMATE_ISSUE_CLONE_CONTRACT.md`.

---

## 1. Principio de producto (congelado)

Un **recurso del catálogo NO es un APU**.

- Recurso: `Porcelanato 60×60` (un insumo con unidad y precio).
- APU: `Suministro e instalación de porcelanato 60×60` (una actividad con
  unidad propia y un **costo unitario calculado** a partir de varios
  componentes: porcelanato + adhesivo + boquilla + Oficial + Ayudante +
  herramienta menor derivada).

Crear un APU desde un recurso **preselecciona ese material** pero exige que el
usuario complete la actividad, su unidad y los demás componentes. **Nunca** se
crea un APU automáticamente a partir de un recurso.

---

## 2. Diferencia recurso vs APU y origen

| Concepto | Recurso (`resources`) | APU (`apu_templates` + `apu_components`) |
|---|---|---|
| Qué es | insumo unitario | actividad con costo unitario calculado |
| Precio | observaciones aprobadas (`resource_price_observations`) | derivado de sus componentes (server-side) |
| Origen | catálogo / importación / monitor | `origin_type ∈ {manual, workbook_import}` |

`origin_type` (nuevo) hace explícito el origen. Las filas históricas quedan
`workbook_import` (default no destructivo). Un APU creado por esta funcionalidad
es `manual` y registra `created_by`.

---

## 3. Creación manual de APU

### 3.1 Estados permitidos
- `active = true` (en uso) — default.
- `active = false` (archivado) — **reutiliza la columna existente**; NO se crea
  una columna `status` nueva (evitar redundancia con `active`).

### 3.2 Encabezado (campos)
- `code` (visible, requerido, único por `(organization_id, code, version)`).
- `name` (descripción de la actividad, requerido).
- `unit` (unidad canónica, requerido, `canonicalizeUnit`).
- `default_tool_pct` (fracción `[0,1]` de herramienta menor derivada; default 0).
- `description` / `notes` opcionales.
- `origin_type = 'manual'`, `created_by = <profileId server-side>`.

### 3.3 Componentes — materiales
- `resource_id` seleccionado del catálogo (de la misma organización).
- `unit` canónica del recurso (informativa).
- `quantity` o rendimiento (no negativo).
- `waste_pct` desperdicio como fracción `[0, …]` (validado).
- `unit_price_snapshot` = `budgetReferencePrice` aprobado vigente del recurso,
  **resuelto server-side** (`listCatalogResources`). Si el recurso no tiene
  precio aprobado vigente ⇒ **se bloquea** ese material con mensaje claro
  («recurso sin precio aprobado»). **Nunca se inventa precio.**
- `total_component_cost` = `quantity × (1 + waste_pct) × unit_price_snapshot`
  (`calculateApuComponentCost`, Decimal, server-side).
- `component_type = 'material'`, `unit_price_source = 'resource'`.

### 3.4 Componentes — mano de obra
- `labor_role_id` seleccionado (Oficial / Ayudante / roles existentes de la org).
- rendimiento (`performanceDays`) e integrantes (`memberCount`).
- `unit_price_snapshot` = `dailyIntegralCost` del rol (`calculateLaborCost`,
  server-side). El costo hora/día NUNCA llega del navegador.
- `quantity = performanceDays × memberCount`, `waste_pct = 0`.
- Construcción vía `buildCrewLaborComponent` (fuente única; exige
  `labor_role_id`). `component_type = 'labor'`, `unit_price_source = 'labor_role'`.

### 3.5 Equipo / componente explícito
- El modelo soporta `component_type ∈ {equipment, subcontract, other}` con la
  regla canónica `qty × (1+waste) × price`. En V1 **NO** se expone un editor de
  equipos/subcontratos en la UI manual (evita inventar precios sin fuente).
  Queda como **deuda** `APU_ADVANCED_EDITOR_V2`. El schema no lo impide.

### 3.6 Herramienta menor derivada
- Se calcula como `default_tool_pct × Σ(componentes labor)` en el cálculo final
  (`calculateApuUnitCostFull`). **NO** crea fila `component_type='tool'`
  (evita duplicar). Las filas `tool` explícitas siguen permitidas por el modelo,
  pero la UI manual no las crea en V1.

### 3.7 Cálculo (congelado)
- Costo unitario del APU = `calculateApuUnitCostFull(componentes, default_tool_pct)`.
- **Decimal completo** (Q9); sin redondeo intermedio; presentación
  `ROUND_HALF_UP`. Persistencia `numeric(20,10)`.
- **Fuente única**: el dominio `apps/web/modules/apu/apu.ts`. El builder solo
  compone; no redefine fórmulas.

### 3.8 Reglas de seguridad
- `organization_id` y `created_by`/actor **siempre server-side**.
- No se confía en precios ni subtotales enviados por el navegador.
- No se aprueban precios automáticamente.
- No se modifica el catálogo.
- No se modifica BOQ durante la creación del APU.
- No se modifican quantities, AIU ni exports.

---

## 4. Agregar APU al BOQ (`BOQ_ADD_FROM_APU_V1`)

### 4.1 Flujo
1. Presupuesto **editable** explícito (versión `draft`/`review`).
2. Seleccionar capítulo de esa versión.
3. Buscar APU activo de la organización.
4. Mostrar código, descripción, unidad, costo unitario calculado, nº componentes.
5. Ingresar cantidad.
6. Mostrar subtotal calculado.
7. Confirmar.
8. Crear `boq_items` con `apu_template_id`.
9. `unit_price_snapshot` = costo unitario calculado **server-side**.
10. `subtotal = quantity × unit_price_snapshot` (trigger DB
    `boq_items_recompute_subtotal`).
11. Refrescar workspace.

### 4.2 Mecanismo (congelado)
- RPC `add_apu_to_boq(p_estimate_version_id, p_chapter_id, p_apu_template_id,
  p_quantity, p_idempotency_key)`, **SECURITY INVOKER**, `search_path` fijo.
- El **costo unitario se computa dentro de la RPC** a partir de los
  `total_component_cost` ya persistidos (producidos por el dominio en
  creación/importación): `round(Σ total + default_tool_pct × Σ total_labor, 10)`.
  Reproduce `calculateApuUnitCostFull`; un test de regresión fija la igualdad
  con `getApuDetail().unitCostTotal`. Patrón de defensa-en-profundidad idéntico
  al trigger `apu_component_recompute_total` y al `set_boq_item_subtotal`.
  El precio **no se acepta** como parámetro del cliente (no se puede falsificar).

### 4.3 Reglas
- Solo versión **EDITABLE**; `issued/approved/archived` ⇒ bloqueado server-side
  (RLS `estimate_version_locked` + check explícito en la RPC).
- `organization_id`/actor server-side; rol ∈ {admin, gerencia, presupuestos}.
- El capítulo debe pertenecer a la misma versión/scope.
- El APU debe pertenecer a la misma organización.
- No sobrescribe ítems existentes (siempre **append**, nuevo `sort_order`).
- Idempotencia por `(organization_id, idempotency_key)`; replay devuelve el
  resultado previo sin crear un segundo ítem.
- Auditoría durable en `apu_manual_actions`.
- No modifica AIU, quantities ni exports históricos.

### 4.4 Snapshot (congelado)
- El ítem BOQ recibe un **snapshot inicial** del costo unitario del APU al
  momento de agregarlo.
- Cambios posteriores en el APU **nunca** alteran silenciosamente ítems ya
  creados ni presupuestos emitidos. Una eventual actualización requiere un flujo
  explícito separado (deuda futura, no en V1).

---

## 5. Schema (aditivo, solo local; sin db push remoto)

Migración `20260618090000_apu_manual_builder.sql`:

### 5.1 `apu_templates` (ADD COLUMN aditivo)
- `origin_type text NOT NULL DEFAULT 'workbook_import'`
  `CHECK (origin_type IN ('manual','workbook_import'))`.
- `created_by uuid REFERENCES profiles(id) ON DELETE SET NULL`.

### 5.2 `apu_components`
- **Sin cambios** (`updated_at`, `reconciled_by`, `reconciliation_state` ya
  existen; `created_by` se difiere por innecesario en V1).

### 5.3 `apu_manual_actions` (tabla nueva — auditoría + idempotencia)
- `id uuid PK`, `organization_id uuid NOT NULL`, `action_type text` CHECK ∈
  `{create_manual_apu, add_apu_to_boq}`, `apu_template_id uuid` (SET NULL),
  `boq_item_id uuid` (SET NULL), `initiated_by uuid NOT NULL` (RESTRICT),
  `idempotency_key text`, `created_at`, `metadata jsonb NOT NULL DEFAULT '{}'`.
- Índice `(organization_id, created_at DESC)`; UNIQUE parcial
  `(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- **RLS ENABLE + FORCE**. SELECT org-scoped. INSERT: org server-side + rol ∈
  {admin,gerencia,presupuestos} + `initiated_by = app._auth_uid()`. Sin
  UPDATE/DELETE ⇒ **append-only inmutable**.

### 5.4 RPC `add_apu_to_boq` (ver §4.2).

### 5.5 Requisitos
- Solo aditivo. Sin DROP / DELETE / TRUNCATE / backfill destructivo / cambio de
  tipos. Retrocompatible. RLS ENABLE+FORCE en la tabla nueva. Tenant isolation;
  cross-org bloqueado. **No db push remoto.**

---

## 6. Permisos / RLS / auditoría

- UI: visible solo a `management`/`internal` **y** `isCreationModeEnabled()`
  (APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db). En `site`/`client`/`demo`/
  `fixture` el CTA se oculta o deshabilita con explicación.
- DB: roles `admin`/`gerencia`/`presupuestos` (mapeo de los ViewerRole internos)
  para mutaciones; RLS por organización en todas las tablas involucradas.
- Toda mutación BOQ-add registra fila inmutable en `apu_manual_actions`.

---

## 7. Compatibilidad

- **APU importados**: intactos; siguen `workbook_import`; read-only en V1 salvo
  la reconciliación ya existente.
- **Reconciliación**: intacta; el builder produce componentes ya asociados
  (`reconciliation_state='associated'` cuando hay `resource_id`).
- **Quantities**: intacto; BOQ-add no toca `quantity_group_id`.
- **Issued versions**: nunca se recalculan ni se mutan.
- **Exports**: sin cambios (deuda separada).

---

## 8. Edición mínima segura (V1)

- APU **importados**: read-only (salvo reconciliación existente).
- APU **manuales**: la edición avanzada (encabezado, agregar/quitar componente,
  recalcular) se evalúa en Fase 7. Si requiere ampliar schema o introduce riesgo
  sobre snapshots BOQ, se **difiere** a `APU_ADVANCED_EDITOR_V2` documentando la
  deuda, sin agregar botones rotos. La creación manual debe quedar sólida sin
  depender de un editor incompleto.
- APU manual vinculado a BOQ: cualquier edición futura muestra advertencia y
  **no altera** snapshots BOQ automáticamente.

---

## 9. Fuera de alcance (V1)

- Exports de APU / exports combinados presupuesto+APU.
- Versionado de APU.
- Plantillas de cuadrilla reutilizables.
- Editor avanzado con fórmulas / equipos / subcontratos en la UI manual.
- SMTP, usuarios, chat.
- Modificar el importador APU, quantities o la reconciliación.
- Actualización propagada de snapshots BOQ ante cambios de precio futuros.

---

## 10. Deudas futuras (registradas)

- `APU_EXPORTS_V1`
- `BUDGET_EXPORT_WITH_APU_ANNEX_V1` (PDF/Excel del presupuesto + anexos APU
  vinculados + paquete completo).
- `APU_VERSIONING_V1`
- `APU_REUSABLE_CREW_TEMPLATES_V1`
- `APU_ADVANCED_EDITOR_V2` (edición avanzada + equipos/subcontratos).
- `OPERATIONAL_ACCESS_LAYER_V1`
- SMTP.

---

## 11. Invariantes no negociables

1. Fuente única de cálculo financiero = `apps/web/modules/apu/apu.ts`.
2. Snapshots emitidos inmutables; `issued/approved/archived` jamás se recalculan.
3. Precios y subtotales **siempre server-side**; el navegador nunca los dicta.
4. RLS ENABLE+FORCE en tabla nueva; cross-org bloqueado.
5. Sin DROP/DELETE/TRUNCATE; aditivo y retrocompatible.
6. Idempotencia + auditoría durable para BOQ-add.
7. Sin db push remoto, sin deploy, sin tocar main en esta rama.
</content>
</invoke>
