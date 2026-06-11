/**
 * service.ts — Engine del monitor automático de precios (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §3, §5.
 *
 * Orquesta la corrida programada (global, con lock + recovery) y la corrida
 * manual (org-scoped, RLS-bound, con rate limit por ventana de idempotencia).
 * Toda la IO entra por puertos inyectables ⇒ tests deterministas sin red/DB.
 */
import { checkTarget } from './check-target';
import type { DnsLookup, PageFetcher } from '../validation/types';
import {
  MONITOR_BATCH_LIMIT,
  MONITOR_MANUAL_TARGET_WINDOW_SECONDS,
  MONITOR_MANUAL_WINDOW_SECONDS,
  MONITOR_STALE_RUN_MINUTES,
} from './types';
import type {
  IsoDateTime,
  MonitorEngineStore,
  MonitorRunCounters,
  MonitorSystemStore,
  MonitorTargetRecord,
  MonitorTriggerType,
  OrgRunSummary,
  ScheduledRunReport,
  TargetCheckOutcome,
  Uuid,
} from './types';

export interface MonitorEngineDeps {
  fetcher?: PageFetcher;
  dnsLookup?: DnsLookup;
  now?: () => Date;
  /** Tope de targets por ejecución (default 25; solo tests lo reducen). */
  maxTargets?: number;
}

const FAILURE_STATUSES = new Set(['unreachable', 'blocked', 'parse_failed', 'invalid_response']);

function emptyCounters(): MonitorRunCounters {
  return { checked: 0, unchanged: 0, changed: 0, pendingCreated: 0, failed: 0 };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Ordena los targets intercalando dominios (round-robin por hostname):
 * concurrencia efectiva por dominio = 1 y dos fetches al mismo dominio
 * nunca son consecutivos cuando hay más de un dominio en la cola.
 */
export function interleaveByHostname(targets: MonitorTargetRecord[]): MonitorTargetRecord[] {
  const byHost = new Map<string, MonitorTargetRecord[]>();
  for (const t of targets) {
    const host = hostnameOf(t.sourceUrl);
    const list = byHost.get(host);
    if (list) list.push(t);
    else byHost.set(host, [t]);
  }
  const queues = [...byHost.values()];
  const out: MonitorTargetRecord[] = [];
  let remaining = targets.length;
  while (remaining > 0) {
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        remaining--;
      }
    }
  }
  return out;
}

