/**
 * db-repository.ts — Acceso a datos de la reconciliación APU
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1).
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id SIEMPRE server-side (RLS lo exige).
 *  - Las mutaciones pasan por RPCs SECURITY INVOKER (reconcile_apu_component /
 *    reconcile_apu_components_bulk / update_apu_component_reconciliation): la RLS
 *    y el guard de rol aplican a cada escritura. JAMÁS UPDATE directo.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Uuid, DecimalString } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import { DbApuImportRepository } from '@/server/apu-import';
import type {
  ApuBoqLinkView,
  ApuImportBatchInfo,
  BulkReconcilePair,
  BulkReconcileResult,
  ReconcileActionResult,
} from '@/lib/apu-reconciliation/types';
import type { RawReconciliationComponent } from './domain';

const PAGE_SIZE = 1000;

interface ComponentRow {
  id: string;
  resource_id: string | null;
  labor_role_id: string | null;
  component_type: string;
  unit_price_source: string;
  reconciliation_state: string;
  raw_code: string | null;
  raw_unit: string | null;
  notes: string | null;
  quantity: number | string;
  waste_pct: number | string;
  unit_price_snapshot: number | string;
  total_component_cost: number | string;
  apu_template_id: string;
  apu_templates:
    | { code: string; name: string; organization_id: string; import_batch_id: string | null }
    | { code: string; name: string; organization_id: string; import_batch_id: string | null }[]
    | null;
}

export class DbApuReconciliationRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;
  private readonly importRepo: DbApuImportRepository;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
    this.importRepo = new DbApuImportRepository(clientFactory);
  }

  /** Identidades de recursos de la org (reusa el repositorio del importador). */
  listResourceIdentifiers(viewer: AuthenticatedViewer): Promise<ResourceIdentifier[]> {
    return this.importRepo.listResourceIdentifiers(viewer);
  }

  /** Precios baseline aprobados por recurso (reusa el repositorio del importador). */
  getApprovedBaselinePrices(
    viewer: AuthenticatedViewer,
    resourceIds: ReadonlyArray<Uuid>,
  ): Promise<Map<Uuid, DecimalString>> {
    return this.importRepo.getApprovedBaselinePrices(viewer, resourceIds);
  }

  /**
   * Todos los componentes APU de la organización (con su plantilla). RLS filtra
   * por org; el filtro explícito por `apu_templates.organization_id` es la
   * segunda barrera.
   */
  async listComponents(
    viewer: AuthenticatedViewer,
  ): Promise<RawReconciliationComponent[]> {
    const supabase = await this.clientFactory();
    const out: RawReconciliationComponent[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('apu_components')
        .select(
          'id, resource_id, labor_role_id, component_type, unit_price_source, reconciliation_state, raw_code, raw_unit, notes, quantity, waste_pct, unit_price_snapshot, total_component_cost, apu_template_id, apu_templates!inner(code, name, organization_id, import_batch_id)',
        )
        .eq('apu_templates.organization_id', viewer.organizationId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`reconciliation_components_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as unknown as ComponentRow[];
      for (const r of rows) {
        const tpl = Array.isArray(r.apu_templates) ? r.apu_templates[0] : r.apu_templates;
        out.push({
          componentId: r.id,
          apuTemplateId: r.apu_template_id,
          apuCode: tpl?.code ?? '',
          apuName: tpl?.name ?? '',
          componentType: r.component_type,
          resourceId: r.resource_id,
          laborRoleId: r.labor_role_id,
          unitPriceSource: r.unit_price_source,
          reconciliationState: r.reconciliation_state,
          rawCode: r.raw_code,
          rawUnit: r.raw_unit,
          notes: r.notes,
          quantity: String(r.quantity),
          wastePct: String(r.waste_pct),
          unitPriceSnapshot: String(r.unit_price_snapshot),
          totalComponentCost: String(r.total_component_cost),
          importBatchId: tpl?.import_batch_id ?? null,
        });
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return out;
  }

  /** Componentes de una sola plantilla APU. */
  async listComponentsByTemplate(
    viewer: AuthenticatedViewer,
    apuTemplateId: Uuid,
  ): Promise<RawReconciliationComponent[]> {
    const all = await this.listComponents(viewer);
    return all.filter((c) => c.apuTemplateId === apuTemplateId);
  }

  /** Lotes de importación APU de la org (origen/trazabilidad). */
  async listImportBatches(viewer: AuthenticatedViewer): Promise<ApuImportBatchInfo[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('apu_import_batches')
      .select('id, source_filename, source_sheet, imported_at, imported_by')
      .eq('organization_id', viewer.organizationId)
      .order('imported_at', { ascending: false });
    if (error) throw new Error(`reconciliation_batches_failed: ${error.code ?? 'unknown'}`);
    const rows = (data ?? []) as Array<{
      id: string;
      source_filename: string;
      source_sheet: string;
      imported_at: string;
      imported_by: string;
    }>;
    const importerIds = [...new Set(rows.map((r) => r.imported_by))];
    const names = new Map<string, string>();
    if (importerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', importerIds);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) {
        names.set(p.id, p.full_name);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      sourceFilename: r.source_filename,
      sourceSheet: r.source_sheet,
      importedAt: r.imported_at,
      importedByName: names.get(r.imported_by) ?? null,
    }));
  }

  /**
   * IDs de plantillas APU vinculadas a algún ítem BOQ no archivado. La RLS de
   * boq_items ya restringe a la organización del viewer (segunda barrera).
   */
  async listLinkedApuTemplateIds(_viewer: AuthenticatedViewer): Promise<Set<Uuid>> {
    const supabase = await this.clientFactory();
    const linked = new Set<Uuid>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('boq_items')
        .select('apu_template_id')
        .not('apu_template_id', 'is', null)
        .is('archived_at', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) break; // no bloquea la biblioteca; el badge BOQ simplemente no se marca.
      const rows = (data ?? []) as Array<{ apu_template_id: string | null }>;
      for (const r of rows) if (r.apu_template_id) linked.add(r.apu_template_id);
      if (rows.length < PAGE_SIZE) break;
    }
    return linked;
  }

  /** Ítems BOQ (no archivados) vinculados a una plantilla APU. */
  async listApuBoqLinks(
    _viewer: AuthenticatedViewer,
    apuTemplateId: Uuid,
  ): Promise<ApuBoqLinkView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select(
        'id, code, description_snapshot, unit_snapshot, quantity_snapshot, unit_price_snapshot, subtotal, estimate_versions(version_number, status, estimates(name))',
      )
      .eq('apu_template_id', apuTemplateId)
      .is('archived_at', null)
      .order('code', { ascending: true });
    if (error) return [];
    const rows = (data ?? []) as Array<{
      id: string;
      code: string;
      description_snapshot: string;
      unit_snapshot: string;
      quantity_snapshot: number | string;
      unit_price_snapshot: number | string;
      subtotal: number | string;
      estimate_versions:
        | { version_number: number; status: string; estimates: { name: string } | { name: string }[] | null }
        | { version_number: number; status: string; estimates: { name: string } | { name: string }[] | null }[]
        | null;
    }>;
    return rows.map((r) => {
      const ev = Array.isArray(r.estimate_versions) ? r.estimate_versions[0] : r.estimate_versions;
      const est = ev ? (Array.isArray(ev.estimates) ? ev.estimates[0] : ev.estimates) : null;
      return {
        boqItemId: r.id,
        code: r.code,
        description: r.description_snapshot,
        unit: r.unit_snapshot,
        quantity: String(r.quantity_snapshot),
        unitPrice: String(r.unit_price_snapshot),
        subtotal: String(r.subtotal),
        estimateName: est?.name ?? 'Presupuesto',
        versionNumber: ev?.version_number ?? 0,
        versionStatus: ev?.status ?? '',
      };
    });
  }

  /** RPC: asociar/confirmar un componente individual. */
  async reconcileComponent(
    componentId: Uuid,
    resourceId: Uuid,
    keepSnapshot: boolean,
    idempotencyKey: string | null,
  ): Promise<ReconcileActionResult> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('reconcile_apu_component', {
      p_component_id: componentId,
      p_resource_id: resourceId,
      p_keep_snapshot: keepSnapshot,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(`reconcile_rpc_failed: ${error.code ?? error.message}`);
    return data as ReconcileActionResult;
  }

  /** RPC: asociación masiva (máx 50 pares). */
  async reconcileBulk(
    pairs: ReadonlyArray<BulkReconcilePair>,
    keepSnapshot: boolean,
    idempotencyKey: string | null,
  ): Promise<BulkReconcileResult> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('reconcile_apu_components_bulk', {
      p_pairs: pairs.map((p) => ({ componentId: p.componentId, resourceId: p.resourceId })),
      p_keep_snapshot: keepSnapshot,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(`reconcile_bulk_rpc_failed: ${error.code ?? error.message}`);
    return data as BulkReconcileResult;
  }

  /** RPC: rechazar / dejar pendiente / limpiar asociación. */
  async updateReconciliation(
    componentId: Uuid,
    action: 'reject' | 'leave_pending' | 'clear',
    idempotencyKey: string | null,
  ): Promise<{ componentId: Uuid; action: string; newState: string }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('update_apu_component_reconciliation', {
      p_component_id: componentId,
      p_action: action,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(`reconcile_update_rpc_failed: ${error.code ?? error.message}`);
    return data as { componentId: Uuid; action: string; newState: string };
  }
}
