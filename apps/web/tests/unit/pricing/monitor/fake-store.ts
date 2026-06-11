/**
 * fake-store.ts — Store en memoria del engine de monitoreo (tests Fase 4A).
 * Implementa MonitorSystemStore con semántica fiel (idempotencia por unique,
 * lock global, recovery) sin DB.
 */
import type {
  CreatePendingObservationInput,
  CreateRunInput,
  IsoDateTime,
  MonitorBaseline,
  MonitorRunCounters,
  MonitorRunStatus,
  MonitorSystemStore,
  MonitorTargetRecord,
  RecordResultInput,
  TargetCheckUpdate,
  Uuid,
} from '@/server/pricing/monitor/types';

export interface FakeRun {
  id: Uuid;
  organizationId: Uuid;
  triggerType: string;
  status: MonitorRunStatus;
  idempotencyKey: string;
  initiatedBy: Uuid | null;
  counters: MonitorRunCounters | null;
  errorSummary: string | null;
}

export interface FakeObservation extends CreatePendingObservationInput {
  id: Uuid;
  status: 'pending';
  sourceReference: string;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function makeTarget(over: Partial<MonitorTargetRecord> = {}): MonitorTargetRecord {
  return {
    id: nextId('target'),
    organizationId: 'org-a',
    resourceId: 'res-1',
    resourceUnit: 'm²',
    supplierId: null,
    sourceUrl: 'https://shop.example.com/p1',
    cadenceDays: 7,
    enabled: true,
    lastCheckedAt: null,
    nextCheckAt: '2026-06-10T00:00:00.000Z',
    lastSuccessAt: null,
    consecutiveFailures: 0,
    baselineObservationId: null,
    createdBy: 'user-admin-a',
    ...over,
  };
}

export class FakeMonitorStore implements MonitorSystemStore {
  targets: MonitorTargetRecord[] = [];
  runs: FakeRun[] = [];
  results: RecordResultInput[] = [];
  observations: FakeObservation[] = [];
  baselines = new Map<string, MonitorBaseline>();
  staleToRecover = 0;
  lockAvailable = true;
  lockHeld = false;

  async listDueTargets(nowIso: IsoDateTime, limit: number): Promise<MonitorTargetRecord[]> {
    return this.targets
      .filter((t) => t.enabled && t.nextCheckAt <= nowIso)
      .sort((a, b) => a.nextCheckAt.localeCompare(b.nextCheckAt))
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  async getTargetById(targetId: Uuid): Promise<MonitorTargetRecord | null> {
    const t = this.targets.find((x) => x.id === targetId);
    return t ? { ...t } : null;
  }

  async createRun(input: CreateRunInput): Promise<Uuid | null> {
    const dup = this.runs.some(
      (r) => r.organizationId === input.organizationId && r.idempotencyKey === input.idempotencyKey,
    );
    if (dup) return null;
    const run: FakeRun = {
      id: nextId('run'),
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      status: 'running',
      idempotencyKey: input.idempotencyKey,
      initiatedBy: input.initiatedBy,
      counters: null,
      errorSummary: null,
    };
    this.runs.push(run);
    return run.id;
  }

  async finishRun(
    runId: Uuid,
    status: MonitorRunStatus,
    counters: MonitorRunCounters,
    errorSummary: string | null,
  ): Promise<void> {
    const run = this.runs.find((r) => r.id === runId);
    if (run) {
      run.status = status;
      run.counters = counters;
      run.errorSummary = errorSummary;
    }
  }

  async recordResult(input: RecordResultInput): Promise<void> {
    this.results.push(input);
  }

  async updateTargetAfterCheck(targetId: Uuid, update: TargetCheckUpdate): Promise<void> {
    const t = this.targets.find((x) => x.id === targetId);
    if (!t) return;
    t.lastCheckedAt = update.lastCheckedAt;
    t.nextCheckAt = update.nextCheckAt;
    t.lastSuccessAt = update.lastSuccessAt;
    t.consecutiveFailures = update.consecutiveFailures;
    t.baselineObservationId = update.baselineObservationId;
  }

  async findBaseline(
    _organizationId: Uuid,
    resourceId: Uuid,
    _sourceUrl: string,
  ): Promise<MonitorBaseline | null> {
    return this.baselines.get(resourceId) ?? null;
  }

  async findIdenticalPending(
    organizationId: Uuid,
    resourceId: Uuid,
    sourceUrl: string,
    price: string,
    currency: string,
  ): Promise<Uuid | null> {
    const found = this.observations.find(
      (o) =>
        o.status === 'pending' &&
        o.target.organizationId === organizationId &&
        o.target.resourceId === resourceId &&
        o.sourceReference === sourceUrl &&
        Number(o.price) === Number(price) &&
        o.currency === currency,
    );
    return found?.id ?? null;
  }

  async createPendingObservation(input: CreatePendingObservationInput): Promise<Uuid> {
    const obs: FakeObservation = {
      ...input,
      id: nextId('obs'),
      status: 'pending',
      sourceReference: input.target.sourceUrl,
    };
    this.observations.push(obs);
    return obs.id;
  }

  async tryAcquireRunLock(): Promise<boolean> {
    if (!this.lockAvailable || this.lockHeld) return false;
    this.lockHeld = true;
    return true;
  }

  async releaseRunLock(): Promise<void> {
    this.lockHeld = false;
  }

  async recoverStaleRuns(_olderThanMinutes: number): Promise<number> {
    const n = this.staleToRecover;
    this.staleToRecover = 0;
    return n;
  }
}

/** HTML con JSON-LD Product (precio + moneda) — evidencia estructurada. */
export function productHtml(price: string, currency = 'COP', sku = '6751'): string {
  return `<!doctype html><html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Porcelanato Demo",
     "sku":"${sku}","offers":{"@type":"Offer","price":"${price}","priceCurrency":"${currency}"}}
  </script></head><body>demo</body></html>`;
}

/** DNS lookup falso: siempre IP pública (sin red). */
export const publicDns = async (_hostname: string): Promise<string[]> => ['93.184.216.34'];
