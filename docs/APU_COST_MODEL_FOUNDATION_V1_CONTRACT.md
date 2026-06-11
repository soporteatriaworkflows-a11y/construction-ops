# APU_COST_MODEL_FOUNDATION_V1 — Contrato Congelado (FASE 4B.1)

**Rama:** `feature/apu-cost-model-foundation-v1`
**Base autorizada:** `origin/main = 8a81a98`
**Fecha:** 2026-06-11
**Estado:** CONGELADO — aprobado por agent-orchestrator
**Basado en:** `APU_COST_MODEL_AND_IMPORT_V1_DISCOVERY.md` + `APU_COST_MODEL_AND_IMPORT_V1_CONTRACT_DRAFT.md` (commit documental `b75e7a4`)

---

## 1. Alcance

Esta slice completa el **fundamento trazable del costo APU** sin romper
compatibilidad ni alterar el golden master. El sistema debe poder representar:

```
Rol laboral  → componentes salariales → costo mensual → costo día → costo hora
Cuadrilla    → integrantes → rol → cantidad → subtotal laboral
Actividad APU → componentes (recurso + M.O.) → rendimiento → desperdicio
              → herramienta menor derivada → total calculado
```

Entregables concretos:

1. Migración aditiva `apu_components.labor_role_id` (nullable, FK, índice,
   invariante same-org).
2. Migración aditiva `apu_templates.default_tool_pct` (NOT NULL DEFAULT 0,
   CHECK 0..1).
3. Dominio retrocompatible: cuadrilla como suma de integrantes y costo unitario
   completo con herramienta derivada.
4. Fixture: rol **Ayudante** + cuadrilla 2 Ayudantes + 1 Oficial con costos
   derivados reproducibles.
5. Read-model `ApuDetail` + vista de detalle `/apu/[id]` proporcional.
6. Pruebas de schema/RLS, labor, APU y regresión (golden master intacto).

## 2. Fuera de alcance (deudas registradas)

| Deuda | Contenido diferido |
|---|---|
| `ENTRE_PATIOS_APU_IMPORT_V1` (FASE 4B.2) | Parser de la hoja APU real, bloque salarial → labor_roles, bloques APU → templates/components, sanitización de salarios reales |
| `BOQ_APU_LINKING_V1` | Poblar `boq_items.apu_template_id` (131 ítems), matching por código/descr., COST_TYPE_BREAKDOWN_FOUNDATION |
| `QUANTITY_TAKEOFF_IMPORT_V1` (FASE 4B.3) | Cantidades, despieces, `boq_items.quantity_group_id` |
| `APU_UI_ADVANCED_EDITING_V1` | Editor manual de APU, creación/edición de componentes desde UI |

También fuera de alcance: SMTP, usuarios, chat, deploy, db push remoto,
datos dummy remotos, cuadrillas reutilizables globales (`apu_crew_templates`).

## 3. Modelo laboral

Sin cambios de fórmula. `calculateLaborCost` (en `apps/web/modules/apu/labor.ts`)
sigue siendo la única fuente de verdad:

```
salario_integral_mensual =
    base_salary × (1 + benefits_pct + social_security_pct + payroll_tax_pct)
  + transport_subsidy
  + (uniform_cost / uniform_period_months)

costo_diario = mensual / working_days_month
costo_hora   = diario  / working_hours_day
```

Roles del fixture (factores ficticios plausibles, sanitizados):

| Rol | code | base | transporte | benef. | seg.soc. | paraf. | dotación | mensual | día | hora |
|---|---|---|---|---|---|---|---|---|---|---|
| Oficial | `ROL-OF-001` | 1.300.000 | 162.000 | 0.40 | 0.205 | 0.09 | 120.000/4m | 2.395.500 | 99.812,5 | 12.476,5625 |
| Ayudante | `ROL-AY-001` | 1.160.000 | 162.000 | 0.40 | 0.205 | 0.09 | 120.000/4m | 2.158.200 | 89.925 | 11.240,625 |

Los valores mensual/día/hora NO se almacenan: se derivan siempre con
`calculateLaborCost` (reproducibles).