function addDays(base: Date, days: number): IsoDateTime {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Procesa los targets de UNA organización dentro de una run ya creada.
 * Secuencial y conservador. Cada target se persiste individualmente
 * (resultado + actualización de su estado) — una run interrumpida deja
 * resultados parciales consistentes y el recovery la marca failed.
 */
async function processOrgTargets(
  store: MonitorEngineStore,
  runId: Uuid,
  organizationId: Uuid,
  targets: MonitorTargetRecord[],
  deps: Required<Pick<MonitorEngineDeps, 'now'>> & MonitorEngineDeps,
): Promise<{ counters: MonitorRunCounters; outcomes: TargetCheckOutcome[] }> {
  const counters = emptyCounters();
  const outcomes: TargetCheckOutcome[] = [];

  for (const target of interleaveByHostname(targets)) {
    const now = deps.now();
    let outcome: TargetCheckOutcome;
    try {
      outcome = await checkTarget(target, {
        store,
        fetcher: deps.fetcher,
        dnsLookup: deps.dnsLookup,
        now: deps.now,
      });
    } catch (err) {
      // Error inesperado: registrar como incidente, nunca tumbar la corrida.
      outcome = {
        targetId: target.id,
        status: 'invalid_response',
        detectedPrice: null,
        currency: null,
        unitRaw: null,
        warnings: [`Error inesperado del monitor: ${err instanceof Error ? err.name : 'unknown'}`],
        observationId: null,
        baselineObservationId: target.baselineObservationId,
      };
    }

    const checkedAt = deps.now().toISOString();
    counters.checked++;
    const failed = FAILURE_STATUSES.has(outcome.status);
    if (outcome.status === 'unchanged') counters.unchanged++;
    else if (outcome.status === 'changed') counters.changed++;
    else if (outcome.status === 'pending_created') counters.pendingCreated++;
    else counters.failed++;

    await store.recordResult({
      organizationId,
      runId,
      targetId: target.id,
      status: outcome.status,
      detectedPrice: outcome.detectedPrice,
      currency: outcome.currency,
      unitRaw: outcome.unitRaw,
      warnings: outcome.warnings,
      observationId: outcome.observationId,
      checkedAt,
    });

    // Retry conservador: éxito y fallo reprograman a now + cadence (un fallo
    // NUNCA acelera el reintento por debajo de la cadencia; nunca deshabilita).
    await store.updateTargetAfterCheck(target.id, {
      lastCheckedAt: checkedAt,
      nextCheckAt: addDays(now, target.cadenceDays),
      lastSuccessAt: failed ? target.lastSuccessAt : checkedAt,
      consecutiveFailures: failed ? target.consecutiveFailures + 1 : 0,
      baselineObservationId: outcome.baselineObservationId,
    });

    outcomes.push(outcome);
  }

  return { counters, outcomes };
}

function runStatusFrom(counters: MonitorRunCounters): 'completed' | 'partial' | 'failed' {
  if (counters.failed === 0) return 'completed';
  if (counters.failed === counters.checked) return 'failed';
  return 'partial';
}

async function runForOrg(
  store: MonitorEngineStore,
  organizationId: Uuid,
  targets: MonitorTargetRecord[],
  triggerType: MonitorTriggerType,
  idempotencyKey: string,
  initiatedBy: Uuid | null,
  deps: Required<Pick<MonitorEngineDeps, 'now'>> & MonitorEngineDeps,
): Promise<OrgRunSummary> {
  const runId = await store.createRun({ organizationId, triggerType, idempotencyKey, initiatedBy });
  if (runId === null) {
    return {
      organizationId,
      runId: null,
      skipped: 'duplicate_window',
      status: 'completed',
      counters: emptyCounters(),
      outcomes: [],
    };
  }

  try {
    const { counters, outcomes } = await processOrgTargets(store, runId, organizationId, targets, deps);
    const status = runStatusFrom(counters);
    await store.finishRun(runId, status, counters, null);
    return { organizationId, runId, skipped: null, status, counters, outcomes };
  } catch (err) {
    const summary = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown_error';
    await store.finishRun(runId, 'failed', emptyCounters(), summary.slice(0, 500));
    throw err;
  }
}

/**
 * Corrida PROGRAMADA (cron): lock global → recovery de runs huérfanas →
 * targets vencidos (≤25) agrupados por organización → una run idempotente
 * por org (`scheduled:<YYYY-MM-DD>` UTC).
 */
export async function runScheduledMonitor(
  store: MonitorSystemStore,
  deps: MonitorEngineDeps = {},
): Promise<ScheduledRunReport> {
  const now = deps.now ?? (() => new Date());
  const fullDeps = { ...deps, now };
  const maxTargets = deps.maxTargets ?? MONITOR_BATCH_LIMIT;

  const locked = await store.tryAcquireRunLock();
  if (!locked) {
    return { skipped: 'already_running', recoveredStaleRuns: 0, dueTargets: 0, organizations: [] };
  }

  try {
    const recovered = await store.recoverStaleRuns(MONITOR_STALE_RUN_MINUTES);
    const nowIso = now().toISOString();
    const due = await store.listDueTargets(nowIso, maxTargets);

    const byOrg = new Map<Uuid, MonitorTargetRecord[]>();
    for (const t of due) {
      const list = byOrg.get(t.organizationId);
      if (list) list.push(t);
      else byOrg.set(t.organizationId, [t]);
    }

    const windowKey = `scheduled:${nowIso.slice(0, 10)}`;
    const organizations: OrgRunSummary[] = [];
    for (const [organizationId, targets] of byOrg) {
      organizations.push(
        await runForOrg(store, organizationId, targets, 'scheduled', windowKey, null, fullDeps),
      );
    }

    return { skipped: null, recoveredStaleRuns: recovered, dueTargets: due.length, organizations };
  } finally {
    await store.releaseRunLock();
  }
}

/** Error de rate limit / ventana ocupada de la corrida manual. */
export class ManualRunThrottledError extends Error {
  readonly code = 'manual_run_throttled' as const;
  constructor() {
    super('Ya hay una revisión reciente en curso o ejecutada. Espera unos minutos.');
    this.name = 'ManualRunThrottledError';
  }
}

export interface ManualRunOptions {
  organizationId: Uuid;
  initiatedBy: Uuid;
  /** Si se indica, solo se revisa ese target («Revisar ahora»). */
  targetId?: Uuid;
}

/**
 * Corrida MANUAL (UI, RLS-bound con el viewer): el rate limit se materializa
 * como clave de idempotencia por ventana — org-wide 1/5min, por target 1/min.
 * Ventana ocupada ⇒ ManualRunThrottledError (la run NO se crea dos veces).
 */
export async function runManualMonitor(
  store: MonitorEngineStore,
  options: ManualRunOptions,
  deps: MonitorEngineDeps = {},
): Promise<OrgRunSummary> {
  const now = deps.now ?? (() => new Date());
  const fullDeps = { ...deps, now };
  const maxTargets = deps.maxTargets ?? MONITOR_BATCH_LIMIT;
  const nowIso = now().toISOString();

  let due: MonitorTargetRecord[];
  let idempotencyKey: string;
  if (options.targetId) {
    // «Revisar ahora» ignora next_check_at (revisión bajo demanda) pero exige
    // target habilitado y de la org del viewer (el store viewer es RLS-bound).
    const single = await store.getTargetById(options.targetId);
    due =
      single && single.enabled && single.organizationId === options.organizationId
        ? [single]
        : [];
    const windowStart = Math.floor(now().getTime() / 1000 / MONITOR_MANUAL_TARGET_WINDOW_SECONDS);
    idempotencyKey = `manual-target:${options.targetId}:${windowStart}`;
  } else {
    due = (await store.listDueTargets(nowIso, maxTargets)).filter(
      (t) => t.organizationId === options.organizationId,
    );
    const windowStart = Math.floor(now().getTime() / 1000 / MONITOR_MANUAL_WINDOW_SECONDS);
    idempotencyKey = `manual-org:${windowStart}`;
  }

  const summary = await runForOrg(
    store,
    options.organizationId,
    due,
    'manual',
    idempotencyKey,
    options.initiatedBy,
    fullDeps,
  );
  if (summary.skipped === 'duplicate_window') {
    throw new ManualRunThrottledError();
  }
  return summary;
}
