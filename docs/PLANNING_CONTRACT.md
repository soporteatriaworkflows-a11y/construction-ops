# PLANNING CONTRACT — Construction Ops

> **Contrato congelado v1 para Oleada 3B — cambios únicamente mediante
> `docs/INTEGRATION_REQUESTS.md`.**
>
> Propiedad: **agent-orchestrator** (congelado). Implementan: **agent-db-rls**
> (esquema/RLS/read-model) y **agent-planning** (dominio puro + Gantt/UI). Ningún
> agente edita este documento por su cuenta.

Define la **única fuente de verdad** para planificación de obra, avance físico,
dependencias, ruta crítica y vista Gantt. La UI **no** calcula ruta crítica,
holguras ni avance financiero (todo server-side / dominio puro). Dinero y
porcentajes viajan como `DecimalString`; fechas como `IsoDate`/`IsoDateTime`.

---

## 1. Entidades PostgreSQL (esquema nuevo — agent-db-rls)

Todas con `organization_id` + **RLS FORCE** (helper `app.current_org()`). UUID PK
`gen_random_uuid()`. Triggers `set_updated_at` donde haya `updated_at`.

### `schedule_tasks`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | RLS |
| project_id | uuid NOT NULL | FK projects ON DELETE CASCADE |
| project_scope_id | uuid NULL | FK project_scopes ON DELETE SET NULL |
| chapter_id | uuid NULL | FK chapters ON DELETE SET NULL (vínculo presupuesto↔cronograma) |
| parent_task_id | uuid NULL | FK schedule_tasks ON DELETE CASCADE (jerarquía/WBS) |
| wbs_code | text NOT NULL | código WBS (MS Project) |
| name | text NOT NULL | |
| description | text NULL | |
| planned_start | date NOT NULL | |
| planned_end | date NOT NULL | CHECK `planned_end >= planned_start` |
| planned_duration_days | numeric(12,4) NOT NULL | |
| progress_pct | numeric(7,4) NOT NULL DEFAULT 0 | CHECK `0 <= progress_pct <= 100` |
| status | text NOT NULL | CHECK enum (ver §1.5) |
| is_milestone | boolean NOT NULL DEFAULT false | hito ⇒ duración 0 |
| sort_order | integer NOT NULL | |
| external_reference | text NULL | 🔒 mapeo externo (MS Project / sistemas) |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Reglas: `is_milestone=true` ⇒ `planned_duration_days = 0` y `planned_start = planned_end` (CHECK). Hito permitido.

### `task_dependencies`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | RLS |
| project_id | uuid NOT NULL | FK projects ON DELETE CASCADE |
| predecessor_task_id | uuid NOT NULL | FK schedule_tasks ON DELETE CASCADE |
| successor_task_id | uuid NOT NULL | FK schedule_tasks ON DELETE CASCADE |
| dependency_type | text NOT NULL DEFAULT 'FS' | CHECK `IN ('FS','SS','FF','SF')` |
| lag_days | numeric(12,4) NOT NULL DEFAULT 0 | puede ser negativo (lead) |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Reglas: CHECK `predecessor_task_id <> successor_task_id` (no autodependencia);
UNIQUE `(predecessor_task_id, successor_task_id)` (sin duplicados). Los ciclos se
detectan en el dominio (no por constraint). Índices: `(project_id)`,
`(predecessor_task_id)`, `(successor_task_id)`.

### `progress_entries`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | RLS |
| project_id | uuid NOT NULL | FK projects ON DELETE CASCADE |
| task_id | uuid NOT NULL | FK schedule_tasks ON DELETE CASCADE |
| recorded_at | timestamptz NOT NULL | |
| physical_progress_pct | numeric(7,4) NOT NULL | CHECK `0..100` |
| financial_progress_pct | numeric(7,4) NULL | 🔒 derivado server-side desde BOQ/capítulos |
| notes | text NULL | 🔒 |
| created_by | uuid NULL | FK profiles ON DELETE SET NULL (🔒 responsable) |
| created_at | timestamptz NOT NULL DEFAULT now() | |

`progress_entries` es **append-only** (histórico de avance; sin UPDATE/DELETE por
política RLS, igual que `price_observations`). Índice `(task_id, recorded_at DESC)`.

