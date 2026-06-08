# BOQ Manual Editing Contract — v1 (Oleada 4E.2A)

Estado: **congelado v1** · Aprobado por la usuaria 2026-06-07.
Propiedad del contrato: `agent-orchestrator`. Implementan: `agent-db-rls`
(repositorio/SQL), `agent-frontend-boq` (UI/server actions).

Alcance: **edición manual NO destructiva** del presupuesto (crear/editar
capítulos e ítems BOQ; mover ítem entre capítulos si es seguro). **Sin** borrado,
archive, reordenamiento, reimportación, versionado ni edición de APU (deudas
`BOQ_SAFE_DELETE_OR_ARCHIVE`, `BOQ_REORDER`, `BOQ_AUDIT_TRAIL`,
`ESTIMATE_VERSIONING`).

---

## 1. Invariantes y reglas no negociables

1. **El subtotal es SIEMPRE derivado**: `subtotal = round(quantity_snapshot ×
   unit_price_snapshot, 10)`. El navegador NUNCA envía `subtotal`. Lo recalcula
   el backend y lo **fuerza el trigger DB-level** `boq_items_recompute_subtotal`
   (migración `20260606120000`) en TODO `INSERT/UPDATE`.
2. **Una sola fuente de verdad financiera**: el costo directo, AIU, costos
   indirectos y total general se recalculan con el código existente
   (`aiu-calc.ts` + `calculateEstimateFinancialSummary`). El frontend NO calcula
   totales (solo preview visual del subtotal de un ítem).
3. **Solo versiones editables** (`draft`/`review`). Las emitidas
   (`approved`/`issued`/`archived`) son read-only (RLS `estimate_version_locked`
   + verificación server-side). No se modifican presupuestos emitidos.
4. **Deny-by-default + cross-org bloqueado**: viewer, organización y versión
   activa se derivan server-side; RLS (`estimate_version_in_org`) es la barrera
   real. Cliente RLS-bound, **sin service-role**.
5. **Decimal/NUMERIC, nunca float** para cantidad/precio (`Decimal.js`).
6. **Fixture = solo lectura**: en `READ_MODEL_SOURCE=fixture` la escritura está
   bloqueada con mensaje honesto (`BoqWriteNotSupportedError`).
7. **Trazabilidad de origen intacta** (§5).

## 2. Capítulo editable

Inputs PERMITIDOS desde el navegador:

| Campo | Crear | Editar |
|---|---|---|
| `estimateId` | ✔ | ✔ |
| `chapterId` | — | ✔ |
| `code` | ✔ | ✔ |
| `name` | ✔ | ✔ |

Derivados server-side: `viewer`, `organizationId`, `activeVersionId`,
`sort_order` (creación = `max(sort_order)+1`), metadata de origen (preservada o
NULL), estado editable de la versión.

Validaciones: `code` requerido (≤ 60 chars) y **único por versión**; `name`
requerido (≤ 200 chars); versión `draft`/`review`; deny-by-default; cross-org
bloqueado.

## 3. Ítem editable

Inputs PERMITIDOS desde el navegador:

| Campo | Crear | Editar |
|---|---|---|
| `estimateId` | ✔ | ✔ |
| `chapterId` | ✔ | ✔ |
| `itemId` | — | ✔ |
| `code` | ✔ | ✔ |
| `description` | ✔ | ✔ |
| `unit` | ✔ | ✔ |
| `quantity` | ✔ | ✔ |
| `unitPrice` | ✔ | ✔ |
| `targetChapterId` (mover) | — | ✔ (opcional) |

Derivados server-side: `viewer`, `organizationId`, `activeVersionId`,
`subtotal`, `sort_order` (creación = `max(sort_order)+1` del capítulo), metadata
de origen (preservada o NULL), resumen financiero, timestamps si existen.

Validaciones: capítulo visible y perteneciente al estimate/versión activa;
`code` requerido (≤ 60); `description` requerida (≤ 1000); `unit` requerida
(≤ 30); `quantity` NUMERIC válida; `unitPrice` NUMERIC válido; **valores
negativos bloqueados** en esta fase; **NUMERIC, nunca float**; versión editable;
**no confiar en `subtotal`/`directTotal`/AIU/`grandTotal` desde el navegador**;
deny-by-default; cross-org bloqueado.

