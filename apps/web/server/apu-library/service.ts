/**
 * service.ts — Biblioteca APU compacta (APU_LIBRARY_OPERATIONAL_UX_V1).
 *
 * Compone fuentes EXISTENTES (no duplica cálculo financiero):
 *  - read-model `listApus` → código, nombre, unidad, costo unitario, nº componentes.
 *  - reconciliación `getReconciliationData` → estado de recursos por componente.
 *  - boq_items → vínculo BOQ por plantilla.
 * Búsqueda/filtros/orden/paginación se resuelven server-side antes de enviar a
 * la UI (sin scroll infinito como única navegación).
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import { getReadModel } from '@/server/read-model';
import { getReconciliationData } from '@/server/apu-reconciliation';
import { DbApuReconciliationRepository } from '@/server/apu-reconciliation';
import { toDecimal } from '@/modules/apu/decimal';
import type { Uuid } from '@/lib/utils/types';
import type {
  ApuLibraryItem,
  ApuLibraryParams,
  ApuLibraryResult,
  ApuLibraryStats,
  ApuResourceStatus,
} from '@/lib/apu-library/types';
import type { ReconciliationRow } from '@/lib/apu-reconciliation/types';
import { deriveApuCategory } from '@/lib/apu-library/category';
import { computeApuCompleteness } from '@/lib/apu-library/completeness';

const PAGE_SIZES = [25, 50, 100] as const;

function emptyStatus(): ApuResourceStatus {
  return {
    total: 0,
    associated: 0,
    pending: 0,
    suggested: 0,
    unresolved: 0,
    ambiguous: 0,
    intentionallyUnresolved: 0,
  };
}

function accumulate(status: ApuResourceStatus, row: ReconciliationRow): void {
  status.total += 1;
  switch (row.state) {
    case 'associated':
      status.associated += 1;
      break;
    case 'suggested':
      status.suggested += 1;
      status.pending += 1;
      break;
    case 'unresolved':
      status.unresolved += 1;
      status.pending += 1;
      break;
    case 'ambiguous':
      status.ambiguous += 1;
      status.pending += 1;
      break;
    case 'exact_match':
      status.pending += 1;
      break;
    case 'intentionally_unresolved':
      status.intentionallyUnresolved += 1;
      break;
  }
}

export async function getApuLibrary(
  viewer: AuthenticatedViewer,
  params: ApuLibraryParams,
): Promise<ApuLibraryResult> {
  const repo = new DbApuReconciliationRepository();
  const apus = await getReadModel().listApus(viewer);
  // Reconciliación y vínculo BOQ requieren acceso db RLS-bound; en modo
  // fixture/demo degradan a vacío sin romper la biblioteca.
  const [recon, linkedIds] = await Promise.all([
    getReconciliationData(viewer, { repo }).catch(() => ({
      rows: [],
      summary: {
        totalComponents: 0,
        associated: 0,
        exactPending: 0,
        suggested: 0,
        ambiguous: 0,
        unresolved: 0,
        intentionallyUnresolved: 0,
      },
      batches: [],
    })),
    repo.listLinkedApuTemplateIds(viewer).catch(() => new Set<Uuid>()),
  ]);

  // Estado de recursos por plantilla.
  const statusByTemplate = new Map<Uuid, ApuResourceStatus>();
  for (const row of recon.rows) {
    const s = statusByTemplate.get(row.apuTemplateId) ?? emptyStatus();
    accumulate(s, row);
    statusByTemplate.set(row.apuTemplateId, s);
  }
  // Origen por plantilla (vía el primer componente con batch).
  const batchByTemplate = new Map<Uuid, Uuid | null>();
  for (const row of recon.rows) {
    if (!batchByTemplate.has(row.apuTemplateId)) {
      batchByTemplate.set(row.apuTemplateId, row.importBatchId);
    }
  }
  const batchName = new Map<string, string>();
  for (const b of recon.batches) batchName.set(b.id, b.sourceFilename);

  const allItems: ApuLibraryItem[] = apus.map((a) => {
    const status = statusByTemplate.get(a.id) ?? emptyStatus();
    const batchId = batchByTemplate.get(a.id) ?? null;
    // `archivedAt` viaja en el read-model cuando éste lo expone; hoy `ApuSummary`
    // no lo trae, así que degrada a `null` (activo) sin inventar valor.
    const archivedAt = (a as { archivedAt?: string | null }).archivedAt ?? null;
    // Incompleto si el costo unitario es cero (no hay precio aprobado o sin
    // componentes con costo). Comparación con Decimal, sin float.
    const isIncomplete = toDecimal(a.unitCost ?? '0').isZero();
    const enriched = a as typeof a & {
      typeCounts?: ApuLibraryItem['typeCounts'];
      materialsWithoutPrice?: number;
    };
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      componentCount: a.componentCount,
      unitCost: a.unitCost,
      boqLinked: linkedIds.has(a.id),
      origin: batchId ? batchName.get(batchId) ?? 'Importado' : 'Manual',
      importBatchId: batchId,
      resourceStatus: status,
      archivedAt,
      isIncomplete,
      typeCounts: enriched.typeCounts,
      materialsWithoutPrice: enriched.materialsWithoutPrice,
      category: deriveApuCategory(a.name),
    };
  });

  // Estadísticas globales (antes de filtrar/paginar).
  const stats: ApuLibraryStats = {
    totalApus: allItems.length,
    totalComponents: allItems.reduce((n, i) => n + i.componentCount, 0),
    linkedToBoq: allItems.filter((i) => i.boqLinked).length,
    complete: allItems.filter(
      (i) => i.resourceStatus.pending === 0 && i.resourceStatus.unresolved === 0,
    ).length,
    withPending: allItems.filter((i) => i.resourceStatus.pending > 0).length,
    withUnresolved: allItems.filter((i) => i.resourceStatus.unresolved > 0).length,
  };

  // Filtro por texto.
  const q = params.search.trim().toLowerCase();
  let filtered = allItems;
  if (q !== '') {
    const matchingTemplateIds = new Set(
      recon.rows
        .filter(
          (r) =>
            r.description.toLowerCase().includes(q) ||
            (r.associatedResourceName ?? '').toLowerCase().includes(q) ||
            (r.associatedResourceCode ?? '').toLowerCase().includes(q),
        )
        .map((r) => r.apuTemplateId),
    );
    filtered = filtered.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        matchingTemplateIds.has(i.id),
    );
  }

  // Visibilidad de archivados. Por defecto sólo activos (archived_at IS NULL).
  // `filter='archived'` muestra exclusivamente archivados; `showArchived=true`
  // los incluye junto a los activos. Depende de que el read-model exponga
  // `archivedAt` por plantilla para tener efecto real.
  if (params.filter === 'archived') {
    filtered = filtered.filter((i) => i.archivedAt != null);
  } else if (!params.showArchived) {
    filtered = filtered.filter((i) => i.archivedAt == null);
  }

  // Filtro por estado.
  switch (params.filter) {
    case 'linked':
      filtered = filtered.filter((i) => i.boqLinked);
      break;
    case 'unlinked':
      filtered = filtered.filter((i) => !i.boqLinked);
      break;
    case 'complete':
      filtered = filtered.filter(
        (i) => i.resourceStatus.pending === 0 && i.resourceStatus.unresolved === 0,
      );
      break;
    case 'with_suggestions':
      filtered = filtered.filter((i) => i.resourceStatus.suggested > 0);
      break;
    case 'unresolved':
      filtered = filtered.filter((i) => i.resourceStatus.unresolved > 0);
      break;
    case 'ambiguous':
      filtered = filtered.filter((i) => i.resourceStatus.ambiguous > 0);
      break;
  }

  // Filtro por origen.
  if (params.origin) {
    filtered =
      params.origin === 'manual'
        ? filtered.filter((i) => i.importBatchId === null)
        : filtered.filter((i) => i.importBatchId === params.origin);
  }

  // Filtros de la vista tarjetas (opcionales; no afectan el workspace técnico).
  if (params.unit && params.unit.trim() !== '') {
    const u = params.unit.trim().toLowerCase();
    filtered = filtered.filter((i) => i.unit.toLowerCase() === u);
  }
  if (params.category && params.category.trim() !== '') {
    filtered = filtered.filter((i) => i.category === params.category);
  }
  if (params.completeness && params.completeness.trim() !== '') {
    filtered = filtered.filter((i) => computeApuCompleteness(i).state === params.completeness);
  }

  // Ordenamiento.
  filtered = [...filtered].sort((a, b) => {
    switch (params.sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'cost':
        return Number(b.unitCost) - Number(a.unitCost);
      case 'components':
        return b.componentCount - a.componentCount;
      case 'warnings':
        return (
          b.resourceStatus.pending + b.resourceStatus.unresolved -
          (a.resourceStatus.pending + a.resourceStatus.unresolved)
        );
      default:
        return a.code.localeCompare(b.code, undefined, { numeric: true });
    }
  });

  // Paginación server-side.
  const pageSize = PAGE_SIZES.includes(params.pageSize as 25 | 50 | 100)
    ? params.pageSize
    : 25;
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  const origins = recon.batches.map((b) => ({ id: b.id, label: b.sourceFilename }));
  if (allItems.some((i) => i.importBatchId === null)) {
    origins.push({ id: 'manual', label: 'Manual / sin lote' });
  }

  const units = [...new Set(allItems.map((i) => i.unit).filter((u) => u && u.trim() !== ''))].sort(
    (a, b) => a.localeCompare(b),
  );

  return { items, total, page, pageSize, stats, origins, units };
}
