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
 * Tope de lecturas APU concurrentes. Reemplaza el patrón N+1 secuencial por
 * fan-out acotado: aprovecha el paralelismo sin saturar la conexión/pool RLS en
 * presupuestos grandes (decenas/cientos de APU vinculados).
 */
const APU_DETAIL_CONCURRENCY = 8;

/**
 * `map` asíncrono con concurrencia acotada que PRESERVA el orden de entrada
 * (resultado[i] ↔ items[i]). PURA respecto a `items` (no los muta). Procesa con
 * un pool de `limit` workers que consumen un cursor compartido.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!, index);
    }
  }
  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
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

  // Prefetch de detalles APU con concurrencia acotada (antes: N+1 secuencial).
  // `null` marca un APU inaccesible/eliminado (no exportable). El orden BOQ se
  // conserva porque `mapWithConcurrency` reensambla por índice ⇒ contrato intacto.
  const details = await mapWithConcurrency(order, APU_DETAIL_CONCURRENCY, async (id) => {
    try {
      return await deps.getApuDetail(viewer, id);
    } catch {
      return null;
    }
  });

  for (let i = 0; i < order.length; i += 1) {
    const id = order[i]!;
    const detail = details[i];
    if (!detail) {
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
