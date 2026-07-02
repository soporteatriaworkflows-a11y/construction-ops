/**
 * db-observation-repository.ts — Repositorio DB de observaciones de precio (Fase 3A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md §4.
 *
 * Reglas:
 *  - Append-only: INSERT + UPDATE de revisión solamente.
 *  - created_by = viewer.profileId (server-side, nunca del navegador).
 *  - approved_by = viewer.profileId (server-side al aprobar/rechazar).
 *  - RLS garantiza aislamiento por org y restricciones de rol.
 *  - isStale calculado en tiempo de ejecución.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  ResourcePriceObservationView,
  ResourcePriceHistoryRow,
  CreateObservationInput,
  ApproveObservationInput,
  RejectObservationInput,
  ResourcePriceIntelligenceSummary,
  PriceObservationRepository,
  Uuid,
} from './types';
import {
  ObservationNotFoundError,
  ObservationAlreadyReviewedError,
  InsufficientRoleError,
} from './errors';
import { validateCreateObservationInput, computeIsStale } from './validation';

const OBS_COLUMNS = `
  id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, valid_until, status, notes,
  created_at, approved_at, rejection_reason,
  suppliers ( name )
`;


const HISTORY_COLUMNS = `
  id, resource_id, supplier_id,
  observed_price, discount_percent, suggested_net_price,
  unit, currency, source_type, source_reference,
  observed_at, valid_until, status, notes,
  created_at, approved_at, rejection_reason, import_batch_id,
  suppliers ( name ),
  price_observation_batches ( label, source_reference )
`;

interface HistoryObsRow extends ObsRow {
  import_batch_id: string | null;
  price_observation_batches:
    | { label: string | null; source_reference: string | null }
    | Array<{ label: string | null; source_reference: string | null }>
    | null;
}

interface MonitorHistoryRow {
  id: string;
  observation_id: string | null;
  status: string;
  checked_at: string;
  warnings: unknown;
}

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2);
}

function computeDelta(current: string, previous: string | null): { abs: string | null; pct: string | null } {
  if (!previous) return { abs: null, pct: null };
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) {
    return { abs: null, pct: null };
  }
  const abs = currentNumber - previousNumber;
  return {
    abs: toDecimalString(abs),
    pct: toDecimalString((abs / previousNumber) * 100),
  };
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
  valid_until: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
  // Supabase returns related row as array for FK joins
  suppliers: Array<{ name: string }> | { name: string } | null;
}

function toView(row: ObsRow): ResourcePriceObservationView {
  const supplierName = Array.isArray(row.suppliers)
    ? (row.suppliers[0]?.name ?? null)
    : (row.suppliers?.name ?? null);
  return {
    id: row.id,
    resourceId: row.resource_id,
    supplierId: row.supplier_id,
    supplierName,
    observedPrice: String(row.observed_price),
    discountPercent: String(row.discount_percent),
    suggestedNetPrice: String(row.suggested_net_price),
    unit: row.unit,
    currency: row.currency,
    sourceType: row.source_type as ResourcePriceObservationView['sourceType'],
    sourceReference: row.source_reference,
    observedAt: row.observed_at,
    validUntil: row.valid_until,
    status: row.status as ResourcePriceObservationView['status'],
    isStale: computeIsStale(row.status, row.approved_at, row.valid_until),
    notes: row.notes,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
  };
}

// ViewerRole values for approve/reject (management=gerencia, internal=admin/presupuestos/compras)
// DB RLS restricts actual UPDATE to admin+gerencia; this is application-level defense.
const APPROVE_ROLES = ['management', 'internal'] as const;

export class DbObservationRepository implements PriceObservationRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  async countPendingResourcePriceObservations(viewer: AuthenticatedViewer): Promise<number> {
    const supabase = await this.clientFactory();
    const { count, error } = await supabase
      .from('resource_price_observations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', viewer.organizationId)
      .eq('status', 'pending');
    if (error) throw new Error(`observation_count_failed: ${error.code ?? 'unknown'}`);
    return count ?? 0;
  }

  async listResourcePriceObservations(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceObservationView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('resource_price_observations')
      .select(OBS_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`observation_list_failed: ${error.code ?? 'unknown'}`);
    return ((data as unknown) as ObsRow[]).map(toView);
  }

  async listResourcePriceHistory(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
    limit: number,
  ): Promise<ResourcePriceHistoryRow[]> {
    const supabase = await this.clientFactory();
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const { data, error } = await supabase
      .from('resource_price_observations')
      .select(HISTORY_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .eq('resource_id', resourceId)
      .order('observed_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw new Error(`price_history_list_failed: ${error.code ?? 'unknown'}`);
    const rows = ((data ?? []) as unknown) as HistoryObsRow[];
    if (rows.length === 0) return [];

    const { data: approvedData, error: approvedError } = await supabase
      .from('resource_price_observations')
      .select('id, observed_at, suggested_net_price')
      .eq('organization_id', viewer.organizationId)
      .eq('resource_id', resourceId)
      .eq('status', 'approved')
      .order('observed_at', { ascending: false })
      .limit(200);
    if (approvedError) throw new Error(`price_history_approved_failed: ${approvedError.code ?? 'unknown'}`);

    const observationIds = rows.map((r) => r.id);
    const monitorByObservation = new Map<string, MonitorHistoryRow>();
    const { data: monitorData, error: monitorError } = await supabase
      .from('price_monitor_results')
      .select('id, observation_id, status, checked_at, warnings')
      .eq('organization_id', viewer.organizationId)
      .in('observation_id', observationIds);
    if (monitorError) throw new Error(`price_history_monitor_failed: ${monitorError.code ?? 'unknown'}`);
    for (const monitor of ((monitorData ?? []) as unknown) as MonitorHistoryRow[]) {
      if (monitor.observation_id) monitorByObservation.set(monitor.observation_id, monitor);
    }

    const approvedRows = (((approvedData ?? []) as unknown) as Array<{ id: string; observed_at: string; suggested_net_price: string }>);

    return rows.map((row) => {
      const supplier = one(row.suppliers);
      const batch = one(row.price_observation_batches);
      const monitor = monitorByObservation.get(row.id) ?? null;
      const previous = approvedRows.find((candidate) => {
        if (candidate.id === row.id) return false;
        return new Date(candidate.observed_at).getTime() < new Date(row.observed_at).getTime();
      }) ?? null;
      const delta = computeDelta(String(row.suggested_net_price), previous ? String(previous.suggested_net_price) : null);
      const origin = monitor ? 'monitor' : row.import_batch_id ? 'batch' : 'manual';

      return {
        id: row.id,
        resourceId: row.resource_id,
        supplierId: row.supplier_id,
        supplierName: supplier?.name ?? null,
        observedPrice: String(row.observed_price),
        discountPercent: String(row.discount_percent),
        suggestedNetPrice: String(row.suggested_net_price),
        currency: row.currency,
        unit: row.unit,
        status: row.status as ResourcePriceHistoryRow['status'],
        sourceType: row.source_type as ResourcePriceHistoryRow['sourceType'],
        sourceReference: row.source_reference,
        observedAt: row.observed_at,
        validUntil: row.valid_until,
        approvedAt: row.approved_at,
        rejectionReason: row.rejection_reason,
        notes: row.notes,
        importBatchId: row.import_batch_id,
        importBatchLabel: batch?.label ?? null,
        importBatchSourceReference: batch?.source_reference ?? null,
        monitorResultId: monitor?.id ?? null,
        monitorResultStatus: monitor?.status ?? null,
        monitorCheckedAt: monitor?.checked_at ?? null,
        monitorWarnings: Array.isArray(monitor?.warnings) ? (monitor.warnings as string[]) : [],
        previousApprovedPrice: previous ? String(previous.suggested_net_price) : null,
        deltaAbs: delta.abs,
        deltaPct: delta.pct,
        origin,
      };
    });
  }

  async createResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: CreateObservationInput,
  ): Promise<ResourcePriceObservationView> {
    const normalized = validateCreateObservationInput(input);
    const supabase = await this.clientFactory();

    const { data, error } = await supabase
      .from('resource_price_observations')
      .insert({
        organization_id: viewer.organizationId,
        resource_id: normalized.resourceId,
        supplier_id: normalized.supplierId ?? null,
        observed_price: normalized.observedPrice,
        discount_percent: normalized.discountPercent ?? '0',
        // suggested_net_price is DB-computed by trigger — send placeholder 0
        // (trigger overwrites it before INSERT completes)
        suggested_net_price: '0',
        unit: normalized.unit,
        currency: normalized.currency ?? 'COP',
        source_type: normalized.sourceType,
        source_reference: normalized.sourceReference ?? null,
        observed_at: normalized.observedAt,
        valid_until: normalized.validUntil ?? null,
        status: 'pending',
        notes: normalized.notes ?? null,
        created_by: viewer.profileId,
      })
      .select(OBS_COLUMNS)
      .single();

    if (error) throw new Error(`observation_create_failed: ${error.code ?? 'unknown'}`);
    return toView((data as unknown) as ObsRow);
  }

  async approveResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: ApproveObservationInput,
  ): Promise<ResourcePriceObservationView> {
    if (!(APPROVE_ROLES as readonly string[]).includes(viewer.role)) {
      throw new InsufficientRoleError('management|internal', viewer.role);
    }
    const supabase = await this.clientFactory();

    // Verificar estado actual
    const { data: current, error: readErr } = await supabase
      .from('resource_price_observations')
      .select('id, status, organization_id')
      .eq('id', input.observationId)
      .eq('organization_id', viewer.organizationId)
      .maybeSingle();

    if (readErr) throw new Error(`observation_read_failed: ${readErr.code ?? 'unknown'}`);
    if (!current) throw new ObservationNotFoundError(input.observationId);
    if ((current as { status: string }).status !== 'pending') {
      throw new ObservationAlreadyReviewedError(
        input.observationId,
        (current as { status: string }).status,
      );
    }

    const { data, error } = await supabase
      .from('resource_price_observations')
      .update({
        status: 'approved',
        approved_by: viewer.profileId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', input.observationId)
      .eq('organization_id', viewer.organizationId)
      .select(OBS_COLUMNS)
      .single();

    if (error) throw new Error(`observation_approve_failed: ${error.code ?? 'unknown'}`);
    return toView((data as unknown) as ObsRow);
  }

  async rejectResourcePriceObservation(
    viewer: AuthenticatedViewer,
    input: RejectObservationInput,
  ): Promise<ResourcePriceObservationView> {
    if (!(APPROVE_ROLES as readonly string[]).includes(viewer.role)) {
      throw new InsufficientRoleError('management|internal', viewer.role);
    }
    if (!input.rejectionReason?.trim()) {
      throw new Error('rejection_reason_required');
    }
    const supabase = await this.clientFactory();

    const { data: current, error: readErr } = await supabase
      .from('resource_price_observations')
      .select('id, status, organization_id')
      .eq('id', input.observationId)
      .eq('organization_id', viewer.organizationId)
      .maybeSingle();

    if (readErr) throw new Error(`observation_read_failed: ${readErr.code ?? 'unknown'}`);
    if (!current) throw new ObservationNotFoundError(input.observationId);
    if ((current as { status: string }).status !== 'pending') {
      throw new ObservationAlreadyReviewedError(
        input.observationId,
        (current as { status: string }).status,
      );
    }

    const { data, error } = await supabase
      .from('resource_price_observations')
      .update({
        status: 'rejected',
        approved_by: viewer.profileId,
        approved_at: new Date().toISOString(),
        rejection_reason: input.rejectionReason.trim(),
      })
      .eq('id', input.observationId)
      .eq('organization_id', viewer.organizationId)
      .select(OBS_COLUMNS)
      .single();

    if (error) throw new Error(`observation_reject_failed: ${error.code ?? 'unknown'}`);
    return toView((data as unknown) as ObsRow);
  }

  async getResourcePriceIntelligenceSummary(
    viewer: AuthenticatedViewer,
    resourceId: Uuid,
  ): Promise<ResourcePriceIntelligenceSummary | null> {
    const supabase = await this.clientFactory();

    // Resource info
    const { data: resource, error: resErr } = await supabase
      .from('resources')
      .select('id, code, name, unit')
      .eq('id', resourceId)
      .eq('organization_id', viewer.organizationId)
      .maybeSingle();

    if (resErr) throw new Error(`resource_read_failed: ${resErr.code ?? 'unknown'}`);
    if (!resource) return null;

    const r = resource as { id: string; code: string; name: string; unit: string };

    // Observations for this resource
    const { data: obs, error: obsErr } = await supabase
      .from('resource_price_observations')
      .select('status, approved_at, valid_until, observed_price')
      .eq('organization_id', viewer.organizationId)
      .eq('resource_id', resourceId);

    if (obsErr) throw new Error(`observation_summary_failed: ${obsErr.code ?? 'unknown'}`);

    const rows = (obs ?? []) as Array<{
      status: string;
      approved_at: string | null;
      valid_until: string | null;
      observed_price: string;
    }>;

    const approvedRows = rows.filter((o) => o.status === 'approved');
    const pendingCount = rows.filter((o) => o.status === 'pending').length;

    // Latest approved
    const latest = approvedRows.at(0) ?? null;
    const latestApprovedIsStale = latest
      ? computeIsStale('approved', latest.approved_at, latest.valid_until)
      : false;

    return {
      resourceId,
      resourceCode: r.code,
      resourceName: r.name,
      resourceUnit: r.unit,
      approvedCount: approvedRows.length,
      pendingCount,
      latestApprovedPrice: latest ? String(latest.observed_price) : null,
      latestApprovedAt: latest?.approved_at ?? null,
      latestApprovedIsStale,
    };
  }
}