## 4. Trazabilidad `labor_role_id`

**Migración A (aditiva):** `supabase/migrations/20260613090000_apu_components_labor_role_id.sql`

```sql
ALTER TABLE apu_components
  ADD COLUMN labor_role_id uuid REFERENCES labor_roles(id) ON DELETE SET NULL;
CREATE INDEX apu_components_labor_role_id_idx ON apu_components (labor_role_id);
```

- Nullable: todas las filas existentes quedan en NULL (retrocompatible).
- `ON DELETE SET NULL`: borrar un rol no rompe el APU (el snapshot congelado
  en `unit_price_snapshot` sigue siendo válido).
- **Invariante same-org (trigger controlado):** un `labor_role_id` debe
  pertenecer a la misma organización que el `apu_template` del componente.
  Se aplica con constraint trigger `app.apu_component_labor_role_same_org()`
  (INSERT/UPDATE). Cross-org ⇒ excepción.
- **Invariante de dominio (no DB, retrocompatibilidad):** los flujos NUEVOS que
  construyen componentes labor con `unit_price_source='labor_role'` DEBEN
  proveer `labor_role_id` (el dominio falla seguro). Las filas históricas con
  source `labor_role` y `labor_role_id NULL` se toleran en lectura (se muestran
  como no trazables) y se regularizarán en `ENTRE_PATIOS_APU_IMPORT_V1`.
  No se agrega CHECK en DB para no invalidar datos previos.

## 5. Cuadrillas

**Decisión congelada: sin tabla nueva.** Una cuadrilla se codifica como
múltiples filas `apu_components` con `component_type='labor'`, una por rol:

```text
Cuadrilla 2 Ayudantes + 1 Oficial, rendimiento r días/unidad:

  fila Ayudante: labor_role_id=ROL-AY-001, quantity = r × 2,
                 unit_price_snapshot = costo_diario_ayudante, waste_pct = 0
  fila Oficial:  labor_role_id=ROL-OF-001, quantity = r × 1,
                 unit_price_snapshot = costo_diario_oficial,  waste_pct = 0
```

Dominio: `calculateCrewLaborCost(members)` = Σ(cantidad integrantes × costo por
rol). Cuadrillas reutilizables entre APU quedan como deuda menor diferida.

## 6. Herramienta menor derivada y `default_tool_pct`

**Migración B (aditiva):** `supabase/migrations/20260613090100_apu_templates_default_tool_pct.sql`

```sql
ALTER TABLE apu_templates
  ADD COLUMN default_tool_pct numeric(20,10) NOT NULL DEFAULT 0,
  ADD CONSTRAINT apu_templates_tool_pct_range
    CHECK (default_tool_pct >= 0 AND default_tool_pct <= 1);
```

- Es una **fracción** (0.05 = 5% de la M.O.). Rango [0, 1].
- DEFAULT 0 cubre todas las filas existentes sin backfill.
- **Semántica congelada:** la herramienta menor derivada NO se almacena como
  fila `apu_components`; se calcula en dominio como
  `default_tool_pct × subtotal_mano_de_obra` (resuelve la ambigüedad B.4 del
  discovery).
- Las filas `component_type='tool'` EXPLÍCITAS existentes (herramienta con
  cantidad y precio propios) siguen funcionando con la regla canónica
  `qty × (1+waste) × price`. Ambos mecanismos coexisten.

## 7. Rendimientos y desperdicios

Sin cambios de schema ni de fórmula:

- `apu_components.quantity` = rendimiento/consumo por unidad de actividad.
- `apu_components.waste_pct` = desperdicio como fracción; fórmula canónica
  `total = quantity × (1 + waste_pct) × unit_price_snapshot`.
- Componentes labor usan `waste_pct = 0` por convención.

## 8. Unidades canónicas

Se REUTILIZA `apps/web/server/pricing/units.ts` (`canonicalizeUnit`,
`unitsEquivalent`) de UNIT_ALIAS_NORMALIZATION_V1. Reglas:

