# APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1 — Contrato Congelado

**Rama:** `feature/apu-resource-reconciliation-ux-v1`
**Base:** `origin/main = f286652`
**Auditoría consumida:** `b0c8c65` (cherry-pick `10642b3`):
`docs/APU_COMPONENT_RESOURCE_RECONCILIATION_V1_DISCOVERY.md` +
`docs/APU_COMPONENT_RESOURCE_RECONCILIATION_V1_CONTRACT_DRAFT.md`
**Estado:** CONGELADO — habilita implementación aditiva.
**Fecha:** 2026-06-12

Este contrato fusiona dos slices ejecutados en una sola oleada:
`APU_COMPONENT_RESOURCE_RECONCILIATION_V1` (reconciliación recurso↔componente) y
`APU_LIBRARY_OPERATIONAL_UX_V1` (biblioteca `/apu` compacta + detalle por
pestañas + centro de reconciliación).

---

## 1. Invariantes absolutos (heredados, no negociables)

1. Una sola fuente de verdad financiera: `total_component_cost` SIEMPRE se
   recalcula server-side `round(quantity × (1 + waste_pct) × unit_price_snapshot, 10)`.
2. Snapshots emitidos / `apu_calculation_snapshots` son inmutables.
3. Versiones `issued/approved/archived` no se recalculan.
4. El catálogo nunca se modifica silenciosamente; recursos se asocian, no se crean inline.
5. RLS `ENABLE + FORCE` en toda tabla nueva; cross-org bloqueado.
6. Descuentos internos no se exponen a cliente; CSV sanitizado por perfil.
7. No se aprueba ningún precio automáticamente (ortogonal a reconciliación).
8. `obra/compras/consulta` (site/client) ven solo lectura, sin botones de mutación.
9. Raw values (`raw_code`, `raw_unit`, `notes`, `source_*`) se preservan siempre.
10. No se reemplaza una asociación existente silenciosamente.

---

## 2. Biblioteca APU compacta (`/apu`)

Elimina el listado infinito de cards. Vista principal:

- **Encabezado con métricas:** total APU, componentes, vinculadas a BOQ, completas,
  con pendientes de asociar, sin resolver.
- **Acciones:** `Importar APU` (management/internal), `Reconciliar recursos`.
- **Tabla compacta** (no despliega componentes): código, occurrence index (si aplica),
  actividad, unidad, nº componentes, costo unitario, vínculo BOQ, estado de recursos
  (badge), origen, acción `Abrir`.
- **Búsqueda:** código, descripción, componente incluido, recurso asociado.
- **Filtros:** unidad, vinculadas/sin vínculo BOQ, completas, con sugerencias,
  sin resolver, ambiguas, origen, lote de importación.
- **Ordenamiento:** código, descripción, costo, nº componentes, fecha de importación, advertencias.
- **Paginación server-side:** default 25; opciones 25/50/100; anterior/siguiente/página/total.
  El scroll infinito NO es la única navegación.

## 3. Detalle APU organizado (`/apu/[id]`)

Pestañas (o secciones compactas equivalentes):

- **A. Resumen:** código, descripción, unidad, costo unitario, estado, origen, advertencias, vínculo BOQ.
- **B. Componentes:** tabla compacta — tipo, componente raw, recurso asociado, unidad,
  cantidad/rendimiento, desperdicio, precio baseline aprobado, subtotal, estado de
  asociación, acción `Reconciliar`.
- **C. Vínculo BOQ:** presupuesto, versión, actividad vinculada, cantidad BOQ, costo unitario, valor total, estado.
- **D. Trazabilidad:** workbook, hoja, lote, fila, occurrence index, fecha importación, actor, raw values.

No editor avanzado, sin nuevas fórmulas, sin tocar quantities.

## 4. Centro de reconciliación (`/apu/reconciliation`)

CTA visible desde `/apu` y `/apu/[id]`. Muestra:

- **Resumen:** componentes totales, asociados, exactos pendientes, sugerencias, sin resolver, ambiguos.
- **Tabla:** checkbox, APU, componente raw, tipo, unidad, sugerencia principal, recurso
  candidato, confianza, razón del matching, estado, acción individual.
