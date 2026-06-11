/**
 * db-stores.ts — Stores Postgres del engine de monitoreo (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §4.5.
 *
 * Dos implementaciones del puerto MonitorEngineStore:
 *
 *  - DbSystemMonitorStore (cron): lecturas/escrituras de monitor con la
 *    conexión administrativa (`DATABASE_URL`) — proceso administrativo
 *    controlado previsto en lib/db/index.ts; el endpoint está protegido por
 *    CRON_SECRET y los organization_id provienen SIEMPRE de las filas de
 *    targets. Las observaciones pending se insertan SIEMPRE RLS-bound con
 *    claims del usuario que habilitó el target (SET LOCAL ROLE authenticated).
 *
 *  - DbViewerMonitorStore (corrida manual): TODA operación dentro de una
 *    transacción RLS-bound con los claims del viewer real (mismo mecanismo
 *    que lib/db/rls.ts, en variante de escritura). RLS es la barrera real.
 */
import type postgres from 'postgres';
import { getSql } from '@/lib/db/index';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type {
  CreatePendingObservationInput,
  CreateRunInput,
  IsoDateTime,
  MonitorBaseline,
  MonitorEngineStore,
  MonitorRunCounters,
  MonitorRunStatus,
  MonitorSystemStore,
  MonitorTargetRecord,
  RecordResultInput,
  TargetCheckUpdate,
  Uuid,
} from './types';

/** Clave del advisory lock global de la corrida programada. */
const RUN_LOCK_KEY = 'price_monitor_global_run';

interface TargetRow {
  id: string;
  organization_id: string;
  resource_id: string;
  resource_unit: string;
  supplier_id: string | null;
  source_url: string;
  cadence_days: number;
  enabled: boolean;
  last_checked_at: string | null;
  next_check_at: string;
  last_success_at: string | null;
  consecutive_failures: number;
  baseline_observation_id: string | null;
  created_by: string;
}

function toTargetRecord(row: TargetRow): MonitorTargetRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceId: row.resource_id,
    resourceUnit: row.resource_unit,
    supplierId: row.supplier_id,
    sourceUrl: row.source_url,
    cadenceDays: Number(row.cadence_days),
    enabled: row.enabled,
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: Number(row.consecutive_failures),
    baselineObservationId: row.baseline_observation_id,
    createdBy: row.created_by,
  };
}

type Sql = ReturnType<typeof getSql>;
type Queryable = Sql | postgres.ReservedSql | postgres.TransactionSql;

// ---------------------------------------------------------------------------
// Queries compartidas (parametrizadas por el ejecutor: admin o RLS-bound)
// ---------------------------------------------------------------------------

async function qListDueTargets(
  q: Queryable,
  nowIso: IsoDateTime,
  limit: number,
): Promise<MonitorTargetRecord[]> {
  const rows = await q<TargetRow[]>`
    SELECT t.id, t.organization_id, t.resource_id, r.unit AS resource_unit,
           t.supplier_id, t.source_url, t.cadence_days, t.enabled,
           t.last_checked_at, t.next_check_at, t.last_success_at,
           t.consecutive_failures, t.baseline_observation_id, t.created_by
    FROM price_monitor_targets t
    JOIN resources r ON r.id = t.resource_id
    WHERE t.enabled AND t.next_check_at <= ${nowIso}
    ORDER BY t.next_check_at ASC
    LIMIT ${limit}`;
  return rows.map(toTargetRecord);
}

async function qGetTargetById(q: Queryable, targetId: Uuid): Promise<MonitorTargetRecord | null> {
  const rows = await q<TargetRow[]>`
    SELECT t.id, t.organization_id, t.resource_id, r.unit AS resource_unit,
           t.supplier_id, t.source_url, t.cadence_days, t.enabled,
           t.last_checked_at, t.next_check_at, t.last_success_at,
           t.consecutive_failures, t.baseline_observation_id, t.created_by
    FROM price_monitor_targets t
    JOIN resources r ON r.id = t.resource_id
    WHERE t.id = ${targetId}`;
  return rows[0] ? toTargetRecord(rows[0]) : null;
}

async function qCreateRun(q: Queryable, input: CreateRunInput): Promise<Uuid | null> {
  const rows = await q<{ id: string }[]>`
    INSERT INTO price_monitor_runs (organization_id, trigger_type, status, initiated_by, idempotency_key)
    VALUES (${input.organizationId}, ${input.triggerType}, 'running', ${input.initiatedBy}, ${input.idempotencyKey})
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id`;
  return rows[0]?.id ?? null;
}

async function qFinishRun(
  q: Queryable,
  runId: Uuid,
  status: MonitorRunStatus,
  counters: MonitorRunCounters,
  errorSummary: string | null,
): Promise<void> {
  await q`
    UPDATE price_monitor_runs
    SET status = ${status}, finished_at = now(),
        counters = ${JSON.stringify(counters)}::jsonb,
        error_summary = ${errorSummary}
    WHERE id = ${runId}`;
}

