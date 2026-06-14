/**
 * db-repository.ts — Acceso a datos del importador de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1). Propiedad: agent-orchestrator.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id / imported_by SIEMPRE server-side (RLS los exige).
 *  - La escritura del lote es ATÓMICA vía RPC `import_quantity_takeoff_batch`
 *    (SECURITY INVOKER: la RLS aplica a cada INSERT/UPDATE).
 *  - boq_items SOLO se lee; el vínculo vive en quantity_takeoff_groups.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Uuid, DecimalString } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { TakeoffLinkableVersion } from '@/lib/quantity-import/types';
import type { BoqTakeoffCandidate } from './matching';
import { QuantityLinkVersionInvalidError } from './errors';

const PAGE_SIZE = 1000;
const EDITABLE_STATUSES = ['draft', 'review'] as const;

/** Payload de la RPC import_quantity_takeoff_batch (contrato §7.D). */
export interface QuantityBatchRpcPayload {
  batch: {
    digestSha256: string;
    sourceFilename: string;
    sourceSheet: string;
    unresolvedCount: number;
    warningCount: number;
    metadata: Record<string, unknown>;
  };
  groups: Array<{
    visibleCode: string | null;
    itemCode: string | null;
    description: string;
    unit: string | null;
    sourceRow: number;
    occurrenceIndex: number;
    totalCalculated: DecimalString;
    boqItemId: Uuid | null;
    metadata: Record<string, unknown>;
    lines: Array<{
      description: string | null;
      formulaType: string;
      length: DecimalString | null;
      width: DecimalString | null;
      height: DecimalString | null;
      count: DecimalString | null;
      rawValues: Record<string, unknown>;
      sourceRow: number;
      subtotalCalculated: DecimalString;
      sortOrder: number;
    }>;
  }>;
  versionId: Uuid | null;
}

/** Resultado crudo de la RPC. */
export interface QuantityBatchRpcResult {
  duplicate: boolean;
  batchId: Uuid;
  groupsCreated: number;
  linesCreated: number;
  linkedBoqItems: number;
  linkedItems?: Array<{ groupSourceRow: string; boqItemId: string }>;
}

