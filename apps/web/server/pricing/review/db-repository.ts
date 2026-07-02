/**
 * db-repository.ts — Repositorio DB del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Propiedad: agent-pricing.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id SIEMPRE = viewer.organizationId (server-side).
 *  - El UPDATE masivo solo toca filas `pending` de la org (doble filtro:
 *    aplicación + RLS rpo_update_review_only en DB).
 *  - Acciones masivas: INSERT primero (barrera de idempotencia por UNIQUE
 *    (organization_id, idempotency_key)), luego UPDATE de contadores.
 */
import { createClient } from '@/lib/supabase/server';
import { isOldPrice } from '@/lib/catalog/price-age';
import { getSuggestedMonitorAction } from '@/lib/pricing/monitor-ui';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MONITOR_FAILURE_ALERT_THRESHOLD } from '../monitor/types';
import { BulkActionDuplicateError } from './errors';
import { computeReviewWarnings, BULK_UPDATE_CHUNK } from './validation';
import type {
  AuthenticatedViewer,
  BulkActionRecord,
  OperationalReviewConsole,
  OperationalReviewConsoleLimits,
  OperationalReviewItem,
  PendingReviewObservationView,
  PriceReviewRepository,
  ReviewBatchView,
  Uuid,
} from './types';

const OBS_COLUMNS = `
  id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, created_at, status, notes, import_batch_id,
  resources ( code, name, unit ),
  suppliers ( name ),
  price_observation_batches ( label, source_reference )
`;


const DEFAULT_CONSOLE_LIMITS = {
  urgent: 6,
  coverage: 6,
  sourceHealth: 6,
  recentActivity: 6,
  resourceScan: 200,
  pendingScan: 80,
  recentScan: 40,
};

const HIGH_DELTA_PCT = 15;

const CONSOLE_OBS_COLUMNS = `
  id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, created_at, approved_at, valid_until, status, notes, rejection_reason, import_batch_id,
  resources ( code, name, unit ),
  suppliers ( name ),
  price_observation_batches ( label, source_reference )
`;

interface ConsoleObsRow extends ObsRow {
  approved_at: string | null;
  valid_until: string | null;
  rejection_reason: string | null;
}

interface ConsoleApprovedRow {
  id: string;
  resource_id: string;
  suggested_net_price: string;
  approved_at: string | null;
  observed_at: string;
  valid_until: string | null;
}

