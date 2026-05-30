/**
 * clone.ts — Clonación de versiones de presupuesto a una nueva versión draft.
 *
 * Propiedad: agent-cost-domain.
 *
 * Para cambiar precios/cantidades de una versión emitida (inmutable) se CLONA a
 * una nueva versión `draft` independiente. El clon:
 *   - recibe nuevos IDs (vía generador inyectado, para pureza/testabilidad);
 *   - copia capítulos, ítems BOQ y reglas de costos indirectos por valor
 *     (sin referencias compartidas con el original);
 *   - empieza en estado `draft`, sin `approvedAt`, con `versionNumber` siguiente.
 *
 * La función es PURA: no genera IDs ni fechas por sí misma (se inyectan).
 */

import type {
  Uuid,
  IsoDateTime,
  EstimateVersion,
  Chapter,
  BoqItem,
  IndirectCostRule,
} from '@/lib/utils/types';

/** Conjunto completo de datos de una versión (raíz + hijos). */
export interface EstimateVersionBundle {
  version: EstimateVersion;
  chapters: readonly Chapter[];
  boqItems: readonly BoqItem[];
  indirectCostRules: readonly IndirectCostRule[];
}

/** Dependencias inyectadas para clonar de forma determinista/pura. */
export interface CloneDeps {
  /** Genera un nuevo UUID. */
  newId: () => Uuid;
  /** Fecha/hora de creación del clon. */
  now: () => IsoDateTime;
  /** Usuario creador del clon (opcional). */
  createdBy?: Uuid | null;
}

/**
 * Clona una versión de presupuesto a una nueva versión `draft` INDEPENDIENTE.
 * Función PURA respecto a sus entradas (IDs/fechas provienen de `deps`).
 *
 * @param source - Bundle de la versión origen (raíz + hijos).
 * @param deps - Generador de IDs, reloj y creador.
 * @returns Bundle clonado con nuevos IDs, estado `draft` y `versionNumber + 1`.
 */
export function cloneEstimateVersion(
  source: EstimateVersionBundle,
  deps: CloneDeps,
): EstimateVersionBundle {
  const createdAt = deps.now();
  const newVersionId = deps.newId();

  const version: EstimateVersion = {
    id: newVersionId,
    estimateId: source.version.estimateId,
    versionNumber: source.version.versionNumber + 1,
    status: 'draft',
    createdBy: deps.createdBy ?? null,
    createdAt,
    approvedAt: null,
    notes: source.version.notes ?? null,
  };

  // Mapa de IDs viejos → nuevos para capítulos (reasociar ítems BOQ).
  const chapterIdMap = new Map<Uuid, Uuid>();
  const chapters: Chapter[] = source.chapters.map((ch) => {
    const id = deps.newId();
    chapterIdMap.set(ch.id, id);
    return {
      ...ch,
      id,
      estimateVersionId: newVersionId,
    };
  });

  const boqItems: BoqItem[] = source.boqItems.map((item) => ({
    ...item,
    id: deps.newId(),
    estimateVersionId: newVersionId,
    chapterId: chapterIdMap.get(item.chapterId) ?? item.chapterId,
  }));

  const indirectCostRules: IndirectCostRule[] = source.indirectCostRules.map((rule) => ({
    ...rule,
    id: deps.newId(),
    estimateVersionId: newVersionId,
  }));

  return { version, chapters, boqItems, indirectCostRules };
}
