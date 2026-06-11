/**
 * fixture-repository.ts — Repositorio demo/fixture del monitor (Fase 4A).
 * Propiedad: agent-pricing.
 * READ_MODEL_SOURCE=fixture ⇒ lectura demo; TODA mutación está deshabilitada
 * (PriceIntelligenceWriteNotSupportedError), igual que Fase 3A.
 */
import { PriceIntelligenceWriteNotSupportedError } from '../errors';
import type {
  AuthenticatedViewer,
  CreateTargetInput,
  MonitorRepository,
  MonitorResultView,
  MonitorRunView,
  MonitorTargetView,
  MonitoringSummary,
  Uuid,
} from './types';

const DEMO_RESOURCE_1 = '00000000-0000-0000-0000-0000000000e1';

const DEMO_TARGETS: MonitorTargetView[] = [
  {
    id: '00000000-0000-0000-0000-000000002001',
    resourceId: DEMO_RESOURCE_1,
    resourceCode: 'MAT-001',
    resourceName: 'Cemento gris 50kg',
    resourceUnit: 'saco',
    supplierId: '00000000-0000-0000-0000-000000000101',
    supplierName: 'Homecenter Demo',
    sourceUrl: 'https://www.homecenter.com.co/producto-demo',
    cadenceDays: 7,
    enabled: true,
    lastCheckedAt: '2026-06-09T11:00:00.000Z',
    nextCheckAt: '2026-06-16T11:00:00.000Z',
    lastSuccessAt: '2026-06-09T11:00:00.000Z',
    consecutiveFailures: 0,
    isOverdue: false,
    hasFailureAlert: false,
    createdAt: '2026-06-01T00:00:00.000Z',
  },
];

const DEMO_RESULTS: MonitorResultView[] = [
  {
    id: '00000000-0000-0000-0000-000000002101',
    targetId: '00000000-0000-0000-0000-000000002001',
    runId: '00000000-0000-0000-0000-000000002201',
    status: 'unchanged',
    detectedPrice: '28000',
    currency: 'COP',
    unit: 'saco',
    warnings: [],
    observationId: null,
    checkedAt: '2026-06-09T11:00:00.000Z',
  },
];

const DEMO_RUNS: MonitorRunView[] = [
  {
    id: '00000000-0000-0000-0000-000000002201',
    triggerType: 'scheduled',
    status: 'completed',
    startedAt: '2026-06-09T11:00:00.000Z',
    finishedAt: '2026-06-09T11:00:05.000Z',
    counters: { checked: 1, unchanged: 1, changed: 0, pendingCreated: 0, failed: 0 },
    errorSummary: null,
  },
];

export class FixtureMonitorRepository implements MonitorRepository {
  readonly source = 'fixture' as const;

  async listTargetsForResource(_viewer: AuthenticatedViewer, resourceId: Uuid): Promise<MonitorTargetView[]> {
    return DEMO_TARGETS.filter((t) => t.resourceId === resourceId);
  }

  async listTargets(_viewer: AuthenticatedViewer): Promise<MonitorTargetView[]> {
    return [...DEMO_TARGETS];
  }

  async createTarget(_viewer: AuthenticatedViewer, _input: CreateTargetInput): Promise<MonitorTargetView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async setTargetEnabled(): Promise<MonitorTargetView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async updateTargetCadence(): Promise<MonitorTargetView> {
    throw new PriceIntelligenceWriteNotSupportedError();
  }

  async listRecentResults(_viewer: AuthenticatedViewer, targetId: Uuid, limit: number): Promise<MonitorResultView[]> {
    return DEMO_RESULTS.filter((r) => r.targetId === targetId).slice(0, limit);
  }

  async listRecentRuns(_viewer: AuthenticatedViewer, limit: number): Promise<MonitorRunView[]> {
    return DEMO_RUNS.slice(0, limit);
  }

  async getMonitoringSummary(): Promise<MonitoringSummary> {
    return {
      monitoredCount: DEMO_TARGETS.length,
      activeCount: DEMO_TARGETS.filter((t) => t.enabled).length,
      pausedCount: DEMO_TARGETS.filter((t) => !t.enabled).length,
      overdueCount: 0,
      erroredCount: 0,
      pendingChangesCount: 0,
      lastRunAt: DEMO_RUNS[0]?.startedAt ?? null,
    };
  }
}
