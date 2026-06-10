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
