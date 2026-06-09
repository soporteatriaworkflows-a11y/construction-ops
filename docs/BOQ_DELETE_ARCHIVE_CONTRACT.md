# BOQ Safe Delete / Archive Contract — v1 (Oleada 4E.2B)

Estado: **congelado v1** · Aprobado por la usuaria 2026-06-09.
Microfase: `BOQ_SAFE_DELETE_OR_ARCHIVE`. Propiedad: `agent-orchestrator`.

## Objetivo
Permitir **retirar de forma no destructiva** (archive) y **reincorporar**
(restore) capítulos e ítems del BOQ creados por error, sin DELETE físico, sin
perder trazabilidad y sin alterar versiones emitidas.

## Reglas funcionales (no negociables)
1. **Nunca** `DELETE` físico de capítulos ni ítems.
2. Soft-archive reversible para **capítulos** y **ítems** (`archived_at`,
   `archived_by`).
3. `archived_at`/`archived_by` se fijan **server-side**; `archived_by` = usuario
   autenticado. El navegador **nunca** envía `archived_by` ni `organizationId`
   como autoridad (solo intención: ids de ruta).
4. Elementos archivados: **no** aparecen en la vista activa, **no** participan en
   subtotal de capítulo, costo directo, AIU, indirectos ni total general, y **no**
   aparecen en exportaciones activas.
5. Un **capítulo archivado** excluye efectivamente **todos sus ítems** de la vista
   activa y de los cálculos, **sin** borrar ni reescribir los ítems hijos.
6. Al **restaurar un capítulo**, vuelve a activo; los ítems archivados
   individualmente **permanecen archivados**.
7. Un **ítem** puede archivarse/restaurarse sin afectar a otros ítems.
8. Versión **emitida** (`approved`/`issued`/`archived`) = inmutable: no se puede
   archivar, restaurar ni editar (RLS `estimate_version_locked` + guard server).
9. Aislamiento por `organizationId` + RLS preservados (cross-org bloqueado).
10. Identidad server-side; defensa en profundidad (RLS + filtros explícitos).

## Semántica archive/restore
- `archiveChapter` / `restoreChapter` (por `chapterId`).
- `archiveItem` / `restoreItem` (por `itemId`).
- Archive de un elemento **ya archivado** ⇒ `BoqAlreadyArchivedError` (rechazo
  seguro). Restore de un elemento **activo** ⇒ `BoqNotArchivedError`.
- Cada operación recalcula y devuelve el `FinancialSummary` server-side.

## Efecto sobre cálculos
`directTotal`, subtotales de capítulo, conteos, AIU, indirectos y total general
excluyen: (a) ítems con `archived_at` no nulo y (b) **todos** los ítems de
capítulos con `archived_at` no nulo. Fuente única de cálculo: `aiu-calc` /
cost-domain (sin reimplementar fórmulas; `Decimal`).

## Efecto sobre exportaciones
El payload de export (`getEstimateExportPayload`) y los generadores Excel/PDF solo
incluyen capítulos/ítems **activos** (mismas reglas que los cálculos).

## Lectura controlada de archivados
Las lecturas de revisión aceptan `includeArchived` (opcional). Por defecto =
activos. Con `includeArchived`, devuelven también los archivados marcados
(`archived: true`) para la UI de restauración. La lectura controlada **no**
cambia los totales (siguen siendo activos).

## Trazabilidad mínima (sin audit trail completo)
Solo `archived_at` + `archived_by`. El historial completo (quién/cuándo/qué de
cada cambio) queda como deuda `BOQ_AUDIT_TRAIL` (fuera de alcance).

## Fuera de alcance
- Audit trail completo, drag-and-drop / reorder (`BOQ_REORDER`), borrado masivo,
  `ESTIMATE_VERSIONING`, edición de APU, cronograma, permisos avanzados por rol.

## Migración / rollback local
Migración **aditiva** mínima: `chapters` y `boq_items` += `archived_at timestamptz`
nullable + `archived_by uuid` (FK `profiles(id)` ON DELETE SET NULL) + índices
parciales `WHERE archived_at IS NULL` para lecturas activas. Sin DROP/DELETE, sin
pérdida de datos, sin tocar remoto. RLS existente de `chapters`/`boq_items`
(UPDATE permitido en versión no bloqueada, misma org) cubre archive/restore (son
UPDATE de columnas). **Rollback local** (DOWN documentado en la migración):
`DROP INDEX` parciales + `ALTER TABLE ... DROP COLUMN archived_by, archived_at`.
