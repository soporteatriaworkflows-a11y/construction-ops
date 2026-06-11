# APU_COST_MODEL_AND_IMPORT_V1 — Contrato Preliminar (DRAFT)

**Rama de auditoría:** `audit/apu-cost-model-import-v1`
**Fecha:** 2026-06-11
**Estado:** DRAFT — pendiente aprobación por agent-orchestrator antes de implementar
**Basado en:** `APU_COST_MODEL_AND_IMPORT_V1_DISCOVERY.md`
**Prerequisito:** `feature/price-monitoring-agent-v1` debe estar mergeado a `main`

---

## 0. Alcance de este contrato

Define los contratos, decisiones técnicas y límites de la implementación de:

1. **APU cost model completo** — labor roles reales (Oficial + Ayudante), cuadrillas,
   componentes, herramienta derivada, rendimientos, desperdicios
2. **Importador estructurado** de la hoja APU del Excel Entre Patios
3. **Vinculación APU → BOQ** (resolver `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP`)
4. **Fundación `COST_TYPE_BREAKDOWN_FOUNDATION`**

**Fuera de alcance:**
- Cantidades y despieces geométricos (slice separado posterior)
- Recalculación automática de BOQ ante cambio de precios (oleada futura)
- UI de creación/edición manual de APU (el import es el flujo principal)
- Cuadrillas reutilizables globales (deuda menor diferida)
- Price-monitoring, branding, catalog import (oleada paralela activa)

---

## 1. Cambios de schema propuestos

### 1.1 Migración A: `apu_components_labor_role_id`

```sql
-- Timestamp: 20260613090000 (posterior a todos los de price-monitoring)
-- Tipo: ADITIVA. Sin DROP. Sin cambio de tipos existentes.
-- Datos existentes: todas las filas quedan con labor_role_id = NULL (correcto).

ALTER TABLE apu_components
  ADD COLUMN labor_role_id uuid REFERENCES labor_roles(id) ON DELETE SET NULL;

CREATE INDEX apu_components_labor_role_id_idx ON apu_components (labor_role_id);

-- DOWN: DROP INDEX; ALTER TABLE DROP COLUMN labor_role_id;
```

**Invariante:** cuando `unit_price_source = 'labor_role'`, la columna `labor_role_id`
DEBE ser NOT NULL. Aplicar como constraint o validar en la capa de dominio/import.
El schema permite NULL para retrocompatibilidad con datos existentes.

### 1.2 Migración B: `apu_templates_default_tool_pct`

```sql
-- Timestamp: 20260613090100
-- Tipo: ADITIVA. DEFAULT 0 cubre todos los rows existentes.

ALTER TABLE apu_templates
  ADD COLUMN default_tool_pct numeric(20,10) NOT NULL DEFAULT 0,
  ADD CONSTRAINT apu_templates_tool_pct_nonneg CHECK (default_tool_pct >= 0);

-- DOWN: ALTER TABLE DROP COLUMN default_tool_pct;
```

**Invariante:** si `default_tool_pct > 0`, el dominio lo aplica como costo adicional
sobre el total de M.O. del APU. No se crea fila en `apu_components` para herramienta
derivada.

---

## 2. Modelo de cuadrillas

**Decisión:** sin tabla nueva. Cuadrilla = múltiples filas `apu_components` con
`component_type = 'labor'`, una por rol participante.

```text
Cuadrilla base Entre Patios (2 ayudantes + 1 oficial):

  [component 1]
  component_type    = 'labor'
  labor_role_id     = <id ROL-AY-001>
  resource_id       = <id LAB-AY-001>
  quantity          = rendimiento_dias × 2      -- e.g. 0.10 días/m²
  waste_pct         = 0
  unit_price_source = 'labor_role'
  unit_price_snapshot = costo_diario_ayudante   -- calculado y congelado al import

  [component 2]
  component_type    = 'labor'
  labor_role_id     = <id ROL-OF-001>
  resource_id       = <id LAB-OF-001>
  quantity          = rendimiento_dias × 1      -- e.g. 0.05 días/m²
  waste_pct         = 0
  unit_price_source = 'labor_role'
  unit_price_snapshot = costo_diario_oficial
```

