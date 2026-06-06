# API Contracts — Construction Ops

> **Contrato congelado v1 — cambios únicamente mediante `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad de **agent-orchestrator**. Define las interfaces TypeScript
> públicas que los agentes consumen y proveen. Sincronizado con
> `docs/DATABASE_SCHEMA.md` (contrato congelado v1, 2026-05-29).

---

## Reglas obligatorias del contrato

1. PostgreSQL usa `snake_case`.
2. TypeScript usa `camelCase`.
3. Tipos e interfaces usan `PascalCase`.
4. Los IDs son UUID, **serializados como `string`**.
5. Las fechas viajan como **ISO 8601** (`string`); en DB son `TIMESTAMPTZ`/`DATE`.
6. Los valores monetarios/financieros **no se calculan con `number`**.
7. Los valores monetarios se **serializan como `string` decimal** (preserva precisión COP).
8. Las operaciones financieras posteriores usan **Decimal.js** (o equivalente aprobado).
9. El **frontend no calcula totales financieros** (los provee cost-domain).
10. **Mocks y fixtures deben respetar EXACTAMENTE estas interfaces.**
11. Prohibido `any` en contratos públicos.
12. Los snapshots emitidos son **inmutables**.
13. Cambios incompatibles ⇒ **nueva versión** del contrato (v2), manteniendo v1 durante migración.

### Alias de tipos base

```ts
/** UUID serializado. */
export type Uuid = string;
/** Fecha/hora ISO 8601 con zona, p. ej. "2026-05-29T10:00:00-05:00". */
export type IsoDateTime = string;
/** Fecha de calendario ISO 8601, p. ej. "2026-05-29". */
export type IsoDate = string;
/**
 * Valor decimal serializado como string (dinero, cantidades, porcentajes).
 * NUNCA number. Ej. "336084479.9369073500". Se opera con Decimal.js.
 */
export type DecimalString = string;
```

### Enums (uniones de string literal, espejo de los CHECK de la DB)

```ts
export type UserRole = 'admin' | 'gerencia' | 'presupuestos' | 'obra' | 'compras' | 'consulta';
export type ProjectStatus = 'active' | 'archived' | 'closed';
export type ScopeType = 'floor' | 'tower' | 'stage' | 'package' | 'unit' | 'modification' | 'other';
export type ScopeStatus = 'active' | 'archived';
export type ResourceType = 'material' | 'labor' | 'equipment' | 'tool' | 'subcontract' | 'other';
export type SupplierType = 'vendor' | 'distributor' | 'manufacturer' | 'subcontractor' | 'other';
export type SyncStatus = 'manual' | 'synced' | 'pending' | 'error';
export type PriceSourceType =
  | 'official_api' | 'official_feed' | 'supplier_csv'
  | 'manual' | 'public_web' | 'invoice' | 'quotation';
export type PricingRuleType =
  | 'preventive_variation' | 'negotiated_discount' | 'tax'
  | 'commercial_markup' | 'rounding' | 'manual_adjustment';