- **Filtros:** exactos, sugerencias, unresolved, ambiguous, asociados, pendientes, tipo, unidad, lote, APU, recurso.
- **Acciones:** confirmar sugerencia, buscar otro recurso, rechazar sugerencia, dejar
  pendiente, asociar seleccionadas, descargar CSV.
- **Modal bulk obligatorio** (texto congelado, §7).

---

## 5. Estados operativos de un componente

Derivados dinámicamente (no se persiste la sugerencia). Para un componente
no-labor (`labor_role_id IS NULL`):

| Estado | Definición |
|---|---|
| `associated` | `resource_id IS NOT NULL` (o `reconciliation_state='associated'`) |
| `intentionally_unresolved` | `reconciliation_state='intentionally_unresolved'` (decisión consciente o sugerencia rechazada) |
| `exact_match` | pendiente; re-matching ⇒ `exact` (preseleccionable, confirmación explícita) |
| `suggested` | pendiente; re-matching ⇒ `suggested` (jamás auto-acepta) |
| `ambiguous` | pendiente; re-matching ⇒ `ambiguous` (jamás auto-resuelve) |
| `unresolved` | pendiente; re-matching ⇒ `unresolved` (jamás inventa recurso) |

Componentes labor (`labor_role_id IS NOT NULL`) y ya asociados al import quedan
fuera del alcance de reconciliación.

**Mapeo de `rechazar sugerencia`:** dado que las sugerencias son efímeras, rechazar
una sugerencia equivale a `reconciliation_state='intentionally_unresolved'` con
`action_type='reject'` en la auditoría. No se añade una tabla de sugerencias
rechazadas por recurso (deuda `APU_COMPONENT_REJECT_STATUS`).

---

## 6. Schema mínimo aditivo (FASE 2)

Migración `20260617090000_apu_component_reconciliation.sql` — **solo aditiva**,
sin DROP/DELETE/TRUNCATE/backfill destructivo, retrocompatible, sin db push remoto.

### 6.1 `apu_components` (columnas aditivas NULL/DEFAULT)
- `updated_at timestamptz NOT NULL DEFAULT now()` + trigger `app.set_updated_at` (BEFORE UPDATE).
- `reconciliation_state text NOT NULL DEFAULT 'pending'` CHECK `('pending','associated','intentionally_unresolved')`.
- `reconciled_by uuid REFERENCES profiles(id) ON DELETE SET NULL` (nullable).
- Trigger `apu_component_recompute_total` (BEFORE UPDATE): recalcula
  `total_component_cost` — cierra R-01 (UPDATE directo vía PostgREST sin recálculo).
  Solo UPDATE (INSERT ya es correcto vía RPC import/seed; minimiza superficie de regresión).
- Índice parcial `apu_components_unresolved_idx` `WHERE resource_id IS NULL AND labor_role_id IS NULL`.

**No** se añade `description` (la descripción se parsea de `notes` en dominio;
backfill diferido a `APU_COMPONENT_DESCRIPTION_BACKFILL`).

