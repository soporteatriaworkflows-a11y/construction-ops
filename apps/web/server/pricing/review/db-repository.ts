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
import type { SupabaseClient } from '@supabase/supabase-js';
import { BulkActionDuplicateError } from './errors';
import { computeReviewWarnings, BULK_UPDATE_CHUNK } from './validation';
import type {
  AuthenticatedViewer,
  BulkActionRecord,
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
