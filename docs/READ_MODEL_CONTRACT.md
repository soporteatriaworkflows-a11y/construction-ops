# READ MODEL CONTRACT — Construction Ops

> **Contrato congelado v1 para Oleada 3A — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad: **agent-orchestrator** (congelado). Implementa: **agent-db-rls**.
> Consume: **agent-frontend-boq** y **agent-dashboard** (solo DTOs). Ningún
> agente edita este documento por su cuenta.

Define la **única capa server-side** que alimenta las pantallas con datos
funcionales del presupuesto, **sin duplicar cálculos financieros** y **sin
exponer campos internos** (privacidad backend-first). La UI consume DTOs; nunca
consulta tablas ni recalcula finanzas.

---

## 1. Ubicación canónica

**Implementación server-side** (ownership de `agent-db-rls`):
- `apps/web/server/read-model/` — port, tipos, errores, repositorios, selector.
- `apps/web/server/repositories/` — acceso a datos Drizzle (read-only por RLS).

**Contrato compartido de DTOs** (fuente única de código):
- `apps/web/lib/contracts/read-model.ts`

**Reglas:**
- La UI consume **DTOs** desde el read-model; **nunca** consulta tablas directamente.
- La UI **no** calcula APU, BOQ, AIU, IVA, descuentos ni ahorros.
- Los cálculos financieros se ejecutan **server-side** vía cost-domain
  (`@/modules/apu`, `@/modules/boq`, `@/modules/estimates`).
- Pricing se consume vía `PricingReadPort` (server-side).
- Los campos internos (🔒) se **omiten antes de serializar** respuestas
  cliente-safe. No basta ocultarlos en UI.

---

## 2. Fuentes del read-model

Dos implementaciones **explícitas** del `ReadModelPort`:

### A. `FixtureReadModelRepository`
- Usa **únicamente** el fixture sanitizado del golden master
  (`scripts/fixtures/entre-patios-first-floor.fixture.json`).
- Permite **preview local inmediato** sin DB.
- **NO** usa Excel privado ni datos reales.
- Debe marcarse claramente como **modo demo/dev**.

### B. `DrizzleReadModelRepository`
- Usa las tablas existentes vía Drizzle (`apps/web/lib/db`).
- Preparado para Supabase/Postgres **local**; respeta **RLS**.
- **NO** conecta una base remota.
- **NO** se activa silenciosamente si falta configuración.

### Selector explícito de origen
Variable de entorno **`READ_MODEL_SOURCE`** = `fixture` | `db`:
- Preview local recomendado: `fixture`.
- Integración DB local: `db`.
- Se añade **solo** la variable documentada a `.env.example` (sin valores reales).
- **Sin fallback silencioso** de `db` → `fixture`: si `db` está seleccionado y
  falta configuración, **error explícito**.
- El modo activo se **registra/loguea** claramente al iniciar.

---

## 3. Contexto de visualización y privacidad

```ts
export type ViewerRole = 'client' | 'management' | 'site' | 'internal';

export interface ViewerContext {
  organizationId: Uuid;
  profileId?: Uuid;
  role: ViewerRole;
}
```

**Reglas:**
- `ViewerContext` se resuelve **server-side**.
- En preview local puede existir un **contexto demo explícito** (NO es
  autenticación productiva).
- **No** confiar en un query param del navegador como control de seguridad.
- En modo `db`, **RLS** sigue siendo la barrera real (filtra por organización).

**Clasificación de campos:**

| CLIENTE-SAFE (✅) | INTERNOS (🔒 — nunca a rol `client`) |
|---|---|
| proyecto autorizado, capítulos, actividad, unidad, cantidad, precio presupuestado, subtotal, AIU visible, total, avance autorizado | precio público observado, variación preventiva, descuento negociado, precio esperado de compra, precio real, ahorro proyectado, ahorro realizado, margen, proveedor interno, `sourceReference`, SKU, URL, candidatos y score, aprobador, observaciones privadas |

El read-model aplica la **proyección por rol** antes de serializar. Los campos
internos solo se incluyen para roles autorizados (`management`/`internal` según
el campo).

---

## 4. DTOs canónicos

Todos los IDs son `Uuid` (string); fechas `IsoDateTime`/`IsoDate`; **dinero
`DecimalString`** (sin float; la UI solo formatea para mostrar).

