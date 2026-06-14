/**
 * db-repository.ts — Acceso a datos del Quantity Workspace + sync a BOQ.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id / created_by SIEMPRE server-side (RLS los exige).
 *  - El resultado de cada línea se recalcula server-side con el motor puro
 *    (`computeQuantityLine`); el navegador nunca fija el resultado.
 *  - La actualización de cantidad BOQ va por RPC `update_boq_item_quantity`
 *    (preserva unit_price_snapshot). La creación reusa `add_apu_to_boq`.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { computeQuantityLine, type FormulaType } from './formula';
import { sumNet } from './formula';

/** Línea a persistir (inputs crudos; el resultado se recalcula aquí). */
export interface WorkspaceLineDraft {
  description?: string | null;
  resultUnit?: string | null;
  formulaType: FormulaType;
  length?: DecimalString | null;
  width?: DecimalString | null;
  height?: DecimalString | null;
  thickness?: DecimalString | null;
  count?: DecimalString | null;
  partialHeight?: DecimalString | null;
  wastePct?: DecimalString | null;
  openingDeduction?: DecimalString | null;
  apuTemplateId?: Uuid | null;
  notes?: string | null;
}

export interface WorkspaceGroupDraft {
  projectScopeId: Uuid;
  code: string;
  name: string;
  floor?: string | null;
  module?: string | null;
  space?: string | null;
  element?: string | null;
  description?: string | null;
  resultUnit: string;
  templateKind: 'generic' | 'mixed_wall';
  lines: WorkspaceLineDraft[];
}

interface ChapterRow { id: string; code: string; name: string; estimate_version_id: string }
interface BoqItemSnapshotRow { id: string; quantity_snapshot: string }

export class DbQuantityWorkspaceRepository {
  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /**
   * Crea un grupo de workspace + sus líneas. Cada resultado se recalcula
   * server-side con el motor puro. organization_id lo resuelve la RPC/RLS vía
   * created_by; aquí se pasa explícito (RLS WITH CHECK exige org del viewer).
   */
  async createGroup(
    viewer: AuthenticatedViewer,
    draft: WorkspaceGroupDraft,
  ): Promise<{ groupId: Uuid; totalNet: DecimalString; lineCount: number }> {
    const supabase = await this.clientFactory();
    const orgId = viewer.organizationId;

    const computed = draft.lines.map((l) => {
      const result = computeQuantityLine({
        formulaType: l.formulaType,
        length: l.length,
        width: l.width,
        height: l.height,
        thickness: l.thickness,
        count: l.count,
        partialHeight: l.partialHeight,
        openingDeduction: l.openingDeduction,
        wastePct: l.wastePct,
      });
      return { draft: l, result };
    });
    const totalNet = sumNet(computed.map((c) => c.result));

    const { data: groupRow, error: gErr } = await supabase
      .from('quantity_workspace_groups')
      .insert({
        organization_id: orgId,
        project_scope_id: draft.projectScopeId,
        code: draft.code,
        name: draft.name,
        floor: draft.floor ?? null,
        module: draft.module ?? null,
        space: draft.space ?? null,
        element: draft.element ?? null,
        description: draft.description ?? null,
        result_unit: draft.resultUnit,
        template_kind: draft.templateKind,
        total_net: totalNet,
        created_by: viewer.profileId ?? null,
      })
      .select('id')
      .single();
    if (gErr) throw new Error(`workspace_group_insert_failed: ${gErr.code ?? gErr.message}`);
    const groupId = (groupRow as { id: string }).id;

    if (computed.length > 0) {
      const rows = computed.map((c, i) => ({
        organization_id: orgId,
        group_id: groupId,
        description: c.draft.description ?? null,
        result_unit: c.draft.resultUnit ?? draft.resultUnit,
        formula_type: c.draft.formulaType,
        length: c.draft.length ?? null,
        width: c.draft.width ?? null,
        height: c.draft.height ?? null,
        thickness: c.draft.thickness ?? null,
        count: c.draft.count ?? null,
        partial_height: c.draft.partialHeight ?? null,
        waste_pct: c.draft.wastePct ?? '0',
        opening_deduction: c.draft.openingDeduction ?? '0',
        result_gross: c.result.resultGross,
        result_net: c.result.resultNet,
        apu_template_id: c.draft.apuTemplateId ?? null,
        notes: c.draft.notes ?? null,
        sort_order: i,
      }));
      const { error: lErr } = await supabase.from('quantity_workspace_lines').insert(rows);
      if (lErr) throw new Error(`workspace_lines_insert_failed: ${lErr.code ?? lErr.message}`);
    }

    return { groupId, totalNet, lineCount: computed.length };
  }