### `resource_assignments`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | RLS |
| project_id | uuid NOT NULL | FK projects ON DELETE CASCADE |
| task_id | uuid NOT NULL | FK schedule_tasks ON DELETE CASCADE |
| resource_id | uuid NULL | FK resources ON DELETE SET NULL |
| labor_role_id | uuid NULL | FK labor_roles ON DELETE SET NULL |
| quantity | numeric(20,10) NULL | |
| unit | text NULL | |
| notes | text NULL | 🔒 |
| created_at | timestamptz NOT NULL DEFAULT now() | |

### 1.5 Enums
- `schedule_tasks.status IN ('not_started','in_progress','completed','blocked','cancelled')`.
- `task_dependencies.dependency_type IN ('FS','SS','FF','SF')`.

### 1.6 Reglas generales
- Todas las tablas con `organization_id`; **RLS obligatoria**; índices por
  proyecto/organización/fechas/dependencias.
- No autodependencia; sin duplicados predecesora→sucesora; progreso 0..100;
  fechas coherentes.
- Hitos `is_milestone=true` con duración 0.
- **No** recalcular presupuesto emitido (las versiones emitidas siguen inmutables).
- El **avance financiero** se deriva **server-side** desde BOQ/capítulos cuando
  aplique; **nunca** con `float` ni en React.

---

## 2. Dominio server-side — `apps/web/modules/planning/`

Módulo PURO (sin DB, sin React). Incluye tipos, validaciones, construcción de la
red, dependencias, ruta crítica, holguras, progreso y serialización.

Tipos mínimos:
```ts
export interface PlanningTask {
  id: Uuid; projectId: Uuid; projectScopeId?: Uuid | null; chapterId?: Uuid | null;
  parentTaskId?: Uuid | null; wbsCode: string; name: string; description?: string | null;
  plannedStart: IsoDate; plannedEnd: IsoDate; plannedDurationDays: DecimalString;
  progressPct: DecimalString; status: ScheduleTaskStatus; isMilestone: boolean;
  sortOrder: number; externalReference?: string | null; // 🔒
}
export interface TaskDependency {
  id: Uuid; predecessorTaskId: Uuid; successorTaskId: Uuid;
  dependencyType: DependencyType; lagDays: DecimalString;
}
export interface ProgressEntry {
  id: Uuid; taskId: Uuid; recordedAt: IsoDateTime; physicalProgressPct: DecimalString;
  financialProgressPct?: DecimalString | null; // 🔒
  notes?: string | null; createdBy?: Uuid | null; // 🔒
}
export interface ResourceAssignment {
  id: Uuid; taskId: Uuid; resourceId?: Uuid | null; laborRoleId?: Uuid | null;
  quantity?: DecimalString | null; unit?: string | null; notes?: string | null; // 🔒
}
export interface CriticalPathResult {
  criticalTaskIds: Uuid[];
  taskFloat: { taskId: Uuid; totalFloatDays: DecimalString; freeFloatDays: DecimalString; isCritical: boolean }[];
  projectStart: IsoDate; projectEnd: IsoDate; durationDays: DecimalString;
}
export interface ScheduleSummary {
  projectId: Uuid; tasks: PlanningTask[]; dependencies: TaskDependency[];
  criticalPath: CriticalPathResult; physicalProgressPct: DecimalString;
}
export class PlanningError extends Error { /* kind: 'cycle' | 'invalid_dependency' | 'invalid_dates' | ... */ }
```

Reglas: **ruta crítica y holguras server-side** (orden topológico + forward/backward
pass, CPM); **detección de ciclos** (error de dominio explícito); fechas ISO 8601;
porcentajes/duraciones como `DecimalString` (`Decimal.js`, sin float). React solo
renderiza DTOs.

---

## 3. Read-model de planning — extensión de `apps/web/lib/contracts/read-model.ts`