- El valor RAW se preserva siempre (`ApuDetail.unit` = raw).
- `ApuDetail.unitCanonical` expone la forma canónica para mostrar/comparar
  (`m2`/`M2`/`m²` → `m²`; `und`/`unidad` → `und`; `dia`/`jornada` → `día`).
- No se inventa ninguna tabla de aliases nueva ni se duplica la existente.

## 9. Compatibilidad con componentes existentes

- `calculateApuComponentCost`, `calculateLaborComponentCost`,
  `calculateToolComponentCost`, `calculateApuUnitCost` NO cambian de firma ni
  de comportamiento.
- Se agregan (aditivo):
  - `calculateCrewLaborCost(members: {count, unitCost}[])` — Σ integrantes×costo.
  - `calculateApuUnitCostFull(components, defaultToolPct)` — subtotales por tipo
    + herramienta derivada. Con `defaultToolPct='0'` reproduce EXACTAMENTE
    `calculateApuUnitCost` sobre los mismos componentes.
- El read-model calcula `unitCost` con `calculateApuUnitCostFull`; los APU
  existentes (default_tool_pct=0) conservan su valor anterior.
- Decimal.js en todo el dominio; sin redondeo intermedio; nunca `number`.
- El servidor NUNCA confía en subtotales enviados por el navegador: los totales
  se recalculan server-side desde componentes persistidos.

## 10. Read-model y privacidad

`ApuSummary` no cambia. Se agrega `ApuDetail` + `getApuDetail(viewer, apuId)`
al `ReadModelPort` (ambas implementaciones: fixture y Drizzle):

```typescript
interface ApuComponentView {
  id: Uuid;
  componentType: ApuComponentType;          // material|labor|equipment|tool|subcontract|other
  resourceCode?: string; resourceName?: string;
  laborRoleCode?: string; laborRoleName?: string;  // 🔒 omitidos para client
  quantity: DecimalString;                  // rendimiento/consumo
  wastePct: DecimalString;                  // desperdicio
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  sortOrder: number;
}

interface ApuDetail {
  id: Uuid; code: string; name: string;
  unit: string;            // RAW preservado
  unitCanonical: string;   // vía canonicalizeUnit
  version: number;
  defaultToolPct: DecimalString;
  components: ApuComponentView[];
  unitCostMaterials: DecimalString;
  unitCostLabor: DecimalString;
  unitCostEquipment: DecimalString;
  unitCostTools: DecimalString;     // tool explícita + derivada (defaultToolPct × labor)
  unitCostSubcontract: DecimalString;
  unitCostOther: DecimalString;
  unitCostTotal: DecimalString;
}
```

- APU inexistente o de otra organización ⇒ `ApuNotFoundError` (sin fallback).
- Rol `client`: se OMITEN `laborRoleCode`/`laborRoleName` (proyección
  backend-first, no solo UI).

## 11. UI mínima

- `/apu` (lista): sin cambios de contrato; cada card enlaza al detalle.
- `/apu/[id]` (nuevo, Server Component): código, nombre, unidad canónica,
  versión, componentes con tipo/rendimiento/desperdicio/rol laboral (si aplica),
  subtotales por tipo, herramienta derivada (si `defaultToolPct > 0`) y total.
- Sin editor, sin importador, sin botones rotos.

## 12. RLS

- `labor_roles`, `apu_templates`: políticas por organización existentes,
  ENABLE + FORCE — sin cambios.
- `apu_components`: política por JOIN a `apu_templates` — sin cambios; la
  columna `labor_role_id` hereda esa protección.
- Trigger same-org (sección 4) impide referencias cross-org.
- Checks runtime nuevos en `scripts/rls-runtime/run.ts`: visibilidad
  cross-org de componentes con labor_role_id, escritura cross-org denegada,
  trigger same-org, CHECK de default_tool_pct.

## 13. Migraciones (resumen)