export type PricingRuleScopeType = 'global' | 'project' | 'scope' | 'resource' | 'supplier_product';
export type ApuComponentType = 'material' | 'labor' | 'equipment' | 'tool' | 'subcontract' | 'other';
export type UnitPriceSource = 'resource' | 'labor_role' | 'manual' | 'supplier_product';
export type EstimateStatus = 'draft' | 'active' | 'archived';
export type EstimateVersionStatus = 'draft' | 'review' | 'approved' | 'issued' | 'archived';
export type IndirectCostBaseType = 'direct_cost' | 'utility' | 'custom';
export type CalculationMode = 'direct' | 'length' | 'area' | 'volume' | 'custom';
export type QuantityFormulaType = 'direct' | 'length' | 'area' | 'volume' | 'custom';
```

> **Inmutabilidad de versiones emitidas**: una `EstimateVersion` con
> `status ∈ {approved, issued, archived}` y sus hijos NO se modifican.
> Cambios ⇒ clonar a nueva versión.

---

## Interfaces congeladas v1

> Convención: `🔒` = campo **solo interno** (prohibido para rol cliente desde
> backend). `✅` = **cliente-safe**. Sin marca = neutro/operativo (no se
> expone a cliente salvo que el perfil de export lo incluya explícitamente).

### Organization — tabla `organizations`
```ts
export interface Organization {
  id: Uuid;
  name: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### Profile — tabla `profiles`
```ts
export interface Profile {
  id: Uuid;                 // = auth.users.id
  organizationId: Uuid;
  fullName: string;
  email: string;            // 🔒
  role: UserRole;           // 🔒
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### Project — tabla `projects`
```ts
export interface Project {
  id: Uuid;
  organizationId: Uuid;
  code: string;             // ✅
  name: string;             // ✅
  status: ProjectStatus;
  clientReference?: string | null; // 🔒
  location?: string | null;        // ✅ (según autorización)
  startDate?: IsoDate | null;
  estimatedEndDate?: IsoDate | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### ProjectScope — tabla `project_scopes`
```ts
export interface ProjectScope {
  id: Uuid;
  projectId: Uuid;
  parentScopeId?: Uuid | null;
  code: string;             // ✅
  name: string;             // ✅
  scopeType: ScopeType;
  status: ScopeStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### Resource — tabla `resources`
```ts
export interface Resource {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  defaultWastePct: DecimalString;  // fracción
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### Supplier — tabla `suppliers`
```ts
export interface Supplier {
  id: Uuid;
  organizationId: Uuid;
  name: string;                         // 🔒 según contexto cliente
  supplierType: SupplierType;
  contactData?: Record<string, unknown> | null; // 🔒
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### SupplierProduct — tabla `supplier_products`
```ts
export interface SupplierProduct {
  id: Uuid;
  supplierId: Uuid;
  resourceId: Uuid;
  supplierSku?: string | null;          // 🔒
  supplierProductName?: string | null;
  productUrl?: string | null;           // 🔒
  locationReference?: string | null;    // 🔒
  currency: string;                     // ISO-4217, p. ej. "COP"
  active: boolean;
  manualOverride: boolean;
  lastCheckedAt?: IsoDateTime | null;
  syncStatus: SyncStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### PriceObservation — tabla `price_observations` (append-only, inmutable)
```ts
export interface PriceObservation {
  id: Uuid;
  supplierProductId: Uuid;
  observedPrice: DecimalString;         // 🔒
  stockStatus?: string | null;
  sourceType: PriceSourceType;
  sourceReference?: string | null;
  observedAt: IsoDateTime;
  approved: boolean;
  approvedBy?: Uuid | null;
  notes?: string | null;                // 🔒
  createdAt: IsoDateTime;
}
```

### PricingRule — tabla `pricing_rules`
```ts
export interface PricingRule {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  ruleType: PricingRuleType;
  percentage?: DecimalString | null;    // 🔒 cuando ruleType='negotiated_discount'
  scopeType: PricingRuleScopeType;
  scopeReferenceId?: Uuid | null;
  active: boolean;
  effectiveFrom?: IsoDateTime | null;
  effectiveTo?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### LaborRole — tabla `labor_roles`
```ts
export interface LaborRole {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  baseSalary: DecimalString;            // 🔒
  transportSubsidy: DecimalString;      // 🔒
  benefitsPct: DecimalString;           // 🔒 fracción
  socialSecurityPct: DecimalString;     // 🔒
  payrollTaxPct: DecimalString;         // 🔒
  uniformCost: DecimalString;           // 🔒
  uniformPeriodMonths: DecimalString;
  workingDaysMonth: DecimalString;
  workingHoursDay: DecimalString;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### ApuTemplate — tabla `apu_templates`
```ts
export interface ApuTemplate {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  unit: string;
  chapterTemplateId?: Uuid | null;
  description?: string | null;
  active: boolean;
  version: number;                      // entero >= 1
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### ApuComponent — tabla `apu_components`
```ts
export interface ApuComponent {
  id: Uuid;
  apuTemplateId: Uuid;
  resourceId?: Uuid | null;
  componentType: ApuComponentType;
  quantity: DecimalString;
  wastePct: DecimalString;              // fracción
  unitPriceSource: UnitPriceSource;
  unitPriceSnapshot: DecimalString;     // congelado
  totalComponentCost: DecimalString;    // = quantity × (1+wastePct) × unitPriceSnapshot
  sortOrder: number;
  notes?: string | null;
}
```

### ApuCalculationSnapshot — tabla `apu_calculation_snapshots` (inmutable)
```ts
export interface ApuCalculationSnapshot {
  id: Uuid;
  apuTemplateId: Uuid;
  estimateVersionId: Uuid;
  calculatedUnitCost: DecimalString;
  componentsJson: ApuComponent[];       // detalle congelado
  createdAt: IsoDateTime;
}
```

### Estimate — tabla `estimates`
```ts
export interface Estimate {
  id: Uuid;
  projectScopeId: Uuid;
  code: string;
  name: string;
  status: EstimateStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### EstimateVersion — tabla `estimate_versions`
```ts
export interface EstimateVersion {
  id: Uuid;
  estimateId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  createdBy?: Uuid | null;
  createdAt: IsoDateTime;
  approvedAt?: IsoDateTime | null;
  notes?: string | null;
}
```

### Chapter — tabla `chapters`
```ts
export interface Chapter {
  id: Uuid;
  estimateVersionId: Uuid;
  code: string;             // ✅
  name: string;             // ✅
  sortOrder: number;
}
```

### BoqItem — tabla `boq_items`
```ts
export interface BoqItem {
  id: Uuid;
  estimateVersionId: Uuid;
  chapterId: Uuid;
  apuTemplateId?: Uuid | null;
  quantityGroupId?: Uuid | null;
  code: string;                         // ✅
  descriptionSnapshot: string;          // ✅
  unitSnapshot: string;                 // ✅
  quantitySnapshot: DecimalString;      // ✅
  unitPriceSnapshot: DecimalString;     // ✅ (precio presupuestado)
  subtotal: DecimalString;              // ✅ = quantitySnapshot × unitPriceSnapshot
  sortOrder: number;
  notes?: string | null;
}
```

### IndirectCostRule — tabla `indirect_cost_rules`
```ts
export interface IndirectCostRule {
  id: Uuid;
  estimateVersionId: Uuid;
  code: string;                         // ✅ (A, I, U, IVA)
  name: string;                         // ✅
  percentage: DecimalString;            // ✅ si visibleToClient; 🔒 si no
  baseType: IndirectCostBaseType;
  sortOrder: number;
  visibleToClient: boolean;
}
```

### QuantityGroup — tabla `quantity_groups`
```ts
export interface QuantityGroup {
  id: Uuid;
  projectScopeId: Uuid;
  code: string;
  name: string;
  unit: string;
  calculationMode: CalculationMode;
  createdAt: IsoDateTime;
}
```

### QuantityLine — tabla `quantity_lines`
```ts
export interface QuantityLine {
  id: Uuid;
  quantityGroupId: Uuid;
  description?: string | null;
  length?: DecimalString | null;
  width?: DecimalString | null;
  height?: DecimalString | null;
  multiplier: DecimalString;
  directQuantity?: DecimalString | null;
  formulaType: QuantityFormulaType;
  calculatedQuantity: DecimalString;    // resultado (dominio)
  notes?: string | null;
  sortOrder: number;
}
```

---

## 3. Matriz de privacidad (clasificación desde el contrato)

> **Regla de seguridad**: los campos 🔒 INTERNO **no deben enviarse desde el
> backend al rol cliente**. No basta con ocultarlos visualmente en frontend.
> Los exports y endpoints aplican un proyector por perfil que **omite** estos
> campos antes de serializar.

### Campos CLIENTE-SAFE (✅)
- Información del proyecto autorizada (`project.code`, `project.name`, `location` autorizado).
- Alcance (`projectScope.code`, `projectScope.name`).
- Capítulo (`chapter.code`, `chapter.name`).
- Actividad / ítem (`boqItem.code`, `boqItem.descriptionSnapshot`).
- Unidad (`boqItem.unitSnapshot`).
- Cantidad (`boqItem.quantitySnapshot`).
- Precio presupuestado (`boqItem.unitPriceSnapshot`).
- Subtotal (`boqItem.subtotal`).
- AIU visible (`indirectCostRule` con `visibleToClient = true`).
- Total del presupuesto (derivado por cost-domain).

### Campos INTERNOS (🔒 — prohibidos para rol cliente)
- Precio público observado (`priceObservation.observedPrice`).
- Variación preventiva (`pricingRule` tipo `preventive_variation`).
- Descuento negociado (`pricingRule.percentage` tipo `negotiated_discount`).
- Precio neto esperado (derivado, capa de precio).
- Precio real de compra (`purchaseItem.actualUnitPrice` — provisional v0).
- Ahorro proyectado (`projected_saving`).
- Ahorro realizado (`realized_saving`).
- Margen interno (derivado).
- Observaciones privadas (`priceObservation.notes`).
- Proveedor interno (`supplier.name`/`contactData`/`supplierProduct.*`) cuando no aplique mostrarlo.
- Datos de nómina (`laborRole.baseSalary` y factores).
- Email y rol de usuarios (`profile.email`, `profile.role`).
- Referencia comercial del proyecto (`project.clientReference`).

---

## 4. Ownership de producción/consumo de tipos

| Tipo / contrato | Provee | Consume |
|---|---|---|
| Interfaces de datos (este doc) | orchestrator (congeladas) | db-rls, excel-mapper, frontend-boq, cost-domain, pricing |
| Tipos Drizzle (deben mapear 1:1 a estas interfaces) | db-rls | todos |
| Fixtures JSON (respetan estas interfaces) | excel-mapper | cost-domain, frontend-boq, qa |
| Mocks de UI (respetan estas interfaces) | frontend-boq | — |
| Funciones de cálculo (`calculate*`, `createSnapshot`, `cloneEstimateVersion`) | cost-domain (Oleada 2) | frontend-boq, dashboard, exports |
| Proyector de privacidad por perfil | pricing/exports (Oleada 2-3) | exports, endpoints cliente |
| **`PricingReadPort` / `ApprovedPriceContext`** (interfaz de lectura de precios) | **pricing** (implementa) | **cost-domain** (consume) |
| **`PricingApprovalPort`** (escritura interna de precios) | **pricing** (exclusivo) | — |

---

## 5. Contrato de lectura de precios (Oleada 2A)

La interfaz estable que **agent-cost-domain** consume y **agent-pricing**
implementa está **congelada v1** en **`docs/PRICING_READ_CONTRACT.md`**
(`PricingReadPort`, `ApprovedPriceContext`, `PricingApprovalPort`, proyección
`ClientSafePrice`). **Fuente única de código**:
`apps/web/lib/contracts/pricing-read.ts` (importa cost-domain; implementa
pricing). El puerto de lectura es **async** y devuelve `PricingReadResult`;
errores de dominio como clases `ApprovedPriceNotFoundError` /
`AmbiguousApprovedPriceError`. `PricingReadQuery` admite `estimateVersionId?`
(opcional, congela por versión). Reglas clave:

- cost-domain **no** consulta tablas de pricing ni recalcula descuentos/ahorros;
  solo consume `PricingReadPort` / un DTO `ApprovedPriceContext` compatible.
- Fórmulas canónicas Q8 con base `onlinePublicPrice`; dinero/porcentajes como
  `DecimalString`; sin `number`, sin redondeo intermedio (Q9).
- Campos 🔒 (público, variación, descuento, esperado, real, ahorros,
  `sourceReference`, proveedor interno, aprobador, notas) se **omiten** en el
  backend antes de serializar a rol cliente. Proyección `ClientSafePrice` separada.
- Cambios al contrato: solo vía `docs/INTEGRATION_REQUESTS.md` (orchestrator).

## 6. Contrato del adaptador de proveedores (Oleada 2B)

La interfaz estable de **adaptadores de proveedor** (importación de catálogos/
precios externos con aprobación humana) está **congelada v1** en
**`docs/PRICING_ADAPTER_CONTRACT.md`**: `SupplierAdapter`
(`parseCatalog`/`mapToSupplierProducts`/`buildPreview`/`toPriceObservations`) y
tipos `RawSupplierItem`, `SkuMatchCandidate`, `SkuMatchProposal`, `ImportPreview`,
`ImportResult`. Implementa **agent-homecenter** en
`apps/web/modules/pricing/adapters/` + `scripts/catalog-sync/`. Reglas clave:

- Ningún adaptador escribe en DB; toda persistencia pasa por `PricingApprovalPort`
  tras **aprobación humana simple** (Q11), con auditoría obligatoria.
- Imports **idempotentes** (`providerKey`+`supplierProductId`+`observedAt`+
  `sourceType`); `price_observations` append-only; sin tocar snapshots emitidos.
- Privacidad backend-first: `sku`/`url`/`sourceReference`/proveedor/precio
  público/candidatos/score/aprobador/motivos son 🔒 (nunca a rol cliente).
- Canal Homecenter MVP = CSV/Excel (Q14); sin API pública asumida; sin scraping.

## 8. Planning (Oleada 3B)

El módulo de planificación/cronograma está **congelado v1** en
**`docs/PLANNING_CONTRACT.md`**: entidades PostgreSQL (`schedule_tasks`,
`task_dependencies`, `progress_entries`, `resource_assignments`), dominio puro
`apps/web/modules/planning/` (CPM/ruta crítica/holguras/ciclos, `DecimalString`),
y extensión del read-model (`ScheduleTaskView`, `DependencyView`, `MilestoneView`,
`ProgressEntryView`, `ResourceAssignmentView`, `ScheduleSummary`,
`CriticalPathSummary`; `ReadModelPort.getSchedule/listProgressEntries/
listResourceAssignments`). Reglas: RLS por organización; `progress_entries`
append-only; ruta crítica/holguras/avance financiero **server-side** (cero en
React); privacidad por rol (holguras/costos/`external_reference`/responsables 🔒);
campos reservados para export MS Project futuro (no en 3B). Cambios: vía
`docs/INTEGRATION_REQUESTS.md`.

## 7. Read-model (Oleada 3A)

La **única capa server-side** que alimenta las pantallas está **congelada v1** en
**`docs/READ_MODEL_CONTRACT.md`**: `ReadModelPort`
(`listProjects`/`getProjectOverview`/`listEstimates`/`getEstimateDetail`/
`listApus`/`listQuantities`/`listCatalogResources`/`getDashboardSummary`), DTOs
(`ProjectListItem`, `ProjectOverview`, `EstimateSummary`, `ChapterSummary`,
`BoqItemView`, `ApuSummary`, `QuantityGroupView`, `CatalogResourceView`,
`DashboardSummary`), `ViewerRole`/`ViewerContext`. Fuente única de código:
`apps/web/lib/contracts/read-model.ts` (implementa db-rls en
`apps/web/server/read-model/`). Reglas clave:

- La UI consume DTOs; **no** consulta tablas ni calcula finanzas (cost-domain y
  pricing se ejecutan server-side dentro del read-model).
- Dos fuentes explícitas (`FixtureReadModelRepository` / `DrizzleReadModelRepository`)
  vía `READ_MODEL_SOURCE=fixture|db`; sin fallback silencioso.
- Proyección por rol: campos 🔒 (precio público/descuentos/ahorros/proveedor/
  SKU/URL/candidatos/score/aprobador/notas) omitidos para rol `client`.
- Dinero como `DecimalString`; sin float en React.

> Funciones financieras (`calculateApuComponent`, `calculateApuUnitPrice`,
> `calculateBoqItem`, `calculateChapterTotal`, `calculateDirectCosts`,
> `calculateAiu`, `calculateTotal`, `calculateValuePerSqm`,
> `cloneEstimateVersion`, `createSnapshot`) se **definen en la Oleada 2** por
> cost-domain. Sus firmas usarán `DecimalString`/Decimal y NO se duplican en
> frontend.

---

## Capa de precio — fórmulas canónicas (Q8 — RESUELTA 2026-05-30)

Base del descuento negociado = **`online_public_price`** (NO
`budget_reference_price`). Todas las cantidades son `DecimalString` y se operan
con `Decimal.js` (sin float JS). Los porcentajes son fracciones (ej. `0.03`).

```
budget_reference_price  = online_public_price × (1 + preventive_variation_pct)
expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)
projected_saving        = budget_reference_price − expected_purchase_price
realized_saving         = budget_reference_price − actual_purchase_price
```

Reglas:
- `negotiated_discount_pct` se aplica por defecto sobre `online_public_price`.
  Las excepciones futuras (base alternativa) son **configurables por proveedor
  o por producto**; el default permanece `online_public_price`.
- `actual_purchase_price` proviene de factura o compra real (provisional v0:
  `purchase_items.actual_unit_price`).
- 🔒 **INTERNO, nunca al rol cliente**: `negotiated_discount_pct`,
  `expected_purchase_price`, `projected_saving`, `realized_saving`, margen.
  Privacidad backend-first (el backend NO serializa estos campos a cliente).
- `budget_reference_price` (referencia presupuestada) puede mostrarse al cliente
  como precio unitario; el desglose de descuento/ahorro no.

## Política de redondeo COP (Q9 — RESUELTA 2026-05-30)

Separación explícita **cálculo interno** ↔ **presentación**.

**Cálculo interno (fuente de verdad):**
- Operar con `Decimal.js`; persistir dinero como `NUMERIC(20,10)`.
- Serializar dinero como `string` decimal (`DecimalString`); nunca `number`.
- **No** usar float de JavaScript para cálculos financieros.
- **No** redondear pasos intermedios; snapshots con precisión completa.

**Presentación (capa de salida, no muta datos):**
- Modo de redondeo: **`ROUND_HALF_UP`**.
- UI cliente y PDF cliente: **COP sin decimales** (0 dp).
- Excel técnico interno: hasta **2 decimales**.
- Regresión y auditoría: **precisión raw completa** (sin redondeo).

El redondeo visual **no** modifica snapshots, cálculos ni regresión.

---

## Endpoints REST/RSC (a definir en Oleada 1 según RSC vs API routes)

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|------------|-------------|
| GET    | `/api/projects` | usuario | Lista proyectos de la organización |
| POST   | `/api/projects` | presupuestos | Crea proyecto |
| GET    | `/api/estimates/:id` | usuario | Detalle de presupuesto |
| POST   | `/api/estimates/:id/issue` | gerencia | Emite versión (inmutable) |
| GET    | `/api/exports/budget` | usuario | Descarga según perfil del rol |

> Los endpoints definitivos se documentan tras decidir RSC vs API routes en
> la Oleada 1. Toda respuesta a rol cliente pasa por el proyector de privacidad.

---

## Exportaciones (Oleada 3C) — ver `docs/EXPORT_PROFILES_CONTRACT.md`

El módulo de exportaciones (`agent-exports`) consume **DTOs ya proyectados por
rol** del `ReadModelPort` canónico; **no** accede a tablas crudas ni recalcula
finanzas. Contrato de código congelado:

```ts
type ExportProfile = 'client' | 'site' | 'management' | 'internal'; // = ViewerRole
type ExportFormat  = 'xlsx-client' | 'xlsx-internal' | 'pdf-client'
                   | 'pdf-management' | 'csv-schedule';
interface ExportRequest { profile; projectId; estimateVersionId?; format;
  includeSchedule?; includeProgress?; requestedBy; requestedAt; }
interface ExportResult  { fileName; contentType; buffer; sizeBytes;
  generatedAt; profile; }
interface ExportService { generate(request: ExportRequest): Promise<ExportResult>; }
```

Route handlers de descarga bajo `apps/web/app/api/exports/` (content-type por
formato; nombres sanitizados; errores sin stack). La whitelist por perfil y los
formatos MVP están congelados en `docs/EXPORT_PROFILES_CONTRACT.md` (v1).
**Sin `.mpp` ni XML MS Project** en esta oleada.

---

## Reglas de cambio del contrato

1. Modificar tipos públicos exige actualizar este documento y notificar a los consumidores.
2. Cambios incompatibles ⇒ v2; se mantiene v1 durante la migración.
3. La edición de este archivo es exclusiva de `agent-orchestrator`. Otros
   agentes solicitan cambios vía `docs/INTEGRATION_REQUESTS.md`.

---

## Autenticación (Oleada 4A) — ver `docs/AUTH_CONTRACT.md`

Modos `APP_AUTH_MODE` (`demo`|`supabase`) × `READ_MODEL_SOURCE`
(`fixture`|`db`), sin fallback silencioso. `AuthenticatedViewer`
(`userId`/`profileId`/`organizationId`/`role`/`email?`) resuelto **solo
server-side** desde la sesión y la membresía (`profiles` por `auth.uid()`);
nunca desde el navegador ni query params; deny-by-default sin membresía. Mapeo
`profiles.role`→`ViewerRole` y matriz ruta×rol congelados en AUTH_CONTRACT. El
guard de UI/route **no** reemplaza RLS.

---

## Runtime de autenticación (Oleada 4A.2) — ver `docs/AUTH_RUNTIME_CONTRACT.md`

Sesión SSR con `@supabase/ssr` (cookies `getAll`/`setAll`; guard de Proxy con
`auth.getClaims()`, nunca `getSession()` server-side). `resolveViewer()` elige
viewer por `APP_AUTH_MODE` (`demo`→`getDemoViewer`; `supabase`→
`resolveAuthenticatedViewer` desde sesión→`profiles`), sin fallback silencioso.
`/api/exports` en modo `supabase` exige viewer autenticado y **no** permite
escalamiento de perfil por query (perfil efectivo ≤ `ViewerRole`).

---

## Escritura de proyectos (Oleada 4B.1) — ver `docs/PROJECTS_CRUD_CONTRACT.md`

Primera capa de **escritura** real (el `ReadModelPort` sigue siendo solo lectura).
`ProjectsWriteRepository` (`apps/web/server/projects/`): `createProject(viewer,
input)` y `getProjectById(viewer, id)`. `CreateProjectInput` permitido desde el
navegador = `{ name, city, description?, initialStatus? }`. `organization_id`
(= `app.current_org()` por RLS), `created_by` (= `viewer.profileId`), `code`
(autogenerado), `id` y timestamps se derivan **server-side**; nunca del navegador.
"Ciudad" persiste en `projects.location`. Creación exige `APP_AUTH_MODE=supabase` +
`READ_MODEL_SOURCE=db`; en `demo`/`fixture` la creación está deshabilitada. Cliente
RLS-bound (sin service-role); cross-org ⇒ 404 amable.

## Escritura de alcances (Oleada 4B.2) — ver `docs/SCOPES_CRUD_CONTRACT.md`

`ScopesWriteRepository` (`apps/web/server/scopes/`): `insertScope(viewer, projectId,
input)`, `listScopesByProject(viewer, projectId)`, `getScopeById(viewer, scopeId)`.
`CreateScopeInput` permitido desde el navegador = `{ name, scopeType, description? }`
(`scopeType` ∈ floor/tower/stage/package/unit/modification/other). `created_by`
(= `viewer.profileId`), `status` (`active`), `code` (autogenerado), `id` y timestamps
se derivan **server-side**; `project_id` llega del path y se **valida** por visibilidad
RLS (cross-org ⇒ `ProjectNotFoundError`). No hay `organization_id` en `project_scopes`:
el aislamiento es transitivo vía `projects.organization_id` (policy `project_scopes_all`,
sin cambios). Migración aditiva `20260604120000_project_scopes_authorship` añadió
`description` + `created_by`. Creación exige `supabase`+`db`; cliente RLS-bound (sin
service-role). Constantes client-safe en `@/lib/scopes/scope-types`.

## Importación de Excel (Oleada 4C.1) — ver `docs/EXCEL_IMPORT_CONTRACT.md`

`apps/web/server/estimates/import/`: `previewEstimateExcelImport(viewer, estimateId,
file)` (parsea + valida, NO escribe; digest SHA-256), `confirmEstimateExcelImport(viewer,
estimateId, file, digest)` (re-parse + compara digest + RPC atómica),
`getEstimateImportStatus(viewer, estimateId)`. Formato `.xlsx`, hoja `COTIZACION 1 PISO`,
columnas por encabezado. La importación usa la RPC **`public.import_boq_into_version(
p_version_id, p_chapters jsonb, p_items jsonb)`** `SECURITY INVOKER` (versión vacía/
editable, subtotal recalculado server-side, atómica). `subtotal = quantity × unit_price`
(Decimal); nunca confiado del cliente/Excel. Tope archivo 3 MB
(`serverActions.bodySizeLimit='4mb'`). Tipos client-safe en `@/lib/import/types`. Solo
`db`; sin service-role; el archivo no se persiste.

## Revisión operativa del presupuesto (Oleada 4D.1)

`EstimatesWriteRepository` (lectura RLS-bound, db+fixture):
`listChaptersByEstimateVersion(viewer, estimateId)` (capítulos de la versión activa con
`itemCount` + subtotal), `getChapterById(viewer, chapterId)` (capítulo + contexto
proyecto/alcance/presupuesto/versión; cross-org ⇒ `ChapterNotFoundError`),
`listItemsByChapter(viewer, chapterId)` (ítems BOQ ordenados por `sort_order`). El resumen
operativo reusa `getEstimateById`. Exponen `source_code`/`source_row` (trazabilidad 4C.3).
Tipos client-safe en `@/lib/estimates/review-types`. **Sin migración**; solo lectura;
sin service-role; sin fallback silencioso db→fixture.

## AIU editable + total general (Oleada 4D.2) — ver `docs/AIU_CRUD_CONTRACT.md`

`EstimatesWriteRepository`: `getEstimateVersionAiu(viewer, estimateId)` (porcentajes
humanos de la versión activa + `isEmpty`/`editable`), `updateEstimateVersionAiu(viewer,
estimateId, input)` (solo 4 % del navegador; **upsert atómico** de `indirect_cost_rules`
`A/I/U/IVA` por versión; solo `db`; fixture ⇒ `AiuWriteNotSupportedError`),
`calculateEstimateFinancialSummary(viewer, estimateId)`. `directTotal` = Σ subtotales BOQ
server-side; montos por `aiu-calc.ts` (Decimal): A/I/U sobre directTotal, IVA sobre
utilidad, `grandTotal = directTotal + indirectTotal`. AIU **por versión**, NO global.
**Sin migración** (reutiliza `indirect_cost_rules`). Tipos client-safe en
`@/lib/estimates/aiu-types`.

## Exportación protegida del presupuesto (Oleada 4E.1) — ver `docs/BUDGET_EXPORT_CONTRACT.md`

`EstimatesWriteRepository.getEstimateExportPayload(viewer, estimateId)` ⇒
`EstimateExportPayload` (organización, proyecto/ciudad, alcance, presupuesto, versión
activa, capítulos+ítems ordenados, AIU humano y resumen financiero de 4D.2). RLS ⇒
cross-org/inexistente `EstimateNotFoundError`. **No lee el Excel original.**

Servicio `@/server/estimates/export`: `generateEstimateExcelExport(viewer, estimateId)`
(Excel `RESUMEN`/`PRESUPUESTO`/`TRAZABILIDAD`, ExcelJS) y `generateEstimatePdfExport(viewer,
estimateId)` (PDF sobrio sin UUID/source_row, @react-pdf/renderer) ⇒ `EstimateExportResult`
`{ buffer, fileName, contentType, sizeBytes, generatedAt }`, en memoria, filename sanitizado.

Endpoint: `GET /api/estimates/export?format=xlsx|pdf&estimateId&projectId&scopeId`
(`runtime=nodejs`, `force-dynamic`). Viewer requerido (sin sesión ⇒ 401); cadena
proyecto/alcance/presupuesto validada; cross-org ⇒ 404; 413 si excede tamaño; 500 interno.
**Sin migración**, **sin service-role**, **sin fallback** db→fixture. No recalcula finanzas
(reutiliza `calculateEstimateFinancialSummary`). Tipos client-safe en
`@/lib/estimates/export-types`.

## Escritura de presupuestos (Oleada 4B.3) — ver `docs/ESTIMATES_CRUD_CONTRACT.md`

`EstimatesWriteRepository` (`apps/web/server/estimates/`):
`insertEstimateWithInitialVersion(viewer, scopeId, input)`,
`listEstimatesByScope(viewer, scopeId)`, `listVisibleEstimates(viewer)`,
`getEstimateById(viewer, estimateId)`, `getEstimateActiveVersion(viewer, estimateId)`.
`CreateEstimateInput` permitido desde el navegador = `{ name, description? }`. La
creación usa la RPC **`public.create_estimate_with_initial_version(p_scope_id,
p_code, p_name, p_description)`** `SECURITY INVOKER` (sin `p_created_by`): inserta
estimate (`status='active'`) + versión **V01** (`draft`) atómicamente, derivando
`created_by` de `app._auth_uid()`. `code` autogenerado; `project_scope_id` validado
por visibilidad RLS (cross-org ⇒ `ScopeNotFoundError`). "Versión activa" = mayor
`version_number`. Migración aditiva `20260604130000` añadió `estimates.description`
+ `created_by`. Creación exige `supabase`+`db`; RLS-bound (sin service-role); RPC
ejecutable solo por `authenticated` (revocada de PUBLIC/anon). `/estimates` lista los
presupuestos visibles de la organización.
