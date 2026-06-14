# QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 — Contrato congelado

**Estado:** CONGELADO v1
**Fecha:** 2026-06-13
**Rama:** `feature/quantity-workspace-boq-sync-v1`
**Base:** `origin/main = 4e1817e`
**Autor:** agent-orchestrator
**Alcance combinado:** `QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1` + `CATALOG_PRICE_VISIBILITY_V1` + `CLIENT_EXPORT_PROFILE_V1`

Este documento congela el contrato funcional, de datos, de seguridad y de
privacidad. Ningún cambio de esta oleada puede contradecirlo. Las reglas
globales de `CLAUDE.md` y `docs/PROJECT_MASTER.md` prevalecen ante conflicto.

---

## 0. Principios no negociables (heredados)

1. Una sola fuente de verdad para cada cálculo financiero (server-side).
2. Snapshots emitidos (`approved`/`issued`/`archived`) son **inmutables**.
3. Descuentos internos jamás se exponen en exportaciones para cliente.
4. RLS habilitado en toda tabla nueva con datos por organización.
5. Sin `eval`, sin fórmula JS, sin SQL/HTML arbitrario en cantidades.
6. El workspace **no muta** `quantity_takeoff_*` (memorias importadas inmutables)
   ni las tablas legacy `quantity_groups`/`quantity_lines`.
7. APU no se borra físicamente: se archiva y se duplica para corregir.
8. El sync a BOQ **nunca escribe sin preview confirmado** por el usuario.

---

## 1. Modelo de datos — Quantity Workspace (NUEVO, aditivo, local)

Familia nueva, separada de las dos existentes:

- `quantity_takeoff_*` (import de memorias, inmutable) → **NO se toca**.
- `quantity_groups`/`quantity_lines` legacy (sin UI) → **NO se toca**.
- **NUEVA** `quantity_workspace_*` (creación manual editable) → esta oleada.

### 1.1 `quantity_workspace_groups`

Jerarquía: Proyecto → Alcance/piso → Módulo → Espacio → Elemento → Líneas.

```
id                 uuid PK
organization_id    uuid NOT NULL → organizations
project_scope_id   uuid NOT NULL → project_scopes (ON DELETE CASCADE)
code               text NOT NULL           -- único por (scope, code)
name               text NOT NULL
floor              text NULL               -- piso / alcance
module             text NULL               -- módulo (p.ej. "Habitaciones")
space              text NULL               -- espacio
element            text NULL               -- elemento constructivo
description        text NULL
result_unit        text NOT NULL           -- unidad del resultado consolidado
template_kind      text NOT NULL           -- 'generic' | 'mixed_wall'
total_net          numeric(20,10) NOT NULL DEFAULT 0  -- recomputado server-side
created_by         uuid NULL → profiles
created_at         timestamptz NOT NULL DEFAULT now()
updated_at         timestamptz NOT NULL DEFAULT now()
```

### 1.2 `quantity_workspace_lines`

Una línea = un resultado derivable. Sus inputs son numéricos puros; el motor
calcula `result_gross` y `result_net` server-side. El navegador NUNCA fija el
resultado: el servidor recalcula con `Decimal`.

```
id                 uuid PK
organization_id    uuid NOT NULL → organizations
group_id           uuid NOT NULL → quantity_workspace_groups (ON DELETE CASCADE)
description        text NULL
result_unit        text NULL
formula_type       text NOT NULL   -- enum §2
length             numeric(20,10) NULL
width              numeric(20,10) NULL
height             numeric(20,10) NULL
thickness          numeric(20,10) NULL
count              numeric(20,10) NULL
partial_height     numeric(20,10) NULL   -- altura enchape / altura parcial
waste_pct          numeric(20,10) NOT NULL DEFAULT 0   -- 0..1 (exclusivo de 1)
opening_deduction  numeric(20,10) NOT NULL DEFAULT 0   -- descuento de vanos (en unidad de resultado)
result_gross       numeric(20,10) NOT NULL DEFAULT 0   -- recomputado server-side
result_net         numeric(20,10) NOT NULL DEFAULT 0   -- recomputado server-side
apu_template_id    uuid NULL → apu_templates (ON DELETE SET NULL)  -- vínculo opcional
boq_item_id        uuid NULL → boq_items (ON DELETE SET NULL)      -- vínculo opcional
notes             text NULL
sort_order         integer NOT NULL DEFAULT 0
```

### 1.3 Invariantes

- CHECK `waste_pct >= 0 AND waste_pct < 1`.
- CHECK `opening_deduction >= 0`.
- CHECK `formula_type IN (...)` (§2).
- CHECK `result_unit <> ''`.
- Índice único `(project_scope_id, code)` en groups.
- Triggers `same_org` (sin SECURITY DEFINER, `search_path=public`) verifican que
  `project_scope_id`, `apu_template_id`, `boq_item_id` pertenezcan a la org.
- `updated_at` por trigger en groups.

### 1.4 RLS

