# Estimate Version Comparison Contract — v1 (Oleada 4E.3B)

Estado: **congelado v1 · blocker RESUELTO con Opción B (matching por ocurrencia) — ver §A** · 2026-06-09.
Microfase: comparación **read-only** entre dos versiones del mismo presupuesto.
Propiedad: `agent-orchestrator`.

## Objetivo
Comparar, sin modificar nada, dos versiones de un mismo `estimate`: resumen
financiero (anterior vs nuevo + deltas) y diff de capítulos e ítems
(added/removed/changed/unchanged).

## Reglas funcionales (no negociables)
1. Comparación **read-only** (no muta datos, no crea historial).
2. Solo dos versiones **del mismo `estimate`**; rechazar versiones de estimates
   distintos.
3. Solo versiones de la **organización autenticada**; `organizationId` server-side;
   RLS + filtros explícitos; cross-org rechazado.
4. Default UI: base = issued anterior más cercana; objetivo = versión activa.
5. Selección manual de dos versiones del mismo estimate.
6. Resumen financiero: directo / AIU (A·I·U·IVA) / indirectos / total general
   anterior y nuevo + delta absoluto + delta % (cuando base ≠ 0; base 0 ⇒ % seguro).
7. Capítulos: clasificación added/removed/changed/unchanged + subtotal base/nuevo
   + delta. **Clave: `code`** (único por versión — garantizado por
   `chapters_version_code_uq`).
8. Ítems: clasificación added/removed/changed/unchanged + quantity/unitPrice/
   subtotal/description/unit base vs nuevo + delta + cambio de estado `archived`.
   **Clave preferida: `chapterCode + itemCode`** (no descripciones).
9. Archivados: incluidos en el análisis (reflejar cambio de estado), **no** sumados
   como activos en totals.
10. `Decimal` (sin float). No modificar export payload salvo reutilizar lectura.

## A.0 RESOLUCIÓN (2026-06-09) — Opción B aprobada (sin migración)
La usuaria aprobó **Opción B**: matching determinístico por **ocurrencia**, sin
migración de unicidad. Algoritmo de ítems:
1. Agrupar por `chapterCode + itemCode`.
2. Si hay un único ítem por versión en el grupo ⇒ emparejar directo.
3. Si hay códigos repetidos ⇒ ordenar determinísticamente dentro de cada versión
   por `sort_order ASC`, desempate `id ASC`, y asignar `occurrenceIndex` (1,2,3…).
4. Clave de comparación = `chapterCode + itemCode + occurrenceIndex`.
5. **No** usar descripción como clave; **no** exigir unicidad en DB.
6. El resultado incluye `duplicateCodeWarning: boolean`; la UI muestra una
   advertencia discreta ("Código repetido: comparación emparejada por orden.").
- **Deuda futura** (NO ahora): antes de `BOQ_REORDER` avanzado, evaluar una
  identidad de linaje estable para ítems clonados (p. ej. `lineage_id`). No se
  implementa `lineage_id` ni reorder en esta fase.

## A. Contexto del blocker (histórico — resuelto por A.0)
- **Hallazgo (FASE 5, verificado en DB local):** índices `UNIQUE` existentes =
  `chapters.chapters_version_code_uq (estimate_version_id, code)` y los PK. **No
  existe** índice único sobre `boq_items` por `code`. ⇒ La clave de comparación de
  ítems `chapterCode + itemCode` **NO está garantizada como única** dentro de una
  versión.
- **Por qué importa:** `createBoqItem` (4E.2A) no valida unicidad de `code` y la
  importación de Excel (4C.2) trata los códigos de ítem duplicados como *warning*,
  no error. Es decir, dos ítems del mismo capítulo pueden compartir `code`,
  colisionando la clave de diff (matching ambiguo).
- **Datos actuales:** 0 grupos `(version, chapter, code)` duplicados hoy — pero el
  esquema **no lo garantiza** a futuro.
- **Migración mínima propuesta (requiere aprobación):**
  `CREATE UNIQUE INDEX boq_items_version_chapter_code_uq ON public.boq_items
  (estimate_version_id, chapter_id, code);`
  - **Impacto cruzado:** prohibiría crear dos ítems con el mismo `code` en un
    capítulo (cambia el comportamiento de `createBoqItem`); la RPC de import
    fallaría (23505) ante Excel con códigos de ítem repetidos (hoy permitido).
    Falla al crear el índice si alguna versión existente ya tiene duplicados.
  - **Alternativa sin migración (si se prefiere):** clave determinística
    `chapterCode + itemCode + ocurrencia(n)` por `sort_order` (total, sin
    colisiones), aceptando que ítems con código repetido se emparejan por orden.
    Decisión de producto.
- **Estado:** implementación de 4E.3B **DETENIDA** hasta decidir entre (a) migración
  de unicidad o (b) clave determinística con desempate por ocurrencia. La parte de
  capítulos sí tiene clave única garantizada.

## Backend (al desbloquear)
`compareEstimateVersions(viewer, estimateId, baseVersionId, targetVersionId)`
read-only: valida mismo estimate + org (RLS), lee snapshots de ambas versiones,
calcula resumen + deltas y los diffs de capítulos/ítems con la clave acordada.

## UI mínima (al desbloquear)
Acción "Comparar versiones" desde el panel de versiones: selectores base/objetivo,
resumen financiero con deltas, tabla de capítulos (expandible a ítems), estados
Agregado/Retirado/Modificado/Sin cambios, archivado visible, volver al presupuesto.
Sin gráficas, sin exports comparativos.

## Fuera de alcance
Audit trail completo, autoría por cambio, PDF/Excel comparativo, diff visual
avanzado, comentarios, aprobaciones, reorder, gráficas.
