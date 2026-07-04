/**
 * db-repository.ts — Repositorio DB de monitoreo para la UI (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §6.
 *
 * Igual patrón que db-observation-repository (Fase 3A): cliente Supabase
 * SSR ligado a la sesión del usuario ⇒ RLS es la barrera real. Defensa de
 * aplicación: mutaciones solo para ViewerRole management|internal.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InsufficientRoleError } from '../errors';
import { MonitorValidationError, validateCreateTargetInput, isValidCadence } from './validation';
import { MONITOR_FAILURE_ALERT_THRESHOLD } from './types';
import type {
  AuthenticatedViewer,
  CreateTargetInput,
  MonitorRepository,
  MonitorResultView,
  MonitorRunResultDetailView,
  MonitorRunView,
  MonitorTargetView,
  MonitoringSummary,
  Uuid,
} from './types';

const MUTATION_ROLES = ['management', 'internal'] as const;

function checkMutationRole(viewer: AuthenticatedViewer): void {
  if (!(MUTATION_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

export class MonitorTargetNotFoundError extends Error {
  constructor(targetId: string) {
    super(`Target de monitoreo no encontrado: ${targetId}`);
    this.name = 'MonitorTargetNotFoundError';
  }
}

export class MonitorTargetDuplicateError extends Error {
  constructor() {
    super('Ya existe un monitoreo para este recurso y URL.');
    this.name = 'MonitorTargetDuplicateError';
  }
}

const TARGET_COLUMNS = `
  id, resource_id, supplier_id, source_url, cadence_days, enabled,
  last_checked_at, next_check_at, last_success_at, consecutive_failures,
  created_at,
  resources ( code, name, unit ),
  suppliers ( name )
`;

interface RunResultDetailRow {
  id: string;
  run_id: string;
  target_id: string;
  status: string;
  detected_price: string | number | null;
  currency: string | null;
  unit: string | null;
  warnings: unknown;
  observation_id: string | null;
  checked_at: string;
  price_monitor_targets:
    | {
        resources: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
        suppliers: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        resources: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
        suppliers: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
}

interface TargetRow {
  id: string;
  resource_id: string;
  supplier_id: string | null;
  source_url: string;
  cadence_days: number;
  enabled: boolean;
  last_checked_at: string | null;
  next_check_at: string;
  last_success_at: string | null;
  consecutive_failures: number;
  created_at: string;
  resources: { code: string; name: string; unit: string } | Array<{ code: string; name: string; unit: string }> | null;
  suppliers: { name: string } | Array<{ name: string }> | null;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function toTargetView(row: TargetRow, now: Date): MonitorTargetView {
  const resource = one(row.resources);
  const supplier = one(row.suppliers);
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceCode: resource?.code ?? '',
    resourceName: resource?.name ?? '',
    resourceUnit: resource?.unit ?? '',
    supplierId: row.supplier_id,
    supplierName: supplier?.name ?? null,
    sourceUrl: row.source_url,
    cadenceDays: Number(row.cadence_days),
    enabled: row.enabled,
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: Number(row.consecutive_failures),
    isOverdue: row.enabled && new Date(row.next_check_at).getTime() <= now.getTime(),
    hasFailureAlert: Number(row.consecutive_failures) >= MONITOR_FAILURE_ALERT_THRESHOLD,
    createdAt: row.created_at,
  };
}

export class DbMonitorRepository implements MonitorRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;
  private readonly now: () => Date;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient, now: () => Date = () => new Date()) {
    this.clientFactory = clientFactory;
    this.now = now;
  }

  async listTargetsForResource(viewer: AuthenticatedViewer, resourceId: Uuid): Promise<MonitorTargetView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_targets')
      .select(TARGET_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`monitor_targets_list_failed: ${error.code ?? 'unknown'}`);
    const now = this.now();
    return ((data ?? []) as unknown as TargetRow[]).map((r) => toTargetView(r, now));
  }

  async listTargets(viewer: AuthenticatedViewer): Promise<MonitorTargetView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_targets')
      .select(TARGET_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .order('next_check_at', { ascending: true });
    if (error) throw new Error(`monitor_targets_list_failed: ${error.code ?? 'unknown'}`);
    const now = this.now();
    return ((data ?? []) as unknown as TargetRow[]).map((r) => toTargetView(r, now));
  }

  async createTarget(viewer: AuthenticatedViewer, input: CreateTargetInput): Promise<MonitorTargetView> {
    checkMutationRole(viewer);
    const issues = validateCreateTargetInput(input);
    if (issues.length > 0) throw new MonitorValidationError(issues);

    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_targets')
      .insert({
        organization_id: viewer.organizationId,
        resource_id: input.resourceId,
        supplier_id: input.supplierId ?? null,
        source_url: input.sourceUrl.trim(),
        cadence_days: input.cadenceDays,
        enabled: true,
        created_by: viewer.profileId,
      })
      .select(TARGET_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') throw new MonitorTargetDuplicateError();
      throw new Error(`monitor_target_create_failed: ${error.code ?? 'unknown'}`);
    }
    return toTargetView(data as unknown as TargetRow, this.now());
  }

  async setTargetEnabled(viewer: AuthenticatedViewer, targetId: Uuid, enabled: boolean): Promise<MonitorTargetView> {
    checkMutationRole(viewer);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_targets')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .eq('organization_id', viewer.organizationId)
      .select(TARGET_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`monitor_target_update_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new MonitorTargetNotFoundError(targetId);
    return toTargetView(data as unknown as TargetRow, this.now());
  }

  async updateTargetCadence(viewer: AuthenticatedViewer, targetId: Uuid, cadenceDays: number): Promise<MonitorTargetView> {
    checkMutationRole(viewer);
    if (!isValidCadence(cadenceDays)) {
      throw new MonitorValidationError([
        { field: 'cadenceDays', message: 'La frecuencia debe ser 1, 7, 15 o 30 días.' },
      ]);
    }
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_targets')
      .update({ cadence_days: cadenceDays, updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .eq('organization_id', viewer.organizationId)
      .select(TARGET_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`monitor_target_update_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new MonitorTargetNotFoundError(targetId);
    return toTargetView(data as unknown as TargetRow, this.now());
  }

  async listRecentResults(viewer: AuthenticatedViewer, targetId: Uuid, limit: number): Promise<MonitorResultView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_results')
      .select('id, target_id, run_id, status, detected_price, currency, unit, warnings, observation_id, checked_at')
      .eq('organization_id', viewer.organizationId)
      .eq('target_id', targetId)
      .order('checked_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`monitor_results_list_failed: ${error.code ?? 'unknown'}`);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      targetId: row.target_id as string,
      runId: row.run_id as string,
      status: row.status as MonitorResultView['status'],
      detectedPrice: row.detected_price === null ? null : String(row.detected_price),
      currency: (row.currency as string | null) ?? null,
      unit: (row.unit as string | null) ?? null,
      warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
      observationId: (row.observation_id as string | null) ?? null,
      checkedAt: row.checked_at as string,
    }));
  }

  async listRecentRuns(viewer: AuthenticatedViewer, limit: number): Promise<MonitorRunView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_runs')
      .select('id, trigger_type, status, started_at, finished_at, counters, error_summary')
      .eq('organization_id', viewer.organizationId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`monitor_runs_list_failed: ${error.code ?? 'unknown'}`);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      triggerType: row.trigger_type as MonitorRunView['triggerType'],
      status: row.status as MonitorRunView['status'],
      startedAt: row.started_at as string,
      finishedAt: (row.finished_at as string | null) ?? null,
      counters: (row.counters ?? {}) as MonitorRunView['counters'],
      errorSummary: (row.error_summary as string | null) ?? null,
    }));
  }
  async listRunResults(viewer: AuthenticatedViewer, runId: Uuid, limit: number): Promise<MonitorRunResultDetailView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_monitor_results')
      .select(
        `
          id, run_id, target_id, status, detected_price, currency, unit, warnings, observation_id, checked_at,
          price_monitor_targets (
            resources ( code, name ),
            suppliers ( name )
          )
        `,
      )
      .eq('organization_id', viewer.organizationId)
      .eq('run_id', runId)
      .order('checked_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`monitor_run_results_list_failed: ${error.code ?? 'unknown'}`);

    return ((data ?? []) as unknown as RunResultDetailRow[]).map((row) => {
      const target = one(row.price_monitor_targets);
      const resource = one(target?.resources ?? null);
      const supplier = one(target?.suppliers ?? null);
      return {
        id: row.id,
        runId: row.run_id,
        targetId: row.target_id,
        resourceCode: resource?.code ?? '',
        resourceName: resource?.name ?? '',
        supplierName: supplier?.name ?? null,
        status: row.status as MonitorRunResultDetailView['status'],
        detectedPrice: row.detected_price === null ? null : String(row.detected_price),
        currency: row.currency ?? null,
        unit: row.unit ?? null,
        warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
        observationId: row.observation_id ?? null,
        checkedAt: row.checked_at,
      };
    });
  }

  async getMonitoringSummary(viewer: AuthenticatedViewer): Promise<MonitoringSummary> {
    const supabase = await this.clientFactory();
    const orgId = viewer.organizationId;
    const nowIso = this.now().toISOString();

    const total = await supabase
      .from('price_monitor_targets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    const active = await supabase
      .from('price_monitor_targets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('enabled', true);
    const overdue = await supabase
      .from('price_monitor_targets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('enabled', true)
      .lte('next_check_at', nowIso);
    const errored = await supabase
      .from('price_monitor_targets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('enabled', true)
      .gte('consecutive_failures', MONITOR_FAILURE_ALERT_THRESHOLD);
    const pendingChanges = await supabase
      .from('resource_price_observations')
      .select('id, price_monitor_results!observation_id!inner(id)', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'pending');
    const lastRun = await supabase
      .from('price_monitor_runs')
      .select('started_at')
      .eq('organization_id', orgId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    for (const r of [total, active, overdue, errored, pendingChanges]) {
      if (r.error) throw new Error(`monitor_summary_failed: ${r.error.code ?? 'unknown'}`);
    }
    if (lastRun.error) throw new Error(`monitor_summary_failed: ${lastRun.error.code ?? 'unknown'}`);

    const totalCount = total.count ?? 0;
    const activeCount = active.count ?? 0;

    // V5.4.1 — próxima revisión real (target enabled con menor next_check_at). TOLERANTE:
    // un fallo aquí devuelve nulls y NO tumba el summary ni el dashboard.
    let nextReviewAt: string | null = null;
    let nextTargetId: string | null = null;
    let nextTargetLabel: string | null = null;
    try {
      const next = await supabase
        .from('price_monitor_targets')
        .select('id, next_check_at, resources(code,name), suppliers(name)')
        .eq('organization_id', orgId)
        .eq('enabled', true)
        .order('next_check_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next.error && next.data) {
        const row = next.data as {
          id: string;
          next_check_at: string;
          resources?: { code?: string | null; name?: string | null } | null;
          suppliers?: { name?: string | null } | null;
        };
        nextReviewAt = row.next_check_at ?? null;
        nextTargetId = row.id ?? null;
        const code = row.resources?.code ?? null;
        const supplier = row.suppliers?.name ?? null;
        nextTargetLabel = [code, supplier].filter(Boolean).join(' · ') || null;
      }
    } catch {
      // tolerante: nulls
    }

    return {
      monitoredCount: totalCount,
      activeCount,
      pausedCount: totalCount - activeCount,
      overdueCount: overdue.count ?? 0,
      erroredCount: errored.count ?? 0,
      pendingChangesCount: pendingChanges.count ?? 0,
      lastRunAt: (lastRun.data?.started_at as string | undefined) ?? null,
      nextReviewAt,
      nextTargetId,
      nextTargetLabel,
    };
  }
}
