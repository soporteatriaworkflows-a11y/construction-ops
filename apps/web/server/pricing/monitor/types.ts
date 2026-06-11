/**
 * types.ts — Tipos del agente automático de monitoreo de precios (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md.
 *
 * Reglas:
 *  - Agente del SISTEMA, no conversacional. Nunca aprueba; nunca toca
 *    BOQ/AIU/exports/snapshots.
 *  - Dinero como DecimalString. organizationId/userId server-side.
 */
import type { Uuid, IsoDateTime, DecimalString } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';

export type { Uuid, IsoDateTime, DecimalString, AuthenticatedViewer };

export type MonitorTriggerType = 'scheduled' | 'manual';
export type MonitorRunStatus = 'running' | 'completed' | 'partial' | 'failed';
export type MonitorResultStatus =
  | 'unchanged'
  | 'changed'
  | 'pending_created'
  | 'unreachable'
  | 'blocked'
  | 'parse_failed'
  | 'invalid_response';

/** Cadencias válidas (días) — espejo del CHECK pmt_cadence_valid. */
export const MONITOR_CADENCES = [1, 7, 15, 30] as const;
export type MonitorCadence = (typeof MONITOR_CADENCES)[number];

/** Máximo de targets procesados por ejecución (mandato V1). */
export const MONITOR_BATCH_LIMIT = 25;

/** Una run `running` más vieja que esto se considera huérfana (recovery). */
export const MONITOR_STALE_RUN_MINUTES = 30;

/** Ventana del rate limit de corridas manuales org-wide (segundos). */
export const MONITOR_MANUAL_WINDOW_SECONDS = 300;

/** Ventana del rate limit de «Revisar ahora» por target (segundos). */
export const MONITOR_MANUAL_TARGET_WINDOW_SECONDS = 60;

/** Umbral de fallos consecutivos que dispara alerta visible. */
export const MONITOR_FAILURE_ALERT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Registros (engine / stores)
// ---------------------------------------------------------------------------

/** Target tal como lo consume el engine (incluye contexto del recurso). */
export interface MonitorTargetRecord {
  id: Uuid;
  organizationId: Uuid;
  resourceId: Uuid;
  resourceUnit: string;
  supplierId: Uuid | null;
  sourceUrl: string;
  cadenceDays: number;
  enabled: boolean;
  lastCheckedAt: IsoDateTime | null;
  nextCheckAt: IsoDateTime;
  lastSuccessAt: IsoDateTime | null;
  consecutiveFailures: number;
  baselineObservationId: Uuid | null;
  createdBy: Uuid;
}

/** Baseline aprobada contra la que se compara. */
export interface MonitorBaseline {
  observationId: Uuid;
  /** 🔒 precio aprobado */
  price: DecimalString;
  currency: string;
  unit: string;
  sourceReference: string | null;
}

/** Datos detectados en la fuente (tras extracción + normalización). */
export interface DetectedPrice {
  price: DecimalString;
  currency: string;
  /** Unidad RAW detectada; null si la fuente no la expone (no inventar). */
  unitRaw: string | null;
  title: string | null;
  externalSku: string | null;
  externalReference: string | null;
  extractionMethod: string;
  confidence: string;
  warnings: string[];
}

/** Resultado de chequear un target. */
export interface TargetCheckOutcome {
  targetId: Uuid;
  status: MonitorResultStatus;
  detectedPrice: DecimalString | null;
  currency: string | null;
  unitRaw: string | null;
  warnings: string[];
  observationId: Uuid | null;
  baselineObservationId: Uuid | null;
}

export interface MonitorRunCounters {
  checked: number;
  unchanged: number;
  changed: number;
  pendingCreated: number;
  failed: number;
}

/** Resumen de la corrida de una organización. */
export interface OrgRunSummary {
  organizationId: Uuid;
  runId: Uuid | null;
  /** `duplicate_window` = idempotencia (ya corrió en esta ventana). */
  skipped: 'duplicate_window' | null;
  status: MonitorRunStatus;
  counters: MonitorRunCounters;
  outcomes: TargetCheckOutcome[];
}

/** Reporte de la corrida programada global (todas las orgs con vencidas). */
export interface ScheduledRunReport {
  /** `already_running` = lock global no adquirido (corrida solapada). */
  skipped: 'already_running' | null;
  recoveredStaleRuns: number;
  dueTargets: number;
  organizations: OrgRunSummary[];
}

// ---------------------------------------------------------------------------
// Puerto del engine (implementado por system store y viewer store)
// ---------------------------------------------------------------------------

export interface CreateRunInput {
  organizationId: Uuid;
  triggerType: MonitorTriggerType;
  idempotencyKey: string;
  initiatedBy: Uuid | null;
}

export interface RecordResultInput {
  organizationId: Uuid;
  runId: Uuid;
  targetId: Uuid;
  status: MonitorResultStatus;
  detectedPrice: DecimalString | null;
  currency: string | null;
  unitRaw: string | null;
  warnings: string[];
  observationId: Uuid | null;
  checkedAt: IsoDateTime;
}

export interface TargetCheckUpdate {
  lastCheckedAt: IsoDateTime;
  nextCheckAt: IsoDateTime;
  lastSuccessAt: IsoDateTime | null;
  consecutiveFailures: number;
  baselineObservationId: Uuid | null;
}