```ts
export interface ProjectListItem {
  id: Uuid;
  name: string;
  status: ProjectStatus;
  location?: string | null;
  createdAt: IsoDateTime;
  scopeCount: number;
  estimateCount: number;
}

export interface ProjectOverview {
  project: ProjectListItem;
  scopes: { id: Uuid; code: string; name: string; scopeType: ScopeType }[];
  currentEstimateVersion?: EstimateSummary;
  budgetSummary: EstimateSummary;          // totales del presupuesto vigente
  progressSummary?: ProgressSummary;       // opcional (Oleada 3B); puede omitirse en 3A
}

export interface EstimateSummary {
  estimateId: Uuid;
  versionId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  directCost: DecimalString;
  administration: DecimalString;
  contingency: DecimalString;       // imprevistos
  utility: DecimalString;
  taxOnUtility: DecimalString;       // IVA sobre utilidad
  grandTotal: DecimalString;
  totalArea?: DecimalString;
  costPerSquareMeter?: DecimalString;
}

export interface ChapterSummary {
  id: Uuid;
  code: string;
  name: string;
  subtotal: DecimalString;
  itemCount: number;
}

export interface BoqItemView {
  id: Uuid;
  chapterId: Uuid;
  code: string;
  description: string;       // descriptionSnapshot
  unit: string;              // unitSnapshot
  quantity: DecimalString;   // quantitySnapshot
  unitPrice: DecimalString;  // unitPriceSnapshot (precio presupuestado, ✅)
  subtotal: DecimalString;
}

export interface ApuSummary {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
}

export interface QuantityLineView {
  id: Uuid;
  description: string;
  calculatedQuantity: DecimalString;
}
export interface QuantityGroupView {
  id: Uuid;
  name: string;
  lines: QuantityLineView[];
}

export interface CatalogResourceView {
  id: Uuid;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  budgetReferencePrice?: DecimalString; // ✅ precio presupuestado (no público)
}

export interface ChapterDistributionSlice {
  chapterId: Uuid;
  code: string;
  name: string;
  subtotal: DecimalString;
  share: DecimalString;   // fracción del costo directo (DecimalString)
}

export interface DashboardSummary {
  projectId: Uuid;
  budget: DecimalString;            // grandTotal
  directCost: DecimalString;
  indirectCost: DecimalString;
  chapterDistribution: ChapterDistributionSlice[];
  topChapters: ChapterSummary[];
  estimateStatus: EstimateVersionStatus;
  lastUpdatedAt: IsoDateTime;
  // 🔒 solo para roles autorizados (omitidos para `client`):
  projectedSaving?: DecimalString;
  realizedSaving?: DecimalString;
  pricingCoverage?: DecimalString;  // fracción de ítems con precio aprobado
}

// Opcional (placeholder 3A; se detalla en Oleada 3B):
export interface ProgressSummary {
  physicalProgress?: DecimalString;
  financialProgress?: DecimalString;
}
```

---

## 5. Funciones canónicas — `ReadModelPort`

```ts
export interface ReadModelPort {
  listProjects(viewer: ViewerContext): Promise<ProjectListItem[]>;
  getProjectOverview(viewer: ViewerContext, projectId: Uuid): Promise<ProjectOverview>;
  listEstimates(viewer: ViewerContext, projectId?: Uuid): Promise<EstimateSummary[]>;
  getEstimateDetail(
    viewer: ViewerContext,
    estimateVersionId: Uuid,
  ): Promise<{ estimate: EstimateSummary; chapters: ChapterSummary[]; items: BoqItemView[] }>;
  listApus(viewer: ViewerContext): Promise<ApuSummary[]>;
  listQuantities(viewer: ViewerContext, projectScopeId?: Uuid): Promise<QuantityGroupView[]>;
  listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]>;
  getDashboardSummary(viewer: ViewerContext, projectId: Uuid): Promise<DashboardSummary>;
}
```

**Errores de dominio explícitos** (en `apps/web/server/read-model/errors.ts`):
- `ProjectNotFoundError`, `EstimateVersionNotFoundError`,
  `ReadModelSourceNotConfiguredError` (cuando `READ_MODEL_SOURCE=db` sin config).

**Reglas:**
- IDs UUID string; fechas ISO 8601; dinero `DecimalString`.
- **Proyección por rol** antes de serializar (campos 🔒 omitidos para `client`).
- **No** devolver registros de otra organización (RLS en `db`; filtrado explícito
  en `fixture`).
- **No** devolver campos internos a `client`.
- Los totales financieros provienen de **cost-domain** (server-side); el
  read-model **no** reimplementa fórmulas.

---

## 6. Frontera (quién hace qué)

| Responsabilidad | Dueño |
|---|---|
| `read-model.ts` (DTOs), `server/read-model/*`, `server/repositories/*`, seed funcional, proyección por rol, `READ_MODEL_SOURCE` | agent-db-rls |
| Cablear `/projects`,`/estimates`,`/apu`,`/quantities`,`/catalog` a los DTOs | agent-frontend-boq |
| `/dashboard` + `modules/dashboard` (KPIs, Recharts) consumiendo `getDashboardSummary` | agent-dashboard |
| Congelar/cambiar este contrato | agent-orchestrator (vía INTEGRATION_REQUESTS) |

La UI **no** importa mocks ni calcula finanzas. cost-domain y pricing se
consumen **solo** server-side dentro del read-model.

---

---

## 7. Nota de integración 3A (2026-05-31)

- Implementación canónica única: `apps/web/lib/contracts/read-model.ts` (DTOs +
  `ReadModelPort`) + `apps/web/server/read-model/` (Fixture/Drizzle + `getReadModel()`).
- **Viewer demo**: se añadió `getDemoViewer(role='management')` y
  `DEMO_ORGANIZATION_ID` en `apps/web/server/read-model/viewer.ts`. Es un
  **contexto demo/dev** (no autenticación productiva) para el preview con
  `READ_MODEL_SOURCE=fixture`; en modo `db` el viewer provendrá de la sesión y
  RLS es la barrera real. La org demo coincide con la del fixture sanitizado.
- Las páginas (Server Components) obtienen datos con
  `getReadModel().<método>(viewer, …)`; los componentes cliente reciben DTOs
  serializables por props; ningún componente recalcula finanzas.
- Verificado por dev smoke: 8/8 rutas HTTP 200 con datos reales del golden master.

---

_Congelado el 2026-05-31 (Oleada 3A). Referencias: tipos base y privacidad en
`docs/API_CONTRACTS.md`; precios en `docs/PRICING_READ_CONTRACT.md`; entidades en
`docs/DATABASE_SCHEMA.md`._
