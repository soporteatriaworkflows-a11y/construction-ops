/**
 * from-summary.ts — Adapta un `ApuSummary` (read-model) a un `ApuLibraryItem`
 * para reutilizar `computeApuCompleteness` desde el presupuesto
 * (APU_QUOTE_READINESS_INTEGRATION_V2). PURO, sin DB.
 *
 * Nota de fidelidad: `listApus` NO trae el estado de reconciliación de recursos
 * (eso lo compone `getApuLibrary`), así que `resourceStatus` queda en cero. Las
 * señales de completitud disponibles vía `ApuSummary` (componentes, costo,
 * materiales sin precio, archivado, categoría derivada) SÍ se evalúan; los
 * pendientes por reconciliación quedan fuera (gap documentado, no se inventa).
 */
import type { ApuSummary, Uuid } from '@/lib/contracts/read-model';
import type { ApuLibraryItem } from './types';
import { deriveApuCategory } from './category';

/** Construye un `ApuLibraryItem` mínimo desde un `ApuSummary`. PURO. */
export function apuSummaryToLibraryItem(summary: ApuSummary): ApuLibraryItem {
  return {
    id: summary.id,
    code: summary.code,
    name: summary.name,
    unit: summary.unit,
    componentCount: summary.componentCount,
    unitCost: summary.unitCost,
    boqLinked: true, // está vinculado al presupuesto que estamos evaluando
    origin: summary.originType === 'manual' ? 'Manual' : 'Importado',
    importBatchId: null,
    resourceStatus: { total: 0, associated: 0, pending: 0, suggested: 0, unresolved: 0, ambiguous: 0, intentionallyUnresolved: 0 },
    archivedAt: summary.archivedAt ?? null,
    typeCounts: summary.typeCounts,
    materialsWithoutPrice: summary.materialsWithoutPrice,
    category: deriveApuCategory(summary.name),
  };
}

/** Mapa id→ApuLibraryItem para resolución por ítem BOQ. PURO. */
export function buildApuLibraryItemMap(summaries: readonly ApuSummary[]): Map<Uuid, ApuLibraryItem> {
  const map = new Map<Uuid, ApuLibraryItem>();
  for (const s of summaries) map.set(s.id, apuSummaryToLibraryItem(s));
  return map;
}