---

## 3. Herramienta derivada — contrato definitivo

**Decisión:** no crear filas `component_type='tool'` para herramienta derivada de M.O.
Usar `apu_templates.default_tool_pct`.

**Cálculo en dominio:**

```typescript
function calculateApuUnitCostFull(
  components: ApuComponentInput[],
  defaultToolPct: DecimalString,
): DecimalString {
  const materialCost = sumOf(components, 'material', 'equipment', 'subcontract', 'other');
  const laborCost    = sumOf(components, 'labor');
  const toolCost     = calculateToolComponentCost(defaultToolPct, laborCost);
  return materialCost.plus(laborCost).plus(toolCost);
}
```

**Invariante:** `calculateApuUnitCostFull` reemplaza al actual `calculateApuUnitCost`
(o se agrega como función nueva manteniendo retrocompatibilidad con `default_tool_pct='0'`).

---

## 4. Labor cost model — contrato de snapshot

Al importar un componente de M.O. en `apu_components`:

```text
unit_price_snapshot = calculateLaborCost(laborRole).dailyIntegralCost
```

Este valor se congela en el momento del import. Si el salario del rol cambia
posteriormente, el snapshot NO cambia; el APU usa el costo congelado hasta que se
reimporte o se cree una nueva versión.

**Trazabilidad:** `labor_role_id` permite mostrar "este componente usó el rol X con
los factores vigentes al momento del import".

---

## 5. Contrato del importador APU

### 5.1 Interfaz de entrada

```typescript
interface ApuSheetImportInput {
  /** Ruta al Excel (privado, no versionado) */
  excelPath: string;
  /** ID de la organización target */
  organizationId: Uuid;
  /** Si true: solo valida y genera preview, no escribe en DB */
  dryRun?: boolean;
  /** Si true: re-importa aunque el APU ya exista (crea nueva versión) */
  forceVersion?: boolean;
}

interface ApuSheetImportResult {
  laborRoles: {
    created: number;
    skipped: number;
    rows: { code: string; status: 'created' | 'skipped'; reason?: string }[];
  };
  apuTemplates: {
    created: number;
    skipped: number;
    rows: { code: string; name: string; status: 'created' | 'skipped'; componentCount: number }[];
  };
  boqLinks: {
    linked: number;
    unlinked: number;
    rows: { itemCode: string; apuCode?: string; status: 'linked' | 'unlinked' }[];
  };
  regressionCheck: {
    pass: boolean;
    expectedDirectCosts: string;
    computedDirectCosts: string;
    diff: string;
  };
}
```

### 5.2 Idempotencia

- **Labor roles:** `INSERT ... ON CONFLICT (organization_id, code) DO NOTHING`
- **APU templates:** `INSERT ... ON CONFLICT (organization_id, code, version) DO NOTHING`
  (si `forceVersion=true`: crear con `version = max(version)+1`)
- **APU components:** DELETE + re-insert por `apu_template_id` (siempre actualiza componentes)
- **BOQ links:** `UPDATE boq_items SET apu_template_id = ? WHERE ... AND apu_template_id IS NULL`
  (nunca rompe links ya establecidos)

### 5.3 Privacidad

- Salarios reales → sanitizar en `sanitize.ts` antes de escribir en fixture
- Datos personales en hoja APU (si aparecen) → `findPrivateLeaks` falla el import

### 5.4 Regresión

Después del import, la cadena BOQ debe seguir produciendo:
```
costos_directos = 336084479.93690735 (±0.01 COP)
```

Los costos unitarios APU reales del Excel se congelan como `unit_price_snapshot` en
`boq_items`, de modo que la suma no cambia respecto al fixture actual.

---

## 6. Contrato del linker BOQ → APU

### 6.1 Estrategia de matching