- `ENABLE ROW LEVEL SECURITY` en ambas tablas.
- SELECT/INSERT/UPDATE/DELETE limitados a `organization_id = app.current_org()`.
- DELETE permitido **solo** sobre el workspace (no es dato emitido); el workspace
  es área de trabajo previa al presupuesto. Borrar un grupo/línea de workspace
  **no** afecta `boq_items` (el vínculo es `ON DELETE SET NULL`).
- Roles de escritura: `admin`, `gerencia`, `presupuestos` (alineado con
  `add_apu_to_boq`). Lectura: cualquier miembro de la org.

---

## 2. Motor de fórmulas (puro, server-side, sin eval)

Módulo `apps/web/server/quantity-workspace/formula.ts`. Funciones puras con
`Decimal`. **Prohibido** `eval`, `Function`, plantillas JS, SQL, HTML.

Enum `formula_type` y semántica (todas aplican desperdicio y vano al final):

| `formula_type` | gross | inputs usados |
|---|---|---|
| `direct` | `count` | count |
| `area_simple` | `length × height` | length, height |
| `area_floor` | `length × width` | length, width |
| `wall_with_opening` | `length × height` | length, height (vano vía `opening_deduction`) |
| `tile_by_height` | `length × partial_height` | length, partial_height |
| `paint_remainder` | `length × (height − partial_height)` | length, height, partial_height |
| `linear_profile` | `length` | length |
| `count_unit` | `count` | count |
| `volume` | `length × width × thickness` | length, width, thickness |
| `manual_safe` | suma controlada de términos permitidos | sin operadores arbitrarios |

Reglas:

```
result_gross = <según tabla> × COALESCE(count_factor, 1)
result_net   = max(0, (result_gross − opening_deduction) × (1 + waste_pct))
```

- `manual_safe`: solo combina los campos numéricos declarados (length, width,
  height, thickness, count, partial_height) con `+`, `−`, `×` predefinidos por el
  tipo; **no** acepta cadena de fórmula libre del usuario.
- Validación: ningún input negativo donde no aplique; `waste_pct ∈ [0,1)`;
  dimensiones requeridas por tipo presentes y `> 0` cuando el tipo lo exige.
- Errores de validación: `QuantityFormulaError` (no se persiste nada).

---

## 3. Cantidades derivadas — plantilla muro mixto (`mixed_wall`)

Entrada por grupo: `length` (muro), `total_height`, `tile_height` (enchape),
`opening_deduction` (vanos), unidad base. Genera **4 líneas derivadas**, cada una
vinculable a un APU/BOQ distinto:

```
m² enchape        = length × tile_height − ded_enchape           (tile_by_height)
ml perfil remate  = length                                        (linear_profile)
m² pintura/microc. = length × (total_height − tile_height) − ded  (paint_remainder)
m² board/sustrato = length × total_height − vanos                 (wall_with_opening)
```

Desperdicio opcional por resultado. La plantilla solo **propone** líneas; el
usuario las edita/borra antes de persistir. El consolidado del grupo
(`total_net`) es la suma de `result_net` de sus líneas (homogéneas en unidad) o
se reporta por unidad cuando son heterogéneas (no se suman peras con manzanas).

---

## 4. Sync a BOQ (preview obligatorio + escritura segura)

### 4.1 Flujo

```
Línea/grupo de workspace → PREVIEW (read-only) → confirmación → crear/actualizar
```

### 4.2 Preview (read-only, sin escritura)

`buildBoqSyncPreview(...)` (dominio puro + read-model). Devuelve por cada línea
a sincronizar:

- resultado de cantidad (`result_net`),
- actividad BOQ destino (existente o "nuevo ítem"),
- APU destino (si hay vínculo),
- capítulo destino,
- `quantityBefore` / `quantityAfter` / `difference`,
- advertencias (versión no editable, APU incompleto, sin APU, sin capítulo).

**No escribe nada.** Si la versión destino es `approved/issued/archived` ⇒
marca `blocked` y deshabilita confirmación.

### 4.3 Escritura

- **Crear ítem nuevo:** reusa la RPC existente `add_apu_to_boq` (precio unitario
  server-side desde componentes APU; idempotencia por key; guard `version_locked`
  y `insufficient_role`). El workspace pasa `apu_template_id`, `chapter_id`,
  `quantity = result_net`.
- **Actualizar cantidad de ítem editable:** **NUEVA RPC**
  `update_boq_item_quantity(p_boq_item_id, p_quantity, p_idempotency_key)`:
  - guards: `no_session`, `no_membership`, rol ∈ (`admin`,`gerencia`,`presupuestos`),
    `p_quantity >= 0`.
  - versión de la org y **editable**: `estimate_version_locked` ⇒ `version_locked`.
  - **preserva `unit_price_snapshot`**; recalcula `subtotal = round(quantity ×
    unit_price_snapshot, 10)` (el trigger `set_boq_item_subtotal` lo reafirma).
  - NO toca APU, NO toca catálogo, NO toca precios, NO recalcula AIU (el AIU se
    deriva normalmente del presupuesto editable).
  - registra acción en `apu_manual_actions` (auditoría existente) con
    `action_type='update_quantity'`; idempotencia por `(org, key)`.
  - tras actualizar, estampa `boq_item_id` en la línea de workspace.