async function qRecordResult(q: Queryable, input: RecordResultInput): Promise<void> {
  await q`
    INSERT INTO price_monitor_results (
      organization_id, run_id, target_id, status,
      detected_price, currency, unit, warnings, observation_id, checked_at
    ) VALUES (
      ${input.organizationId}, ${input.runId}, ${input.targetId}, ${input.status},
      ${input.detectedPrice}, ${input.currency}, ${input.unitRaw},
      ${JSON.stringify(input.warnings)}::jsonb, ${input.observationId}, ${input.checkedAt}
    )`;
}

async function qUpdateTargetAfterCheck(
  q: Queryable,
  targetId: Uuid,
  update: TargetCheckUpdate,
): Promise<void> {
  await q`
    UPDATE price_monitor_targets
    SET last_checked_at = ${update.lastCheckedAt},
        next_check_at = ${update.nextCheckAt},
        last_success_at = ${update.lastSuccessAt},
        consecutive_failures = ${update.consecutiveFailures},
        baseline_observation_id = ${update.baselineObservationId},
        updated_at = now()
    WHERE id = ${targetId}`;
}

async function qFindBaseline(
  q: Queryable,
  organizationId: Uuid,
  resourceId: Uuid,
  sourceUrl: string,
): Promise<MonitorBaseline | null> {
  const rows = await q<
    { id: string; observed_price: string; currency: string; unit: string; source_reference: string | null }[]
  >`
    SELECT id, observed_price, currency, unit, source_reference
    FROM resource_price_observations
    WHERE organization_id = ${organizationId}
      AND resource_id = ${resourceId}
      AND status = 'approved'
    ORDER BY (source_reference = ${sourceUrl}) DESC NULLS LAST,
             approved_at DESC NULLS LAST, created_at DESC
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    observationId: row.id,
    price: String(row.observed_price),
    currency: row.currency,
    unit: row.unit,
    sourceReference: row.source_reference,
  };
}

async function qFindIdenticalPending(
  q: Queryable,
  organizationId: Uuid,
  resourceId: Uuid,
  sourceUrl: string,
  price: string,
  currency: string,
): Promise<Uuid | null> {
  const rows = await q<{ id: string }[]>`
    SELECT id FROM resource_price_observations
    WHERE organization_id = ${organizationId}
      AND resource_id = ${resourceId}
      AND status = 'pending'
      AND source_reference = ${sourceUrl}
      AND observed_price = ${price}::numeric
      AND currency = ${currency}
    ORDER BY created_at DESC
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

/**
 * INSERT RLS-bound de la observación pending. `claims` identifica al actor
 * efectivo (cron: usuario que habilitó el target; manual: viewer real).
 * suggested_net_price lo fija el trigger DB (invariante de Fase 3A).
 */
async function insertPendingObservationRlsBound(
  sql: Sql,
  claims: { sub: string; organization_id: string },
  input: CreatePendingObservationInput,
): Promise<Uuid> {
  const r = await sql.reserve();
  try {
    await r.unsafe('BEGIN');
    await r`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await r.unsafe('SET LOCAL ROLE authenticated');
    const rows = await r<{ id: string }[]>`
      INSERT INTO resource_price_observations (
        organization_id, resource_id, supplier_id,
        observed_price, discount_percent, suggested_net_price,
        unit, currency, source_type, source_reference,
        observed_at, status, notes, created_by
      ) VALUES (
        ${input.target.organizationId}, ${input.target.resourceId}, ${input.target.supplierId},
        ${input.price}::numeric, 0, 0,
        ${input.unit}, ${input.currency}, 'public_web', ${input.target.sourceUrl},
        ${input.observedAt}, 'pending', ${input.notes}, ${claims.sub}
      )
      RETURNING id`;
    await r.unsafe('COMMIT');
    const id = rows[0]?.id;
    if (!id) throw new Error('observation_insert_failed');
    return id;
  } catch (e) {
    try {
      await r.unsafe('ROLLBACK');
    } catch {
      /* noop */
    }
    throw e;
  } finally {
    r.release();
  }
}

// ---------------------------------------------------------------------------
// Store del SISTEMA (cron)
// ---------------------------------------------------------------------------

export class DbSystemMonitorStore implements MonitorSystemStore {
  private readonly sql: Sql;
  /** Conexión reservada mientras se sostiene el advisory lock de sesión. */
  private lockConnection: postgres.ReservedSql | null = null;

  constructor(sql: Sql = getSql()) {
    this.sql = sql;
  }

  async tryAcquireRunLock(): Promise<boolean> {
    const r = await this.sql.reserve();
    const rows = await r<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtext(${RUN_LOCK_KEY})) AS locked`;
    if (!rows[0]?.locked) {
      r.release();
      return false;
    }
    this.lockConnection = r;
    return true;
  }

  async releaseRunLock(): Promise<void> {
    const r = this.lockConnection;
    if (!r) return;
    this.lockConnection = null;
    try {
      await r`SELECT pg_advisory_unlock(hashtext(${RUN_LOCK_KEY}))`;
    } finally {
      r.release();
    }
  }

  async recoverStaleRuns(olderThanMinutes: number): Promise<number> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE price_monitor_runs
      SET status = 'failed', finished_at = now(), error_summary = 'stale_run_recovered'
      WHERE status = 'running'
        AND started_at < now() - make_interval(mins => ${olderThanMinutes})
      RETURNING id`;
    return rows.length;
  }

  listDueTargets(nowIso: IsoDateTime, limit: number): Promise<MonitorTargetRecord[]> {
    return qListDueTargets(this.sql, nowIso, limit);
  }

  getTargetById(targetId: Uuid): Promise<MonitorTargetRecord | null> {
    return qGetTargetById(this.sql, targetId);
  }

  createRun(input: CreateRunInput): Promise<Uuid | null> {
    return qCreateRun(this.sql, input);
  }

  finishRun(
    runId: Uuid,
    status: MonitorRunStatus,
    counters: MonitorRunCounters,
    errorSummary: string | null,
  ): Promise<void> {
    return qFinishRun(this.sql, runId, status, counters, errorSummary);
  }

  recordResult(input: RecordResultInput): Promise<void> {
    return qRecordResult(this.sql, input);
  }

  updateTargetAfterCheck(targetId: Uuid, update: TargetCheckUpdate): Promise<void> {
    return qUpdateTargetAfterCheck(this.sql, targetId, update);
  }

  findBaseline(organizationId: Uuid, resourceId: Uuid, sourceUrl: string): Promise<MonitorBaseline | null> {
    return qFindBaseline(this.sql, organizationId, resourceId, sourceUrl);
  }

  findIdenticalPending(
    organizationId: Uuid,
    resourceId: Uuid,
    sourceUrl: string,
    price: string,
    currency: string,
  ): Promise<Uuid | null> {
    return qFindIdenticalPending(this.sql, organizationId, resourceId, sourceUrl, price, currency);
  }

  /** RLS-bound como el usuario que habilitó el target (contrato §4.5). */
  createPendingObservation(input: CreatePendingObservationInput): Promise<Uuid> {
    return insertPendingObservationRlsBound(
      this.sql,
      { sub: input.target.createdBy, organization_id: input.target.organizationId },
      input,
    );
  }
}

// ---------------------------------------------------------------------------
// Store del VIEWER (corrida manual — 100% RLS-bound)
// ---------------------------------------------------------------------------

export class DbViewerMonitorStore implements MonitorEngineStore {
  private readonly sql: Sql;
  private readonly claims: { sub: string; organization_id: string; user_role?: string };

  constructor(viewer: AuthenticatedViewer, sql: Sql = getSql()) {
    this.sql = sql;
    this.claims = { sub: viewer.userId, organization_id: viewer.organizationId };
  }

  /** Ejecuta `fn` en una transacción RLS-bound (rol authenticated + claims). */
  private async withRls<T>(fn: (q: postgres.ReservedSql) => Promise<T>): Promise<T> {
    const r = await this.sql.reserve();
    try {
      await r.unsafe('BEGIN');
      await r`SELECT set_config('request.jwt.claims', ${JSON.stringify(this.claims)}, true)`;
      await r.unsafe('SET LOCAL ROLE authenticated');
      const out = await fn(r);
      await r.unsafe('COMMIT');
      return out;
    } catch (e) {
      try {
        await r.unsafe('ROLLBACK');
      } catch {
        /* noop */
      }
      throw e;
    } finally {
      r.release();
    }
  }

  listDueTargets(nowIso: IsoDateTime, limit: number): Promise<MonitorTargetRecord[]> {
    return this.withRls((q) => qListDueTargets(q, nowIso, limit));
  }

  getTargetById(targetId: Uuid): Promise<MonitorTargetRecord | null> {
    return this.withRls((q) => qGetTargetById(q, targetId));
  }

  createRun(input: CreateRunInput): Promise<Uuid | null> {
    return this.withRls((q) => qCreateRun(q, input));
  }

  finishRun(
    runId: Uuid,
    status: MonitorRunStatus,
    counters: MonitorRunCounters,
    errorSummary: string | null,
  ): Promise<void> {
    return this.withRls((q) => qFinishRun(q, runId, status, counters, errorSummary));
  }

  recordResult(input: RecordResultInput): Promise<void> {
    return this.withRls((q) => qRecordResult(q, input));
  }

  updateTargetAfterCheck(targetId: Uuid, update: TargetCheckUpdate): Promise<void> {
    return this.withRls((q) => qUpdateTargetAfterCheck(q, targetId, update));
  }

  findBaseline(organizationId: Uuid, resourceId: Uuid, sourceUrl: string): Promise<MonitorBaseline | null> {
    return this.withRls((q) => qFindBaseline(q, organizationId, resourceId, sourceUrl));
  }

  findIdenticalPending(
    organizationId: Uuid,
    resourceId: Uuid,
    sourceUrl: string,
    price: string,
    currency: string,
  ): Promise<Uuid | null> {
    return this.withRls((q) =>
      qFindIdenticalPending(q, organizationId, resourceId, sourceUrl, price, currency),
    );
  }

  /** RLS-bound como el viewer real (created_by = auth.uid()). */
  createPendingObservation(input: CreatePendingObservationInput): Promise<Uuid> {
    return insertPendingObservationRlsBound(this.sql, this.claims, input);
  }
}