## 4. Sort order

- Crear capítulo: `max(sort_order de la versión) + 1`.
- Crear ítem: `max(sort_order del capítulo) + 1`.
- Editar: conserva `sort_order`.
- Mover ítem: valida capítulo destino (misma versión/org), asigna
  `max(sort_order destino) + 1`, **no renumera `code`** (la usuaria decide);
  advertencia si el prefijo de `code` no coincide con el capítulo destino.
- **No** drag-and-drop ni subir/bajar (deuda `BOQ_REORDER`).

## 5. Trazabilidad

- **Importado que se edita**: conserva `source_code`/`source_row`; solo cambian
  `code` canónico y campos editables; **nunca** se sobrescribe metadata de
  origen. Indicador secundario de "normalizado" cuando `source_code !== code`.
- **Creado manualmente**: `source_code = NULL`, `source_row = NULL`; no se
  inventa fila ni código de origen. Indicador "Ítem/Capítulo creado
  manualmente".
- Mover un ítem importado preserva su origen.

## 6. Superficie del repositorio (`EstimatesWriteRepository`)

```ts
// Capítulos
createEstimateChapter(viewer, estimateId, input): Promise<ChapterMutationResult>
updateEstimateChapter(viewer, estimateId, chapterId, input): Promise<ChapterMutationResult>
getEditableEstimateChapter(viewer, estimateId, chapterId): Promise<EditableChapterView>
// Ítems
createBoqItem(viewer, estimateId, chapterId, input): Promise<BoqItemMutationResult>
updateBoqItem(viewer, estimateId, chapterId, itemId, input): Promise<BoqItemMutationResult>
getEditableBoqItem(viewer, estimateId, chapterId, itemId): Promise<EditableBoqItemView>
```

- Todos `viewer: AuthenticatedViewer` para escritura; lectura editable acepta
  `ViewerContext`.
- Cada mutación devuelve el `FinancialSummary` recalculado server-side para
  refrescar el resumen del presupuesto sin un viaje extra.
- `fixture` lanza `BoqWriteNotSupportedError` en las mutaciones; las lecturas
  editables funcionan sobre el golden master (solo lectura).

## 7. Server actions (UI)

`chapter-actions.ts` (`createChapterAction`/`updateChapterAction`) y
`item-actions.ts` (`createItemAction`/`updateItemAction`):

- `'use server'`; guard `isCreationModeEnabled()` (supabase + db); viewer real
  con `resolveAuthenticatedViewer()`; errores sanitizados; sin SQL/stack.
- El navegador solo envía los campos de §2/§3. El resultado incluye, en éxito,
  el `FinancialSummary` y los ids para navegación.

## 8. UI

- Detalle del presupuesto: CTA `Editar presupuesto` + `Nuevo capítulo`; cada
  capítulo añade acción `Editar` junto a `Ver detalle`.
- Detalle de capítulo: `Nuevo ítem`; cada ítem añade acción `Editar`.
- Rutas:
  - `…/estimates/[estimateId]/chapters/new`
  - `…/estimates/[estimateId]/chapters/[chapterId]/edit`
  - `…/estimates/[estimateId]/chapters/[chapterId]/items/new`
  - `…/estimates/[estimateId]/chapters/[chapterId]/items/[itemId]/edit`
- Formularios: subtotal como **preview visual** + leyenda "El subtotal
  definitivo se recalcula al guardar."; metadata secundaria de origen;
  loading, doble-submit bloqueado, errores sanitizados, banner de éxito,
  navegación coherente; read-only + CTA deshabilitado si la versión está
  bloqueada; fixture write bloqueada con mensaje honesto.

## 9. Integración financiera

Tras cada create/update: subtotal del ítem, subtotal del capítulo, conteo de
ítems, costo directo, AIU, costos indirectos y total general actualizados;
exports Excel/PDF reflejan los datos persistidos. Se reutiliza el cálculo
existente; no se persisten cantidades derivadas innecesarias.