export interface CreatePendingObservationInput {
  target: MonitorTargetRecord;
  price: DecimalString;
  currency: string;
  /** Unidad a persistir (raw detectada, o la del baseline/recurso si la fuente no expone). */
  unit: string;
  notes: string;
  observedAt: IsoDateTime;
}

/**
 * Puerto de persistencia del monitor. Dos implementaciones:
 *  - system store (cron): lectura global administrativa + observaciones
 *    SIEMPRE RLS-bound como el usuario que habilitó el target (contrato §4.5).
 *  - viewer store (corrida manual): 100% RLS-bound con el viewer real.
 */
export interface MonitorEngineStore {
  /** Targets vencidos (enabled ∧ next_check_at <= now), orden next_check_at ASC. */
  listDueTargets(nowIso: IsoDateTime, limit: number): Promise<MonitorTargetRecord[]>;
  /** Target por id (para «Revisar ahora», ignora next_check_at). `null` si no existe/visible. */
  getTargetById(targetId: Uuid): Promise<MonitorTargetRecord | null>;
  /** Crea la run; `null` si la idempotency_key ya existe en la org (ventana ya corrida). */
  createRun(input: CreateRunInput): Promise<Uuid | null>;
  finishRun(
    runId: Uuid,
    status: MonitorRunStatus,
    counters: MonitorRunCounters,
    errorSummary: string | null,
  ): Promise<void>;
  recordResult(input: RecordResultInput): Promise<void>;
  updateTargetAfterCheck(targetId: Uuid, update: TargetCheckUpdate): Promise<void>;
  /** Baseline approved más reciente (prefiere misma fuente). */
  findBaseline(
    organizationId: Uuid,
    resourceId: Uuid,
    sourceUrl: string,
  ): Promise<MonitorBaseline | null>;
  /** Pending idéntica existente (misma fuente + precio + moneda) — dedup. */
  findIdenticalPending(
    organizationId: Uuid,
    resourceId: Uuid,
    sourceUrl: string,
    price: DecimalString,
    currency: string,
  ): Promise<Uuid | null>;
  /** Crea observación `pending` (NUNCA approved). */
  createPendingObservation(input: CreatePendingObservationInput): Promise<Uuid>;
}

/** Operaciones exclusivas del camino programado (lock global + recovery). */
export interface MonitorSystemStore extends MonitorEngineStore {
  tryAcquireRunLock(): Promise<boolean>;
  releaseRunLock(): Promise<void>;
  recoverStaleRuns(olderThanMinutes: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Vistas y puerto de UI (repositorio por viewer)
// ---------------------------------------------------------------------------

export interface MonitorTargetView {
  id: Uuid;
  resourceId: Uuid;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  supplierId: Uuid | null;
  supplierName: string | null;
  sourceUrl: string;
  cadenceDays: number;
  enabled: boolean;
  lastCheckedAt: IsoDateTime | null;
  nextCheckAt: IsoDateTime;
  lastSuccessAt: IsoDateTime | null;
  consecutiveFailures: number;
  /** runtime: true si enabled y next_check_at <= now. */
  isOverdue: boolean;
  /** runtime: true si consecutive_failures >= umbral de alerta. */
  hasFailureAlert: boolean;
  createdAt: IsoDateTime;
}

export interface MonitorResultView {
  id: Uuid;
  targetId: Uuid;
  runId: Uuid;
  status: MonitorResultStatus;
  detectedPrice: DecimalString | null;
  currency: string | null;
  unit: string | null;
  warnings: string[];
  observationId: Uuid | null;
  checkedAt: IsoDateTime;
}

export interface MonitorRunView {
  id: Uuid;
  triggerType: MonitorTriggerType;
  status: MonitorRunStatus;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  counters: Partial<MonitorRunCounters>;
  errorSummary: string | null;
}

/** KPIs del centro de monitoreo y dashboard. */
export interface MonitoringSummary {
  monitoredCount: number;
  activeCount: number;
  pausedCount: number;
  overdueCount: number;
  erroredCount: number;
  /** Observaciones pending creadas por el monitor aún sin revisar. */
  pendingChangesCount: number;
  lastRunAt: IsoDateTime | null;
}

export interface CreateTargetInput {
  resourceId: Uuid;
  supplierId?: Uuid | null;
  sourceUrl: string;
  cadenceDays: number;
}

export interface MonitorRepository {
  readonly source: 'db' | 'fixture';
  listTargetsForResource(viewer: AuthenticatedViewer, resourceId: Uuid): Promise<MonitorTargetView[]>;
  listTargets(viewer: AuthenticatedViewer): Promise<MonitorTargetView[]>;
  createTarget(viewer: AuthenticatedViewer, input: CreateTargetInput): Promise<MonitorTargetView>;
  setTargetEnabled(viewer: AuthenticatedViewer, targetId: Uuid, enabled: boolean): Promise<MonitorTargetView>;
  updateTargetCadence(viewer: AuthenticatedViewer, targetId: Uuid, cadenceDays: number): Promise<MonitorTargetView>;
  listRecentResults(viewer: AuthenticatedViewer, targetId: Uuid, limit: number): Promise<MonitorResultView[]>;
  listRecentRuns(viewer: AuthenticatedViewer, limit: number): Promise<MonitorRunView[]>;
  getMonitoringSummary(viewer: AuthenticatedViewer): Promise<MonitoringSummary>;
}
