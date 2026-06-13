/**
 * selection.ts — Dominio READ-ONLY de selección de export de APU vinculados
 * (APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1).
 *
 * Resuelve `BudgetApuExportSelection`: reutiliza el `EstimateExportPayload` del
 * presupuesto (snapshots BOQ, fuente única financiera) y añade los APU
 * EFECTIVAMENTE vinculados (`boq_items.apu_template_id`), deduplicados, en orden
 * BOQ, con su cálculo actual (read-model `getApuDetail`, fuente única
 * `modules/apu`). NUNCA exporta la biblioteca completa. NO muta datos.
 *
 * Inyectable (deps) para tests deterministas sin BD. Contrato §3–§6.
 */
import Decimal from 'decimal.js';
import type { ViewerContext, ApuDetail } from '@/lib/contracts/read-model';
import type { Uuid } from '@/lib/utils/types';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import type {
  ApuBoqLink,
  BudgetApuExportSelection,
  LinkedApuView,
  VersionApuLinkRow,
} from '@/lib/estimates/apu-export-types';

/** Estados de versión de la familia EMITIDA (documento histórico inmutable). */
const EMITTED_STATUSES = new Set(['issued', 'approved', 'archived']);

/** Dependencias inyectables del resolver (RLS-bound en producción). */
export interface ApuExportSelectionDeps {
  getPayload(
    viewer: ViewerContext,
    estimateId: Uuid,
    versionId?: Uuid,
  ): Promise<EstimateExportPayload>;
  getApuLinks(
    viewer: ViewerContext,
    estimateId: Uuid,
    versionId?: Uuid,
  ): Promise<VersionApuLinkRow[]>;
  getApuDetail(viewer: ViewerContext, apuTemplateId: Uuid): Promise<ApuDetail>;
}

function originLabel(originType: string | undefined): string {
  if (originType === 'manual') return 'Manual';
  if (originType === 'workbook_import') return 'Importado';
  return originType ? originType : 'Importado';
}

/**
 * Resuelve la selección completa para exportar el anexo APU / paquete.
 *
 * @param viewer - Contexto del viewer (organización/rol server-side).
 * @param estimateId - Presupuesto objetivo.
 * @param versionId - Versión explícita (snapshot histórico) o `undefined` ⇒ activa.
 * @param deps - Dependencias RLS-bound (payload, links, detalle APU).
 * @returns Selección con APU vinculados deduplicados en orden BOQ + conteos.
 */
export async function resolveBudgetApuExportSelection(
  viewer: ViewerContext,
  estimateId: Uuid,
  versionId: Uuid | undefined,
  deps: ApuExportSelectionDeps,
): Promise<BudgetApuExportSelection> {
  const [payload, links] = await Promise.all([
    deps.getPayload(viewer, estimateId, versionId),
    deps.getApuLinks(viewer, estimateId, versionId),
  ]);

  const versionEmitted = EMITTED_STATUSES.has(payload.version.status);

  // Orden BOQ ya garantizado por el repositorio (capítulo, luego ítem). Dedup de
  // plantillas preservando la PRIMERA aparición; agrupa los vínculos BOQ.
  const order: Uuid[] = [];
  const linksByTemplate = new Map<Uuid, ApuBoqLink[]>();
  let unlinkedItems = 0;
  for (const row of links) {
    if (!row.apuTemplateId) {
      unlinkedItems += 1;
      continue;
    }
    const id = row.apuTemplateId;
    if (!linksByTemplate.has(id)) {
      linksByTemplate.set(id, []);
      order.push(id);
    }
    linksByTemplate.get(id)!.push({
      chapterCode: row.chapterCode,
      chapterName: row.chapterName,
      itemCode: row.itemCode,
      itemDescription: row.itemDescription,
    });
  }

  const linkedApus: LinkedApuView[] = [];
  let archivedIncluded = 0;
  let archivedExcluded = 0;
  let incomplete = 0;

  for (const id of order) {
    let detail: ApuDetail;
    try {
      detail = await deps.getApuDetail(viewer, id);
    } catch {
      // APU inaccesible/eliminado: no exportable. Se omite sin romper el anexo.
      continue;
    }
    const archived = detail.archivedAt != null;
    // Archivado: excluir salvo versión EMITIDA (fidelidad histórica, contrato §4).
    if (archived && !versionEmitted) {
      archivedExcluded += 1;
      continue;
    }
    const isIncomplete = new Decimal(detail.unitCostTotal || '0').isZero();
    if (isIncomplete) incomplete += 1;
    if (archived) archivedIncluded += 1;

    const boqLinks = linksByTemplate.get(id) ?? [];
    const primary = boqLinks[0];
    linkedApus.push({
      apuTemplateId: id,
      code: detail.code,
      name: detail.name,
      unit: detail.unitCanonical || detail.unit,
      unitCostTotal: detail.unitCostTotal,
      unitCostMaterials: detail.unitCostMaterials,
      unitCostLabor: detail.unitCostLabor,
      unitCostEquipment: detail.unitCostEquipment,
      unitCostTools: detail.unitCostTools,
      unitCostToolDerived: detail.unitCostToolDerived,
      unitCostSubcontract: detail.unitCostSubcontract,
      unitCostOther: detail.unitCostOther,
      defaultToolPct: detail.defaultToolPct,
      componentCount: detail.components.length,
      components: detail.components,
      origin: originLabel(detail.originType),
      archived,
      incomplete: isIncomplete,
      boqLinks,
      primaryChapterCode: primary?.chapterCode ?? '',
      primaryChapterName: primary?.chapterName ?? '',
    });
  }

  return {
    payload,
    versionEmitted,
    linkedApus,
    counts: {
      boqItems: links.length,
      linkedApu: linkedApus.length,
      unlinkedItems,
      archivedIncluded,
      archivedExcluded,
      incomplete,
    },
  };
}