```text
PRIORIDAD 1: Matching por código explícito
  Si COTIZACION 1 PISO col A contiene referencia al código APU de la hoja APU
  → match directo por código
  → automatizable sin aprobación humana

PRIORIDAD 2: Matching por descripción normalizada
  Normalizar: trim, lowercase, colapsar espacios, quitar tildes
  Si similarity(description_snapshot, apu.name) > 0.85
  → candidato único → requiere revisión humana antes de persistir

PRIORIDAD 3: No match
  Mantener boq_items.apu_template_id = NULL
  Reportar en resultado del import
```

### 6.2 Invariante de inmutabilidad

No se modifica `apu_template_id` si la versión de presupuesto está `issued/approved/archived`.
Solo se puede linkar en versiones `draft/review`.

---

## 7. Contrato de `COST_TYPE_BREAKDOWN_FOUNDATION`

Una vez que `boq_items.apu_template_id` está poblado, el read-model puede calcular:

```typescript
interface CostTypeBreakdown {
  chapterId: Uuid;
  materials:     DecimalString;  // Σ apu_components donde component_type='material'
  labor:         DecimalString;  // Σ apu_components donde component_type='labor'
  equipment:     DecimalString;  // Σ apu_components donde component_type='equipment'
  tools:         DecimalString;  // Σ default_tool_pct × labor
  subcontracts:  DecimalString;  // Σ apu_components donde component_type='subcontract'
  other:         DecimalString;
  total:         DecimalString;  // = materials + labor + equipment + tools + subcontracts + other
}
```

**Regla:** estos montos son **read-only derivados**; no se persisten; se calculan en el
read-model a partir de `apu_components` + `boq_items`. El total de cada breakdown debe
coincidir con el subtotal del capítulo correspondiente.

---

## 8. Contrato del read-model APU ampliado

### 8.1 `ApuSummary` — sin cambios

El contrato actual es suficiente para la lista:
```typescript
interface ApuSummary {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
}
```

### 8.2 `ApuDetail` — nuevo (para página de detalle)

```typescript
interface ApuComponentView {
  id: Uuid;
  componentType: ApuComponentType;
  resourceCode?: string;
  resourceName?: string;
  laborRoleCode?: string;
  laborRoleName?: string;
  unit: string;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  sortOrder: number;
}

interface ApuDetail {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  version: number;
  defaultToolPct: DecimalString;
  components: ApuComponentView[];
  unitCostMaterials: DecimalString;
  unitCostLabor: DecimalString;
  unitCostEquipment: DecimalString;
  unitCostTools: DecimalString;      // defaultToolPct × unitCostLabor
  unitCostOther: DecimalString;
  unitCostTotal: DecimalString;
}
```

**Privacidad por rol:**
- `ViewerRole.client`: no exponer `laborRoleCode`, `laborRoleName`, salarios internos
  (la información de costos de mano de obra es interna 🔒)
- `ViewerRole.internal` / `management`: ver todo

---

## 9. Nuevas rutas API y UI (solo listar, no implementar)

| Ruta | Método | Descripción | Agente |
|---|---|---|---|
| `/apu/[id]` | GET (Server Component) | Detalle APU con componentes | agent-frontend-boq |
| `GET /api/apu/[id]` | GET | APU detail JSON | agent-cost-domain |
| `POST /api/apu/import` | POST | Import APU desde Excel | agent-excel-mapper |
| `GET /api/apu/[id]/snapshot` | GET | Snapshot para versión | agent-cost-domain |

---

## 10. Tests requeridos

### 10.1 Tests de dominio nuevos

| Test | Archivo | Descripción |
|---|---|---|
| `calculateApuUnitCostFull` con tool | `apu.test.ts` | Con `defaultToolPct > 0` |
| `calculateLaborCost` Ayudante | `labor.test.ts` | Factores reales sanitizados |
| Snap labor cost→apu_component | `apu.test.ts` | Snapshot desde `dailyIntegralCost` |

### 10.2 Tests de importador