interface ConsoleResourceRow {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface ConsoleTargetRow {
  id: string;
  resource_id: string;
  supplier_id: string | null;
  source_url: string;
  enabled: boolean;
  next_check_at: string;
  consecutive_failures: number;
  last_checked_at: string | null;
  resources: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
  suppliers: { name: string | null } | Array<{ name: string | null }> | null;
}

interface ConsoleMonitorResultRow {
  id: string;
  target_id: string;
  status: string;
  checked_at: string;
  warnings: unknown;
  observation_id: string | null;
  price_monitor_targets:
    | {
        resource_id: string | null;
        resources: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
        suppliers: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        resource_id: string | null;
        resources: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
        suppliers: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(1, Math.min(Math.floor(value!), max));
}

function moneyLabel(value: string | null | undefined, currency = 'COP'): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${value} ${currency}`;
  }
}

function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function computeConsoleDelta(current: string, previous: string | null): { abs: string | null; pct: string | null } {
  if (!previous) return { abs: null, pct: null };
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) return { abs: null, pct: null };
  const abs = currentNumber - previousNumber;
  return { abs: toDecimalString(abs), pct: toDecimalString((abs / previousNumber) * 100) };
}

function consoleOrigin(row: Pick<PendingReviewObservationView, 'fromMonitor' | 'importBatchId'>): OperationalReviewItem['origin'] {
  if (row.fromMonitor) return 'monitor';
  if (row.importBatchId) return 'batch';
  return 'manual';
}

function severityRank(item: OperationalReviewItem): number {
  if (item.severity === 'action_required') return 0;
  if (item.severity === 'warning') return 1;
  return 2;
}

function sourceHealthHref(targetId: string): string {
  return `/catalog/monitoring?target=${encodeURIComponent(targetId)}`;
}
interface ObsRow {
  id: string;
  resource_id: string;
  supplier_id: string | null;
  observed_price: string;
  discount_percent: string;
  suggested_net_price: string;
  unit: string;
  currency: string;
  source_type: string;
  source_reference: string | null;
  observed_at: string;
  created_at: string;
  status: string;
  notes: string | null;
  import_batch_id: string | null;
  resources: { code: string; name: string; unit: string } | Array<{ code: string; name: string; unit: string }> | null;
  suppliers: { name: string } | Array<{ name: string }> | null;
  price_observation_batches:
    | { label: string | null; source_reference: string | null }
    | Array<{ label: string | null; source_reference: string | null }>
    | null;
}

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export class DbPriceReviewRepository implements PriceReviewRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  async listPendingObservations(
    viewer: AuthenticatedViewer,
    limit: number,
  ): Promise<PendingReviewObservationView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('resource_price_observations')
      .select(OBS_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`review_list_failed: ${error.code ?? 'unknown'}`);

    const rows = (data as unknown as ObsRow[]) ?? [];

    // Origen monitor: observaciones referenciadas desde price_monitor_results.
    const monitorIds = await this.findMonitorObservationIds(
      supabase,
      viewer,
      rows.map((r) => r.id),
    );

    return rows.map((row) => {
      const resource = one(row.resources);
      const supplier = one(row.suppliers);
      const batch = one(row.price_observation_batches);
      const fromMonitor = monitorIds.has(row.id);
      const base = {
        unit: row.unit,
        resourceUnit: resource?.unit ?? '',
        observedPrice: String(row.observed_price),
        currency: row.currency,
        fromMonitor,
      };
      return {
        id: row.id,
        resourceId: row.resource_id,
        resourceCode: resource?.code ?? '',
        resourceName: resource?.name ?? '',
        resourceUnit: resource?.unit ?? '',
        supplierId: row.supplier_id,
        supplierName: supplier?.name ?? null,
        observedPrice: String(row.observed_price),
        discountPercent: String(row.discount_percent),
        suggestedNetPrice: String(row.suggested_net_price),
        unit: row.unit,
        currency: row.currency,
        sourceType: row.source_type as PendingReviewObservationView['sourceType'],
        sourceReference: row.source_reference,
        observedAt: row.observed_at,
        createdAt: row.created_at,
        status: 'pending' as const,
        notes: row.notes,
        importBatchId: row.import_batch_id,
        batchLabel: batch?.label ?? null,
        fromMonitor,
        warnings: computeReviewWarnings(base),
      };
    });
  }

  private async findMonitorObservationIds(
    supabase: SupabaseClient,
    viewer: AuthenticatedViewer,
    observationIds: string[],
  ): Promise<Set<string>> {
    const out = new Set<string>();
    if (observationIds.length === 0) return out;
    for (let i = 0; i < observationIds.length; i += 200) {
      const chunk = observationIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from('price_monitor_results')
        .select('observation_id')
        .eq('organization_id', viewer.organizationId)
        .in('observation_id', chunk);
      if (error) throw new Error(`review_monitor_flag_failed: ${error.code ?? 'unknown'}`);
      for (const r of (data ?? []) as Array<{ observation_id: string | null }>) {
        if (r.observation_id) out.add(r.observation_id);
      }
    }
    return out;
  }

  async listBatches(viewer: AuthenticatedViewer): Promise<ReviewBatchView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_observation_batches')
      .select('id, source_type, source_reference, label, imported_at, total_rows')
      .eq('organization_id', viewer.organizationId)
      .order('imported_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`review_batches_failed: ${error.code ?? 'unknown'}`);

    const batches = (data ?? []) as Array<{
      id: string;
      source_type: string;
      source_reference: string | null;
      label: string | null;
      imported_at: string;
      total_rows: number;
    }>;
    if (batches.length === 0) return [];

    // pending_count calculado en lectura (no almacenado).
    const pendingByBatch = new Map<string, number>();
    for (let i = 0; i < batches.length; i += 100) {
      const ids = batches.slice(i, i + 100).map((b) => b.id);
      const { data: obs, error: obsError } = await supabase
        .from('resource_price_observations')
        .select('import_batch_id')
        .eq('organization_id', viewer.organizationId)
        .eq('status', 'pending')
        .in('import_batch_id', ids);
      if (obsError) throw new Error(`review_batch_counts_failed: ${obsError.code ?? 'unknown'}`);
      for (const r of (obs ?? []) as Array<{ import_batch_id: string | null }>) {
        if (!r.import_batch_id) continue;
        pendingByBatch.set(r.import_batch_id, (pendingByBatch.get(r.import_batch_id) ?? 0) + 1);
      }
    }

    return batches.map((b) => ({
      id: b.id,
      sourceType: b.source_type as ReviewBatchView['sourceType'],
      sourceReference: b.source_reference,
      label: b.label,
      importedAt: b.imported_at,
      totalRows: b.total_rows,
      pendingCount: pendingByBatch.get(b.id) ?? 0,
    }));
  }


  async getOperationalReviewConsole(
    viewer: AuthenticatedViewer,
    limits: OperationalReviewConsoleLimits = {},
  ): Promise<OperationalReviewConsole> {
    const supabase = await this.clientFactory();
    const cfg = {
      urgent: clampLimit(limits.urgent, DEFAULT_CONSOLE_LIMITS.urgent, 12),
      coverage: clampLimit(limits.coverage, DEFAULT_CONSOLE_LIMITS.coverage, 12),
      sourceHealth: clampLimit(limits.sourceHealth, DEFAULT_CONSOLE_LIMITS.sourceHealth, 12),
      recentActivity: clampLimit(limits.recentActivity, DEFAULT_CONSOLE_LIMITS.recentActivity, 12),
      resourceScan: clampLimit(limits.resourceScan, DEFAULT_CONSOLE_LIMITS.resourceScan, 500),
      pendingScan: clampLimit(limits.pendingScan, DEFAULT_CONSOLE_LIMITS.pendingScan, 200),
      recentScan: clampLimit(limits.recentScan, DEFAULT_CONSOLE_LIMITS.recentScan, 100),
    };
    const now = new Date();
    const nowIso = now.toISOString();

    const [pendingCount, resourcesResult, pendingResult, recentResult, targetsResult, monitorResult] = await Promise.all([
      supabase.from('resource_price_observations').select('id', { count: 'exact', head: true }).eq('organization_id', viewer.organizationId).eq('status', 'pending'),
      supabase.from('resources').select('id, code, name, unit').eq('organization_id', viewer.organizationId).order('code', { ascending: true }).limit(cfg.resourceScan),
      supabase.from('resource_price_observations').select(CONSOLE_OBS_COLUMNS).eq('organization_id', viewer.organizationId).eq('status', 'pending').order('created_at', { ascending: false }).limit(cfg.pendingScan),
      supabase.from('resource_price_observations').select(CONSOLE_OBS_COLUMNS).eq('organization_id', viewer.organizationId).in('status', ['approved', 'rejected']).order('approved_at', { ascending: false, nullsFirst: false }).limit(cfg.recentScan),
      supabase.from('price_monitor_targets').select(`id, resource_id, supplier_id, source_url, enabled, next_check_at, consecutive_failures, last_checked_at, resources ( code, name ), suppliers ( name )`).eq('organization_id', viewer.organizationId).eq('enabled', true).order('next_check_at', { ascending: true }).limit(Math.max(cfg.sourceHealth * 4, 25)),
      supabase.from('price_monitor_results').select(`id, target_id, status, checked_at, warnings, observation_id, price_monitor_targets ( resource_id, resources ( code, name ), suppliers ( name ) )`).eq('organization_id', viewer.organizationId).order('checked_at', { ascending: false }).limit(Math.max(cfg.sourceHealth * 6, 30)),
    ]);

    for (const result of [pendingCount, resourcesResult, pendingResult, recentResult, targetsResult, monitorResult]) {
      if (result.error) throw new Error(`operational_review_console_failed: ${result.error.code ?? 'unknown'}`);
    }

    const resources = ((resourcesResult.data ?? []) as unknown) as ConsoleResourceRow[];
    const pendingRows = ((pendingResult.data ?? []) as unknown) as ConsoleObsRow[];
    const recentRows = ((recentResult.data ?? []) as unknown) as ConsoleObsRow[];
    const targets = ((targetsResult.data ?? []) as unknown) as ConsoleTargetRow[];
    const monitorRows = ((monitorResult.data ?? []) as unknown) as ConsoleMonitorResultRow[];
    const pendingMonitorIds = await this.findMonitorObservationIds(supabase, viewer, pendingRows.map((r) => r.id));
    const recentMonitorIds = await this.findMonitorObservationIds(supabase, viewer, recentRows.map((r) => r.id));

    const resourceIds = [...new Set([...resources.map((r) => r.id), ...pendingRows.map((r) => r.resource_id), ...recentRows.map((r) => r.resource_id)])];
    let approvedRows: ConsoleApprovedRow[] = [];
    if (resourceIds.length > 0) {
      const { data, error } = await supabase.from('resource_price_observations').select('id, resource_id, suggested_net_price, approved_at, observed_at, valid_until').eq('organization_id', viewer.organizationId).eq('status', 'approved').in('resource_id', resourceIds).order('observed_at', { ascending: false }).limit(Math.min(Math.max(resourceIds.length * 4, 100), 1000));
      if (error) throw new Error(`operational_review_approved_failed: ${error.code ?? 'unknown'}`);
      approvedRows = ((data ?? []) as unknown) as ConsoleApprovedRow[];
    }

    const approvedByResource = new Map<string, ConsoleApprovedRow[]>();
    for (const row of approvedRows) {
      const list = approvedByResource.get(row.resource_id) ?? [];
      list.push(row);
      approvedByResource.set(row.resource_id, list);
    }

    const toPendingView = (row: ConsoleObsRow, monitorIds: Set<string>): PendingReviewObservationView => {
      const resource = one(row.resources);
      const supplier = one(row.suppliers);
      const batch = one(row.price_observation_batches);
      const fromMonitor = monitorIds.has(row.id);
      const warnings = computeReviewWarnings({ unit: row.unit, resourceUnit: resource?.unit ?? '', observedPrice: String(row.observed_price), currency: row.currency, fromMonitor });
      return { id: row.id, resourceId: row.resource_id, resourceCode: resource?.code ?? '', resourceName: resource?.name ?? '', resourceUnit: resource?.unit ?? '', supplierId: row.supplier_id, supplierName: supplier?.name ?? null, observedPrice: String(row.observed_price), discountPercent: String(row.discount_percent), suggestedNetPrice: String(row.suggested_net_price), unit: row.unit, currency: row.currency, sourceType: row.source_type as PendingReviewObservationView['sourceType'], sourceReference: row.source_reference, observedAt: row.observed_at, createdAt: row.created_at, status: 'pending', notes: row.notes, importBatchId: row.import_batch_id, batchLabel: batch?.label ?? null, fromMonitor, warnings };
    };
    const previousApproved = (resourceId: string, observedAt: string, currentId: string): ConsoleApprovedRow | null => {
      const observedTime = Date.parse(observedAt);
      for (const candidate of approvedByResource.get(resourceId) ?? []) {
        if (candidate.id === currentId) continue;
        const candidateTime = Date.parse(candidate.observed_at);
        if (!Number.isFinite(observedTime) || !Number.isFinite(candidateTime) || candidateTime < observedTime) return candidate;
      }
      return null;
    };

    const pendingViews = pendingRows.map((row) => toPendingView(row, pendingMonitorIds));
    const urgentRaw: OperationalReviewItem[] = pendingViews.flatMap((obs) => {
      const previous = previousApproved(obs.resourceId, obs.observedAt, obs.id);
      const delta = computeConsoleDelta(obs.suggestedNetPrice, previous ? String(previous.suggested_net_price) : null);
      const deltaPct = delta.pct === null ? null : Math.abs(Number(delta.pct));
      const reasons: string[] = [];
      if (obs.warnings.length > 0) reasons.push('Tiene advertencias de revision');
      if (obs.fromMonitor) reasons.push('Cambio creado por monitor');
      if (deltaPct !== null && deltaPct >= HIGH_DELTA_PCT) reasons.push(`Delta derivado >= ${HIGH_DELTA_PCT}%`);
      if (!obs.supplierName) reasons.push('Sin proveedor registrado');
      if (reasons.length === 0) return [];
      return [{ id: `urgent-${obs.id}`, signal: obs.fromMonitor ? 'monitor_change' : obs.warnings.length > 0 ? 'pending_warning' : deltaPct !== null && deltaPct >= HIGH_DELTA_PCT ? 'high_delta' : 'missing_supplier', severity: 'action_required', resourceId: obs.resourceId, resourceCode: obs.resourceCode, resourceName: obs.resourceName, supplierName: obs.supplierName, statusLabel: 'Pendiente', priceLabel: moneyLabel(obs.suggestedNetPrice, obs.currency), previousApprovedPrice: previous ? String(previous.suggested_net_price) : null, deltaAbs: delta.abs, deltaPct: delta.pct, origin: consoleOrigin(obs), date: obs.observedAt, reason: reasons.join(' - '), suggestedAction: 'Revisar en Price Review', href: '/catalog/prices/review' } satisfies OperationalReviewItem];
    }).sort((a, b) => severityRank(a) - severityRank(b));

    const coverageRaw: OperationalReviewItem[] = [];
    for (const resource of resources) {
      const approved = approvedByResource.get(resource.id) ?? [];
      if (approved.length === 0) {
        coverageRaw.push({ id: `coverage-no-approved-${resource.id}`, signal: 'missing_approved_price', severity: 'action_required', resourceId: resource.id, resourceCode: resource.code, resourceName: resource.name, supplierName: null, statusLabel: 'Sin approved', priceLabel: null, previousApprovedPrice: null, deltaAbs: null, deltaPct: null, origin: 'catalog', date: null, reason: 'Sin precio aprobado vigente en el muestreo operativo', suggestedAction: 'Abrir recurso', href: `/catalog/resources/${resource.id}/price-intelligence` });
        continue;
      }
      const latest = approved[0];
      if (!latest) continue;
      const validUntilTime = latest.valid_until ? Date.parse(latest.valid_until) : NaN;
      if (isOldPrice(latest.approved_at) || (Number.isFinite(validUntilTime) && validUntilTime <= now.getTime())) {
        coverageRaw.push({ id: `coverage-stale-${latest.id}`, signal: 'stale_price', severity: 'warning', resourceId: resource.id, resourceCode: resource.code, resourceName: resource.name, supplierName: null, statusLabel: 'Precio viejo', priceLabel: moneyLabel(String(latest.suggested_net_price)), previousApprovedPrice: String(latest.suggested_net_price), deltaAbs: null, deltaPct: null, origin: 'catalog', date: latest.approved_at, reason: 'Precio aprobado supera la heuristica vigente de antiguedad o valid_until', suggestedAction: 'Ver historico del recurso', href: `/catalog/resources/${resource.id}/price-intelligence` });
      }
    }
    for (const obs of pendingViews.filter((o) => !o.supplierName)) {
      coverageRaw.push({ id: `coverage-missing-supplier-${obs.id}`, signal: 'missing_supplier', severity: 'warning', resourceId: obs.resourceId, resourceCode: obs.resourceCode, resourceName: obs.resourceName, supplierName: null, statusLabel: 'Sin proveedor', priceLabel: moneyLabel(obs.suggestedNetPrice, obs.currency), previousApprovedPrice: null, deltaAbs: null, deltaPct: null, origin: consoleOrigin(obs), date: obs.observedAt, reason: 'La observacion no tiene proveedor asociado', suggestedAction: 'Ver historico del recurso', href: `/catalog/resources/${obs.resourceId}/price-intelligence` });
    }

    const sourceHealthRaw: OperationalReviewItem[] = [];
    for (const target of targets) {
      const resource = one(target.resources);
      const supplier = one(target.suppliers);
      const isOverdue = target.enabled && Date.parse(target.next_check_at) <= Date.parse(nowIso);
      const isFailing = Number(target.consecutive_failures) >= MONITOR_FAILURE_ALERT_THRESHOLD || Number(target.consecutive_failures) > 0;
      if (!isOverdue && !isFailing) continue;
      sourceHealthRaw.push({ id: `source-target-${target.id}`, signal: isFailing ? 'target_failing' : 'target_overdue', severity: isFailing ? 'action_required' : 'warning', resourceId: target.resource_id, resourceCode: resource?.code ?? '', resourceName: resource?.name ?? '', supplierName: supplier?.name ?? null, statusLabel: isFailing ? `${target.consecutive_failures} fallos` : 'Vencido', priceLabel: null, previousApprovedPrice: null, deltaAbs: null, deltaPct: null, origin: 'monitor', date: target.next_check_at, reason: isFailing ? 'Target con fallos consecutivos' : 'Target de monitoreo vencido', suggestedAction: 'Validar fuente', href: sourceHealthHref(target.id) });
    }
    for (const row of monitorRows) {
      const warnings = Array.isArray(row.warnings) ? (row.warnings as string[]) : [];
      if (warnings.length === 0) continue;
      const target = one(row.price_monitor_targets);
      const resource = one(target?.resources ?? null);
      const supplier = one(target?.suppliers ?? null);
      sourceHealthRaw.push({ id: `source-result-${row.id}`, signal: 'monitor_warning', severity: 'warning', resourceId: target?.resource_id ?? null, resourceCode: resource?.code ?? '', resourceName: resource?.name ?? '', supplierName: supplier?.name ?? null, statusLabel: row.status, priceLabel: null, previousApprovedPrice: null, deltaAbs: null, deltaPct: null, origin: 'monitor', date: row.checked_at, reason: warnings.join(' - '), suggestedAction: getSuggestedMonitorAction(row.status), href: sourceHealthHref(row.target_id) });
    }

    const recentActivity = recentRows.slice(0, cfg.recentActivity + 1).map((row): OperationalReviewItem => {
      const resource = one(row.resources);
      const supplier = one(row.suppliers);
      const fromMonitor = recentMonitorIds.has(row.id);
      const previous = previousApproved(row.resource_id, row.observed_at, row.id);
      const delta = computeConsoleDelta(String(row.suggested_net_price), previous ? String(previous.suggested_net_price) : null);
      return { id: `recent-${row.id}`, signal: row.status === 'approved' ? 'recent_approved' : 'recent_rejected', severity: 'informational', resourceId: row.resource_id, resourceCode: resource?.code ?? '', resourceName: resource?.name ?? '', supplierName: supplier?.name ?? null, statusLabel: row.status === 'approved' ? 'Aprobada reciente' : 'Rechazada reciente', priceLabel: moneyLabel(String(row.suggested_net_price), row.currency), previousApprovedPrice: previous ? String(previous.suggested_net_price) : null, deltaAbs: delta.abs, deltaPct: delta.pct, origin: fromMonitor ? 'monitor' : row.import_batch_id ? 'batch' : 'manual', date: row.approved_at ?? row.observed_at, reason: row.status === 'approved' ? 'Aprobacion reciente' : (row.rejection_reason ?? 'Rechazada sin motivo registrado'), suggestedAction: 'Ver historico del recurso', href: `/catalog/resources/${row.resource_id}/price-intelligence` };
    });

    return {
      kpis: { pendingCount: pendingCount.count ?? pendingViews.length, pendingWithWarningsCount: pendingViews.filter((o) => o.warnings.length > 0).length, monitorPendingCount: pendingViews.filter((o) => o.fromMonitor).length, resourcesWithoutApprovedCount: coverageRaw.filter((i) => i.signal === 'missing_approved_price').length, staleApprovedCount: coverageRaw.filter((i) => i.signal === 'stale_price').length, failingOrOverdueTargetsCount: sourceHealthRaw.filter((i) => i.signal === 'target_failing' || i.signal === 'target_overdue').length },
      urgent: urgentRaw.slice(0, cfg.urgent),
      coverage: coverageRaw.slice(0, cfg.coverage),
      sourceHealth: sourceHealthRaw.sort((a, b) => severityRank(a) - severityRank(b)).slice(0, cfg.sourceHealth),
      recentActivity: recentActivity.slice(0, cfg.recentActivity),
      limits: { urgent: cfg.urgent, coverage: cfg.coverage, sourceHealth: cfg.sourceHealth, recentActivity: cfg.recentActivity, resourceScan: cfg.resourceScan },
      hasMore: { urgent: urgentRaw.length > cfg.urgent, coverage: coverageRaw.length > cfg.coverage, sourceHealth: sourceHealthRaw.length > cfg.sourceHealth, recentActivity: recentActivity.length > cfg.recentActivity },
      notes: ['Delta derivado contra el ultimo approved anterior; si no existe, se muestra "Sin precio anterior aprobado".', `Cobertura calculada sobre un muestreo operativo acotado de ${cfg.resourceScan} recursos para evitar carga completa.`],
    };
  }

  async getObservationStatuses(
    viewer: AuthenticatedViewer,
    observationIds: Uuid[],
  ): Promise<Array<{ id: Uuid; status: string; importBatchId: Uuid | null }>> {
    const supabase = await this.clientFactory();
    const out: Array<{ id: Uuid; status: string; importBatchId: Uuid | null }> = [];
    for (let i = 0; i < observationIds.length; i += 200) {
      const chunk = observationIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from('resource_price_observations')
        .select('id, status, import_batch_id')
        .eq('organization_id', viewer.organizationId)
        .in('id', chunk);
      if (error) throw new Error(`review_status_read_failed: ${error.code ?? 'unknown'}`);
      for (const r of (data ?? []) as Array<{ id: string; status: string; import_batch_id: string | null }>) {
        out.push({ id: r.id, status: r.status, importBatchId: r.import_batch_id });
      }
    }
    return out;
  }

  async findBulkActionByKey(
    viewer: AuthenticatedViewer,
    idempotencyKey: string,
  ): Promise<BulkActionRecord | null> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_observation_bulk_actions')
      .select(
        'id, action_type, import_batch_id, created_at, selected_count, succeeded_count, skipped_count, idempotency_key, metadata',
      )
      .eq('organization_id', viewer.organizationId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(`review_action_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) return null;
    const r = data as {
      id: string;
      action_type: string;
      import_batch_id: string | null;
      created_at: string;
      selected_count: number;
      succeeded_count: number;
      skipped_count: number;
      idempotency_key: string;
      metadata: Record<string, unknown> | null;
    };
    return {
      id: r.id,
      actionType: r.action_type as 'approve' | 'reject',
      importBatchId: r.import_batch_id,
      createdAt: r.created_at,
      selectedCount: r.selected_count,
      succeededCount: r.succeeded_count,
      skippedCount: r.skipped_count,
      idempotencyKey: r.idempotency_key,
      metadata: r.metadata ?? {},
    };
  }

  async createBulkAction(
    viewer: AuthenticatedViewer,
    input: {
      actionType: 'approve' | 'reject';
      importBatchId: Uuid | null;
      selectedCount: number;
      idempotencyKey: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<Uuid> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_observation_bulk_actions')
      .insert({
        organization_id: viewer.organizationId,
        action_type: input.actionType,
        import_batch_id: input.importBatchId,
        initiated_by: viewer.profileId,
        selected_count: input.selectedCount,
        succeeded_count: 0,
        skipped_count: 0,
        idempotency_key: input.idempotencyKey,
        metadata: input.metadata,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw new BulkActionDuplicateError(input.idempotencyKey);
      throw new Error(`review_action_create_failed: ${error.code ?? 'unknown'}`);
    }
    return (data as { id: string }).id;
  }

  async completeBulkAction(
    viewer: AuthenticatedViewer,
    actionId: Uuid,
    update: {
      succeededCount: number;
      skippedCount: number;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const supabase = await this.clientFactory();
    const { error } = await supabase
      .from('price_observation_bulk_actions')
      .update({
        succeeded_count: update.succeededCount,
        skipped_count: update.skippedCount,
        metadata: update.metadata,
      })
      .eq('id', actionId)
      .eq('organization_id', viewer.organizationId);
    if (error) throw new Error(`review_action_complete_failed: ${error.code ?? 'unknown'}`);
  }

  async bulkUpdateStatus(
    viewer: AuthenticatedViewer,
    observationIds: Uuid[],
    update:
      | { status: 'approved' }
      | { status: 'rejected'; rejectionReason: string },
  ): Promise<Uuid[]> {
    const supabase = await this.clientFactory();
    const updated: Uuid[] = [];
    const nowIso = new Date().toISOString();
    const patch =
      update.status === 'approved'
        ? { status: 'approved', approved_by: viewer.profileId, approved_at: nowIso }
        : {
            status: 'rejected',
            approved_by: viewer.profileId,
            approved_at: nowIso,
            rejection_reason: update.rejectionReason,
          };

    for (let i = 0; i < observationIds.length; i += BULK_UPDATE_CHUNK) {
      const chunk = observationIds.slice(i, i + BULK_UPDATE_CHUNK);
      // Un solo statement por chunk: el filtro status='pending' garantiza que
      // approved/rejected/expired jamás se sobrescriben (idempotencia natural).
      const { data, error } = await supabase
        .from('resource_price_observations')
        .update(patch)
        .eq('organization_id', viewer.organizationId)
        .eq('status', 'pending')
        .in('id', chunk)
        .select('id');
      if (error) throw new Error(`review_bulk_update_failed: ${error.code ?? 'unknown'}`);
      for (const r of (data ?? []) as Array<{ id: string }>) updated.push(r.id);
    }
    return updated;
  }
}