### 4.4 Reglas duras

- Nunca escribir sin preview confirmado.
- Nunca tocar versiones emitidas (`approved/issued/archived`).
- Nunca alterar `unit_price_snapshot` al actualizar cantidad.
- Nunca modificar APU, catálogo ni precios desde el sync.
- Subtotal siempre server-side (trigger invariante).

---

## 5. CATALOG_PRICE_VISIBILITY_V1 (read-model acotado)

`listCatalogResources` se enriquece con estado de precio **cliente-safe**:

```
CatalogResourceView += {
  approvedPrice?:  DecimalString   // último observed_price aprobado (= budgetReferencePrice)
  pendingPrice?:   DecimalString   // último observado pendiente (no aprobado)
  supplierName?:   string          // proveedor del precio mostrado
  priceDate?:      string (ISO)    // fecha de la observación mostrada
  priceStatus:     'approved' | 'pending' | 'rejected' | 'none'
}
```

- Reglas: si hay aprobado ⇒ `approved` + `approvedPrice`. Si no, si hay pendiente
  ⇒ `pending` + `pendingPrice`. Si último es rechazado ⇒ `rejected`. Si no hay
  observaciones ⇒ `none` ("Sin precio aprobado").
- **No autoaprueba**. **No** modifica BOQ/APU/exports. **No** crawling/scraping.
- Privacidad: NO se expone descuento negociado, precio neto, ahorro, precio
  público observado fuera de los campos anteriores (que son referencia
  presupuestal, no descuentos). `supplierName` se muestra solo a roles internos
  (`management`/`internal`); para `client`/`site` se omite proveedor.
- CTAs en `/catalog`: "Revisar precios", "Ver observaciones", "Agregar precio
  manual" (enlazan a Price Intelligence/Review existentes).

---

## 6. CLIENT_EXPORT_PROFILE_V1 (aditivo, sin romper golden master)

Se añade un eje **perfil** ortogonal al `kind` existente. Endpoints actuales
intactos (compatibilidad total).

### 6.1 Perfiles

- **Cliente / comercial** (`profile=client`): portada, resumen ejecutivo,
  presupuesto por capítulos, resumen financiero (AIU visible), condiciones/notas.
  **Sin** fichas APU completas, **sin** trazabilidad, **sin** componentes,
  **sin** snapshots internos, **sin** descuentos/ahorros. Máximo legible.
- **Técnico / interno** (`profile=technical`, default actual): presupuesto
  completo + índice APU + fichas APU + trazabilidad + componentes + snapshots +
  advertencias (= `kind=package` actual).

### 6.2 Mapeo a la API existente

`GET /api/estimates/export` gana `profile=client|technical` (opcional):

| Opción UI | format | kind | profile |
|---|---|---|---|
| PDF cliente | pdf | budget | client |
| PDF técnico completo | pdf | package | technical |
| Excel presupuesto | xlsx | budget | client |
| Excel técnico con APU | xlsx | package | technical |
| Paquete técnico completo | (pdf+xlsx) | package | technical |

- `profile=client` recorta el budget a vista comercial (sin secciones técnicas).
- Sanitización formula-injection (`safeCell`/`cleanText`) se mantiene.
- **Golden master intacto**: `addBudgetSheets`/`buildBudgetPage` no cambian su
  salida por defecto; el perfil cliente es una vista derivada nueva.

---

## 7. Cronograma — SCHEDULE_FROM_BOQ_V1 (solo documentar)

No se implementa en esta oleada. Se registra la deuda y se mejora el texto vacío
de `/planning` para que sea honesto. La futura `SCHEDULE_FROM_BOQ_V1` tomará:
capítulos BOQ, ítems BOQ, cantidades (workspace + snapshot), rendimientos APU,
cuadrillas, duración estimada, dependencias, ruta crítica básica, vista Gantt.

---

## 8. Permisos y seguridad

- Escritura workspace + sync: `admin`/`gerencia`/`presupuestos` (RLS + guards RPC).
- Lectura: miembros de la org. `client`/`site` no ven proveedor en catálogo.
- RLS es la barrera real; los guards de servidor son defensa en profundidad.
- Privacidad de exportación se aplica **en backend** (no por ocultar columnas).

---

## 9. Fuera de alcance (explícito)

Cronograma completo · editor avanzado APU · versionamiento APU · usuarios/SMTP ·
chat · importación CAD/Revit · IA de reconocimiento de planos · edición
destructiva · firma digital · paginación real DB · ahorros/compras reales.

## 10. Deudas registradas

`SCHEDULE_FROM_BOQ_V1` · `OPERATIONAL_ACCESS_LAYER_V1` · `SMTP_CORPORATIVO_V1` ·
`APU_ADVANCED_EDITOR_V2` · `APU_VERSIONING_V1` · `EXPORT_QUANTITIES_ANNEX_V1` ·
`TRUE_DB_PAGINATION_V1`.