Tipos nuevos (DTOs cliente-safe / role-gated):
```ts
export interface ScheduleTaskView {
  id: Uuid; wbsCode: string; name: string; parentTaskId?: Uuid | null;
  plannedStart: IsoDate; plannedEnd: IsoDate; plannedDurationDays: DecimalString;
  progressPct: DecimalString; status: ScheduleTaskStatus; isMilestone: boolean; sortOrder: number;
  // 🔒 (omitidos para client): totalFloatDays?, freeFloatDays?, isCritical?, financialProgressPct?
}
export interface DependencyView { predecessorTaskId: Uuid; successorTaskId: Uuid; dependencyType: DependencyType; lagDays: DecimalString; }
export interface MilestoneView { id: Uuid; name: string; date: IsoDate; status: ScheduleTaskStatus; }
export interface ProgressEntryView { id: Uuid; taskId: Uuid; recordedAt: IsoDateTime; physicalProgressPct: DecimalString; /* 🔒 financialProgressPct?, notes? */ }
export interface ResourceAssignmentView { id: Uuid; taskId: Uuid; resourceName?: string | null; laborRoleName?: string | null; quantity?: DecimalString | null; unit?: string | null; } // 🔒 internos
export interface ScheduleSummary { projectId: Uuid; tasks: ScheduleTaskView[]; dependencies: DependencyView[]; milestones: MilestoneView[]; physicalProgressPct: DecimalString; criticalPath?: CriticalPathSummary; }
export interface CriticalPathSummary { criticalTaskIds: Uuid[]; projectStart: IsoDate; projectEnd: IsoDate; durationDays: DecimalString; } // 🔒 management/internal
```

Extensión de `ReadModelPort`:
```ts
getSchedule(viewer: ViewerContext, projectId: Uuid): Promise<ScheduleSummary>;
listProgressEntries(viewer: ViewerContext, projectId: Uuid, taskId?: Uuid): Promise<ProgressEntryView[]>;
listResourceAssignments(viewer: ViewerContext, projectId: Uuid, taskId?: Uuid): Promise<ResourceAssignmentView[]>;
```

Dos implementaciones (igual que 3A): **fixture sanitizado** (preview local) y
**Drizzle** (DB local con RLS). Selector `READ_MODEL_SOURCE=fixture|db`, **sin
fallback silencioso**. El `ScheduleSummary` del read-model se arma usando el
dominio `modules/planning` (ruta crítica/holguras) server-side.

---

## 4. Privacidad por rol (backend-first)

| Cliente-safe (✅) | Interno (🔒 — nunca a rol `client`) |
|---|---|
| nombre de tarea autorizado, fechas plan autorizadas, % avance autorizado, hitos autorizados, estado, secuencia general | costos, holguras (float), ruta crítica, alertas internas, notas privadas, recursos internos, mano de obra detallada, responsables internos (`createdBy`), `external_reference`, avance financiero, relaciones privadas con proveedores |

La **proyección por rol** ocurre server-side antes de serializar (los campos 🔒 se
omiten para `client`; `criticalPath`/holguras/financiero solo para
`management`/`internal`/`site` según corresponda).

---

## 5. Compatibilidad futura con MS Project

Campos reservados y mapeo conceptual (export **NO** se implementa en 3B; es de
Oleada 3C/exports o posterior):
- `wbs_code` → WBS; `name` → Name; `planned_start` → Start; `planned_end` → Finish;
  `planned_duration_days` → Duration; `progress_pct` → % Complete;
  `dependency_type` → Predecessor Type (FS/SS/FF/SF); `lag_days` → Lag;
  `external_reference` → External ID / GUID.
- Documentado para un export intercambiable futuro (MS Project XML / MPP via
  herramienta dedicada). **No** implementar ahora.

---

## 6. Frontera (quién hace qué)

| Responsabilidad | Dueño |
|---|---|
| Migraciones/schema Drizzle/RLS/índices/seeds de planning; `DrizzleReadModelRepository` + `FixtureReadModelRepository` de planning; tests RLS runtime | agent-db-rls |
| Dominio puro `modules/planning` (CPM, holguras, ciclos, progreso); página `/planning`; componente Gantt (frappe-gantt); fixture UI; tests | agent-planning |
| Congelar/cambiar este contrato | agent-orchestrator (vía INTEGRATION_REQUESTS) |

Reglas: cero cálculo monetario/CPM en React; `READ_MODEL_SOURCE` reutilizado; RLS
runtime obligatorio si se toca esquema; sin datos privados/Excel real.

---

_Congelado el 2026-05-31 (Oleada 3B). Referencias: tipos base/privacidad en
`docs/API_CONTRACTS.md`; read-model en `docs/READ_MODEL_CONTRACT.md`; entidades en
`docs/DATABASE_SCHEMA.md`._