  /** Borra un grupo del workspace (CASCADE borra líneas). No afecta boq_items. */
  async deleteGroup(_viewer: AuthenticatedViewer, groupId: Uuid): Promise<void> {
    const supabase = await this.clientFactory();
    const { error } = await supabase.from('quantity_workspace_groups').delete().eq('id', groupId);
    if (error) throw new Error(`workspace_group_delete_failed: ${error.code ?? error.message}`);
  }

  /** Capítulos de una versión (para elegir destino al crear ítems BOQ). */
  async chaptersForVersion(_viewer: AuthenticatedViewer, versionId: Uuid): Promise<ChapterRow[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, code, name, estimate_version_id')
      .eq('estimate_version_id', versionId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`workspace_chapters_read_failed: ${error.code ?? error.message}`);
    return (data ?? []) as ChapterRow[];
  }

  /** Snapshot de cantidad de ítems BOQ (para el preview antes/después). */
  async boqItemSnapshots(
    _viewer: AuthenticatedViewer,
    boqItemIds: readonly Uuid[],
  ): Promise<Map<Uuid, DecimalString>> {
    const ids = boqItemIds.filter((x): x is Uuid => Boolean(x));
    if (ids.length === 0) return new Map();
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select('id, quantity_snapshot')
      .in('id', [...ids]);
    if (error) throw new Error(`workspace_boq_snapshot_read_failed: ${error.code ?? error.message}`);
    const map = new Map<Uuid, DecimalString>();
    for (const r of (data ?? []) as BoqItemSnapshotRow[]) {
      map.set(r.id, String(r.quantity_snapshot));
    }
    return map;
  }

  /** Crea un ítem BOQ desde una cantidad (reusa add_apu_to_boq) + estampa link. */
  async createBoqItemFromLine(
    _viewer: AuthenticatedViewer,
    params: {
      estimateVersionId: Uuid;
      chapterId: Uuid;
      apuTemplateId: Uuid;
      quantity: DecimalString;
      workspaceLineId: Uuid;
      idempotencyKey?: string;
    },
  ): Promise<{ boqItemId: Uuid; subtotal: DecimalString; status: string }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('add_apu_to_boq', {
      p_estimate_version_id: params.estimateVersionId,
      p_chapter_id: params.chapterId,
      p_apu_template_id: params.apuTemplateId,
      p_quantity: params.quantity,
      p_idempotency_key: params.idempotencyKey ?? null,
    });
    if (error) throw new Error(`add_apu_to_boq_failed: ${error.code ?? error.message}`);
    const r = data as { boqItemId: string; subtotal: string; status: string };
    // Estampa el vínculo en la línea de workspace (UPDATE org-scoped, RLS).
    await supabase
      .from('quantity_workspace_lines')
      .update({ boq_item_id: r.boqItemId })
      .eq('id', params.workspaceLineId);
    return { boqItemId: r.boqItemId, subtotal: r.subtotal, status: r.status };
  }

  /** Actualiza la cantidad de un ítem BOQ editable (RPC; preserva snapshot precio). */
  async updateBoqItemQuantity(
    _viewer: AuthenticatedViewer,
    params: { boqItemId: Uuid; quantity: DecimalString; idempotencyKey?: string },
  ): Promise<{
    boqItemId: Uuid;
    quantityBefore: DecimalString;
    quantityAfter: DecimalString;
    unitPrice: DecimalString;
    subtotal: DecimalString;
    status: string;
  }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('update_boq_item_quantity', {
      p_boq_item_id: params.boqItemId,
      p_quantity: params.quantity,
      p_idempotency_key: params.idempotencyKey ?? null,
    });
    if (error) throw new Error(`update_boq_item_quantity_failed: ${error.code ?? error.message}`);
    const r = data as {
      boqItemId: string; quantityBefore: string; quantityAfter: string;
      unitPrice: string; subtotal: string; status: string;
    };
    return {
      boqItemId: r.boqItemId,
      quantityBefore: r.quantityBefore,
      quantityAfter: r.quantityAfter,
      unitPrice: r.unitPrice,
      subtotal: r.subtotal,
      status: r.status,
    };
  }
}