| Test | Archivo | Descripción |
|---|---|---|
| Parse bloque salarial | `apu-sheet-parser.test.ts` | Oficial + Ayudante |
| Parse bloque APU | `apu-sheet-parser.test.ts` | Template + components |
| Idempotencia import | `apu-import.test.ts` | Re-import → mismo resultado |
| Privacidad fixture | `sanitize.test.ts` | Sin salarios reales |

### 10.3 Regresión golden master post-import

```text
Después del import APU + linker BOQ→APU:
costos_directos    = 336084479.93690735 ± 0.01 COP
total_costo        = 372247169.9781186  ± 0.01 COP
```

El import NO cambia las cantidades ni precios del BOQ existente; solo agrega
`apu_template_id` como referencia. La regresión debe seguir pasando.

---

## 11. Dependencias y blockers

| # | Dependencia | Estado |
|---|---|---|
| 1 | `feature/price-monitoring-agent-v1` mergeado a main | ⏳ Pendiente |
| 2 | Verificación empírica hoja APU con `dump-workbook.mjs` | ⏳ Pendiente |
| 3 | Decisión de aprobación de este contrato por agent-orchestrator | ⏳ Pendiente |
| 4 | Datos reales sanitizados de salarios (Oficial + Ayudante) del Excel | ⏳ Pendiente |

---

## 12. Archivos que PUEDE tocar la implementación

**Habilitados:**
```text
scripts/excel-import/              -- parser APU sheet nuevo
scripts/fixtures/                  -- actualizar fixture con APU reales
scripts/golden-master/             -- tests de regresión APU
supabase/migrations/               -- solo las 2 migraciones aditivas nuevas
apps/web/modules/apu/              -- calculateApuUnitCostFull
apps/web/tests/unit/cost-domain/   -- tests de dominio nuevos
apps/web/server/read-model/        -- ApuDetail + listApus mejorado
apps/web/app/(dashboard)/apu/      -- página de detalle /apu/[id]
```

**NO tocar:**
```text
docs/HANDOFF_LOG.md                -- solo agent-orchestrator al cierre
docs/DECISIONS.md                  -- solo agent-orchestrator
docs/QA_REPORT.md                  -- solo agent-qa
docs/INTEGRATION_REQUESTS.md      -- solo agent-orchestrator
supabase/migrations/20260530*      -- ya aplicadas, inmutables
apps/web/server/catalog/           -- propiedad de oleada price-monitoring
apps/web/server/pricing/           -- propiedad de oleada price-monitoring
apps/web/app/(dashboard)/catalog/  -- propiedad de oleada price-monitoring
main                               -- NUNCA tocar directamente
feature/price-monitoring-agent-v1  -- oleada independiente activa, no pisar
```

---

## 13. Criterios de aceptación

```text
[ ] 2 migraciones aditivas aplicadas sin errores (dry-run pass)
[ ] labor_roles: Oficial + Ayudante con factores sanitizados correctos
[ ] apu_templates: todos los APU reales de COTIZACION 1 PISO importados
[ ] apu_components: componentes por APU con labor_role_id poblado
[ ] default_tool_pct: correcto para cada APU con herramienta derivada
[ ] boq_items.apu_template_id: al menos 80% de los 131 items linkados
[ ] Regresión golden master: 22/22 PASS después del import
[ ] costos_directos post-link = 336084479.93690735 ± 0.01
[ ] RLS runtime: sin regresión en checks existentes + nuevos checks APU
[ ] Privacidad: ningún dato salarial real en fixture público
[ ] Typecheck + lint: 0 errores/warnings
[ ] Tests nuevos: todos PASS
[ ] Sin scraping, sin ag-grid-enterprise, sin AGPL
```

---

## Historial de cambios

| Fecha | Cambio |
|---|---|
| 2026-06-11 | Draft inicial generado por auditoría read-only en `audit/apu-cost-model-import-v1` |

---

*Este contrato es un DRAFT. Debe ser aprobado por agent-orchestrator antes de iniciar
la implementación. No crear migraciones, no modificar código de producto, no hacer
deploy hasta recibir aprobación explícita.*