export class DbQuantityImportRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Versiones EDITABLES (draft|review) candidatas para vinculación BOQ. */
  async listLinkableVersions(viewer: AuthenticatedViewer): Promise<TakeoffLinkableVersion[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, status, version_number, estimates(code, name)')
      .in('status', [...EDITABLE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`linkable_versions_failed: ${error.code ?? 'unknown'}`);

    const options: TakeoffLinkableVersion[] = [];
    for (const row of (data ?? []) as Array<{
      id: string;
      status: string;
      version_number: number;
      estimates: { code: string; name: string } | { code: string; name: string }[] | null;
    }>) {
      const estimate = Array.isArray(row.estimates) ? row.estimates[0] : row.estimates;
      const { count: itemCount, error: countError } = await supabase
        .from('boq_items')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', row.id)
        .is('archived_at', null);
      if (countError) throw new Error(`linkable_versions_failed: ${countError.code ?? 'unknown'}`);
      options.push({
        versionId: row.id,
        label: `${estimate?.name ?? 'Presupuesto'} — V${String(row.version_number).padStart(2, '0')}`,
        status: row.status,
        itemCount: itemCount ?? 0,
      });
    }
    return options;
  }

  /**
   * Ítems BOQ candidatos de la versión objetivo (no archivados, orden estable
   * sort_order/id para el pareo por occurrence), marcando los que YA tienen
   * un takeoff group vinculado (jamás se reemplazan).
   */
  async listBoqCandidates(
    viewer: AuthenticatedViewer,
    versionId: Uuid,
  ): Promise<BoqTakeoffCandidate[]> {
    const supabase = await this.clientFactory();
    const { data: version, error: versionError } = await supabase
      .from('estimate_versions')
      .select('id, status')
      .eq('id', versionId)
      .maybeSingle();
    if (versionError) throw new Error(`link_version_failed: ${versionError.code ?? 'unknown'}`);
    if (!version) throw new QuantityLinkVersionInvalidError();
    if (!(EDITABLE_STATUSES as readonly string[]).includes((version as { status: string }).status)) {
      throw new QuantityLinkVersionInvalidError(
        'La versión seleccionada está emitida/aprobada/archivada; la vinculación solo aplica a versiones editables.',
      );
    }

    // Ítems con takeoff existente (cualquier batch) ⇒ skipped_existing.
    const linkedIds = new Set<string>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('quantity_takeoff_groups')
        .select('boq_item_id')
        .not('boq_item_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`takeoff_links_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as Array<{ boq_item_id: string | null }>;
      for (const r of rows) if (r.boq_item_id) linkedIds.add(r.boq_item_id);
      if (rows.length < PAGE_SIZE) break;
    }

    const items: BoqTakeoffCandidate[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('boq_items')
        .select('id, code, description_snapshot, unit_snapshot, sort_order')
        .eq('estimate_version_id', versionId)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`boq_candidates_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as Array<{
        id: string;
        code: string;
        description_snapshot: string;
        unit_snapshot: string;
      }>;
      for (const r of rows) {
        items.push({
          id: r.id,
          code: r.code,
          description: r.description_snapshot,
          unit: r.unit_snapshot,
          alreadyLinked: linkedIds.has(r.id),
        });
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return items;
  }

  /** Ejecuta la RPC atómica de importación (RLS-bound, SECURITY INVOKER). */
  async importBatch(
    _viewer: AuthenticatedViewer,
    payload: QuantityBatchRpcPayload,
  ): Promise<QuantityBatchRpcResult> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('import_quantity_takeoff_batch', {
      p_batch: payload.batch,
      p_groups: payload.groups,
      p_version_id: payload.versionId,
    });
    if (error) throw new Error(`quantity_import_rpc_failed: ${error.code ?? error.message}`);
    return data as QuantityBatchRpcResult;
  }

  /** Lee los lotes importados de la org con sus grupos (para /quantities). */
  async listImportedBatches(
    _viewer: AuthenticatedViewer,
  ): Promise<import('@/lib/quantity-import/types').ImportedBatchSummary[]> {
    const supabase = await this.clientFactory();

    // Batches más recientes primero, máx 50.
    const { data: batches, error: batchErr } = await supabase
      .from('quantity_import_batches')
      .select('id, source_filename, source_sheet, imported_at, total_groups, total_lines, linked_boq_items')
      .order('imported_at', { ascending: false })
      .limit(50);
    if (batchErr || !batches) return [];

    const results: import('@/lib/quantity-import/types').ImportedBatchSummary[] = [];
    for (const batch of batches as Array<{
      id: string;
      source_filename: string;
      source_sheet: string;
      imported_at: string;
      total_groups: number;
      total_lines: number;
      linked_boq_items: number;
    }>) {
      const { data: groups, error: groupErr } = await supabase
        .from('quantity_takeoff_groups')
        .select('id, description, unit, total_calculated, boq_item_id')
        .eq('import_batch_id', batch.id)
        .order('source_row', { ascending: true })
        .limit(500);
      if (groupErr) continue;

      const groupRows = (groups ?? []) as Array<{
        id: string;
        description: string;
        unit: string | null;
        total_calculated: string;
        boq_item_id: string | null;
      }>;

      // Conteo de líneas por grupo en una sola consulta.
      const groupIds = groupRows.map((g) => g.id);
      const lineCounts = new Map<string, number>();
      if (groupIds.length > 0) {
        const { data: lineData } = await supabase
          .from('quantity_takeoff_lines')
          .select('group_id')
          .in('group_id', groupIds);
        for (const row of (lineData ?? []) as Array<{ group_id: string }>) {
          lineCounts.set(row.group_id, (lineCounts.get(row.group_id) ?? 0) + 1);
        }
      }

      results.push({
        batchId: batch.id,
        sourceFilename: batch.source_filename,
        sourceSheet: batch.source_sheet,
        importedAt: batch.imported_at,
        groupsCount: batch.total_groups,
        linesCount: batch.total_lines,
        linkedBoqItems: batch.linked_boq_items,
        groups: groupRows.map((g) => ({
          id: g.id,
          description: g.description,
          unit: g.unit,
          totalCalculated: g.total_calculated,
          lineCount: lineCounts.get(g.id) ?? 0,
          boqItemId: g.boq_item_id,
        })),
      });
    }
    return results;
  }
}
