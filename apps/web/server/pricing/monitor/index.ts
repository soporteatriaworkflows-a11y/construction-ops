/**
 * index.ts — Fábricas y exports del monitor de precios (Fase 4A).
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { DbMonitorRepository } from './db-repository';
import { FixtureMonitorRepository } from './fixture-repository';
import { DbSystemMonitorStore, DbViewerMonitorStore } from './db-stores';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { MonitorRepository, MonitorSystemStore, MonitorEngineStore } from './types';

export type {
  MonitorRepository,
  MonitorSystemStore,
  MonitorEngineStore,
  MonitorTargetView,
  MonitorTargetRecord,
  MonitorResultView,
  MonitorRunResultDetailView,
  MonitorRunView,
  MonitoringSummary,
  MonitorResultStatus,
  MonitorRunStatus,
  MonitorTriggerType,
  MonitorCadence,
  CreateTargetInput,
  OrgRunSummary,
  ScheduledRunReport,
  TargetCheckOutcome,
} from './types';
export {
  MONITOR_CADENCES,
  MONITOR_BATCH_LIMIT,
  MONITOR_FAILURE_ALERT_THRESHOLD,
} from './types';
export { runScheduledMonitor, runManualMonitor, ManualRunThrottledError } from './service';
export { compareAgainstBaseline } from './compare';
export { checkTarget } from './check-target';
export {
  MonitorValidationError,
  validateCreateTargetInput,
  isValidCadence,
} from './validation';
export {
  MonitorTargetNotFoundError,
  MonitorTargetDuplicateError,
} from './db-repository';

/** Repositorio de UI según READ_MODEL_SOURCE (mismo patrón que Fase 3A). */
export function getMonitorRepository(): MonitorRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbMonitorRepository();
  return new FixtureMonitorRepository();
}

/** Store del sistema (cron). Solo camino administrativo controlado (§4.5). */
export function getSystemMonitorStore(): MonitorSystemStore {
  return new DbSystemMonitorStore();
}

/** Store RLS-bound del viewer (corrida manual). */
export function getViewerMonitorStore(viewer: AuthenticatedViewer): MonitorEngineStore {
  return new DbViewerMonitorStore(viewer);
}