| Archivo | Tipo | Riesgo |
|---|---|---|
| `20260613090000_apu_components_labor_role_id.sql` | ADD COLUMN NULL + FK + índice + trigger same-org | Bajo |
| `20260613090100_apu_templates_default_tool_pct.sql` | ADD COLUMN DEFAULT 0 + CHECK | Bajo |
| `supabase/seeds/0006_demo_apu_foundation.sql` | Seed aditivo local (Ayudante + APU cuadrilla demo) | Nulo (solo local) |

Sin DROP. Sin cambio de tipos. Sin backfill destructivo. Sin db push remoto en
esta slice (se aplica a producción en el release, igual que price-monitoring).

## 14. Fixture (v2.1.0)

- `laborRoles`: + `ROL-AY-001 Ayudante` (factores de la tabla §3).
- Componente labor existente del `APU-PISO-PORC`: + `laborRoleId = ROL-OF-001`
  (solo trazabilidad; snapshot y total NO cambian).
- `apuTemplates`: `defaultToolPct = "0"` en `APU-PISO-PORC` (compatibilidad);
  + nuevo `APU-MURO-LAD` (mampostería demo, unidad m²) con
  `defaultToolPct = "0.05"` y cuadrilla 2 Ayudantes + 1 Oficial:

```text
material  MAT-CEM-001: qty 0.3,  waste 0.05, snapshot 28000   → 8820
labor AY  ROL-AY-001:  qty 0.4 (= 0.2 días × 2), snapshot 89925   → 35970
labor OF  ROL-OF-001:  qty 0.2 (= 0.2 días × 1), snapshot 99812.5 → 19962.5
subtotal M.O.                                                  → 55932.5
herramienta derivada 0.05 × 55932.5                            → 2796.625
TOTAL APU                                                      → 67549.125
```

Todos los snapshots labor son reproducibles con `calculateLaborCost` (§3).

## 15. Pruebas requeridas (mínimo 30)

SCHEMA/RLS: labor_role_id nullable retrocompatible; FK válida; cross-org
bloqueado; default_tool_pct válido; fuera de rango rechazado; RLS FORCE
conservado.

LABOR: costo hora Oficial; costo hora Ayudante; cuadrilla 2A+1O suma correcta;
componentes salariales preservados; raw values preservados; Decimal.

APU: material qty×(1+waste)×price; waste 0; herramienta derivada = % M.O.;
herramienta explícita intacta; labor component → rol; unidad canónica
reutilizada; m2 ≡ m²; componente labor_role sin vínculo falla seguro en
flujos nuevos.

REGRESIÓN: fixtures intactos; listApus intacto; /apu renderiza; BOQ intacto;
price monitoring intacto; catálogo bulk intacto; proveedor price-list intacto;
golden master Entre Patios 22/22 (total ≈ COP 372.247.169,97); gm:import
intacto; sin mutaciones de producción.

## 16. Golden master

`costos_directos = 336084479.93690735` y `total_costo = 372247169.9781186`
(±0.01 COP) NO cambian: esta slice no toca `boq_items`, capítulos, AIU ni
cantidades. La regresión 22/22 de `scripts/golden-master/` debe seguir PASS.

## 17. Archivos habilitados / prohibidos

**Habilitados:** `supabase/migrations/2026061309*`, `supabase/seeds/0006*`,
`apps/web/modules/apu/`, `apps/web/server/read-model/`,
`apps/web/server/repositories/read-repository.ts`, `apps/web/lib/db/schema.ts`,
`apps/web/lib/contracts/read-model.ts`, `apps/web/app/(dashboard)/apu/`,
`apps/web/tests/`, `scripts/fixtures/`, `scripts/rls-runtime/`, `docs/` (los
del cierre).

**Prohibidos:** `main`, deploy, db push remoto, `scripts/excel-import/import.ts`
(importación completa = 4B.2), `boq_items.apu_template_id` (linking = deuda),
`apps/web/server/catalog/`, `apps/web/server/pricing/` (solo lectura/reuso de
`units.ts`), `supabase/migrations/20260530*..20260612*` (inmutables).

---

## Historial

| Fecha | Cambio |
|---|---|
| 2026-06-11 | Contrato congelado por agent-orchestrator (FASE 4B.1) |