### 6.2 `apu_component_resource_actions` (auditoría durable + idempotencia)
```
id uuid PK, organization_id uuid NOT NULL FK organizations,
action_type text CHECK ('associate','reject','clear','leave_pending','bulk_associate'),
apu_component_id uuid NULL FK apu_components ON DELETE SET NULL,
resource_id uuid NULL FK resources ON DELETE SET NULL,
previous_resource_id uuid NULL,
initiated_by uuid NOT NULL FK profiles,
created_at timestamptz NOT NULL DEFAULT now(),
idempotency_key text NULL,
selected_count int NULL, succeeded_count int NULL, skipped_count int NULL,
metadata jsonb NOT NULL DEFAULT '{}'
```
- `UNIQUE (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- RLS `ENABLE + FORCE`: SELECT/INSERT org-scoped; **sin UPDATE/DELETE** (auditoría inmutable).

### 6.3 RPCs (SECURITY INVOKER, RLS-bound, sin service-role)
- `reconcile_apu_component(p_component_id, p_resource_id, p_keep_snapshot boolean DEFAULT true, p_idempotency_key text DEFAULT NULL)` → asocia/confirma.
- `reconcile_apu_components_bulk(p_pairs jsonb, p_keep_snapshot boolean DEFAULT true, p_idempotency_key text DEFAULT NULL)` → máx **50** pares.
- `update_apu_component_reconciliation(p_component_id, p_action text, p_idempotency_key text DEFAULT NULL)` con `p_action ∈ ('reject','leave_pending','clear')`.

Guard común: `no_session`/`no_membership` (42501); rol
`app.current_role() IN ('admin','gerencia','presupuestos')` o `insufficient_role`
(42501). Verifica componente no-labor, recurso same-org, recálculo server-side,
audit row, `updated_at`/`reconciled_by`. Idempotencia por `(org, idempotency_key)`.

---

## 7. Matching de reconciliación (FASE 3)

Reutiliza `matchMaterialComponent` (puro, `server/apu-import/matching.ts`). Orden congelado:
1. `raw_code == resource.code` → `exact via code`
2. `raw_code == resource.external_reference` → `exact via reference`
3. `raw_code == resource.external_sku` → `exact via sku`
4. `normalize(description) == normalize(resource.name)` → `suggested`
5. sin match → `unresolved`; ≥2 candidatos en un nivel → `ambiguous`.

Descripción = `parseDescriptionFromNotes(notes)` con fallback `raw_code`. Re-matching
contra el catálogo **actual** (puede haber crecido). Búsqueda manual: `listResourceIdentifiers`
filtrado in-memory, máx 20 resultados, RLS-bound. Creación de recurso: link a
`/catalog/resources/new` (no inline).

**Reglas:** exact preseleccionable pero confirmación explícita; sugerencias nunca
solas; ambiguos nunca solos; unresolved nunca inventa; asociación previa preservada;
org+actor server-side; Decimal donde aplique.

---

## 8. Acciones seguras (FASE 4)

1. Asociar individual. 2. Confirmar sugerencia. 3. Rechazar sugerencia.
4. Limpiar asociación (confirmación + auditoría). 5. Asociar seleccionadas en lote.
6. Dejar pendiente conscientemente. 7. Buscar recurso alternativo. 8. Descargar CSV sanitizado.

**Bulk:** selección explícita, preview, modal obligatorio, máx 50/operación, status
revalidado server-side, filtro por pending, idempotencia, skips reportados, no
sobrescribe existentes, no acepta ambiguous/unresolved, auditoría durable.

**Modal bulk (texto congelado):**
> Vas a asociar N componentes APU con recursos del catálogo.
> La operación quedará registrada.
> Las asociaciones existentes no se sobrescribirán silenciosamente.
> [Cancelar] [Confirmar asociaciones]

**Permisos:** management/internal lectura + acciones; site/client solo lectura. DB respeta RLS.

---

## 9. Compatibilidad

- **APU import (`import_apu_batch`)** intacto: no se altera la RPC; el trigger recompute
  es solo UPDATE.
- **BOQ linking** intacto: la reconciliación no toca `boq_items.apu_template_id`.
- **Quantities** intacto: fuera de alcance, sin cambios.
- **Catálogo / price review / price monitor** intactos.
- **Golden master**: la reconciliación NO toca totales BOQ ni AIU ni snapshots.

---

## 10. Fuera de alcance

Quantities, nuevos parsers Excel, exports APU, SMTP, usuarios, chat, asistente
conversacional, editor APU avanzado, nuevas fórmulas, db push remoto, deploy.

## 11. Deuda futura registrada

- `APU_EXPORTS_V1`
- `BUDGET_EXPORT_WITH_APU_ANNEX_V1` (desde un presupuesto: PDF/Excel del presupuesto +
  APU vinculados PDF/Excel + paquete completo con anexos)
- `APU_UI_ADVANCED_EDITING_V1`
- `APU_REUSABLE_CREW_TEMPLATES_V1`
- `APU_COMPONENT_DESCRIPTION_BACKFILL` (backfill `description` desde `notes`)
- `APU_COMPONENT_REJECT_STATUS` (rechazo por recurso específico)
- `APU_COMPONENT_AUDIT_LOG` (auditoría old/new completa más allá del action log)
