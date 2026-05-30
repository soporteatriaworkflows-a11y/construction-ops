/**
 * snapshot.ts — Snapshots inmutables de cálculo (APU y totales de presupuesto).
 *
 * Propiedad: agent-cost-domain.
 *
 * Un snapshot congela el resultado de un cálculo en una versión de presupuesto.
 * Es INMUTABLE: se devuelve `Object.freeze`-ado (deep) para impedir mutaciones
 * accidentales en memoria. La inmutabilidad persistente la garantiza db-rls
 * (sin políticas UPDATE/DELETE sobre `apu_calculation_snapshots`).
 *
 * Política Q9: el snapshot conserva PRECISIÓN RAW completa (sin redondeo).
 */

import type {
  DecimalString,
  Uuid,
  IsoDateTime,
  ApuComponent,
  ApuCalculationSnapshot,
} from '@/lib/utils/types';
import { sumDecimals } from '../apu/decimal';

/** Congela en profundidad un valor para garantizar inmutabilidad en memoria. */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((prop) => {
      deepFreeze((value as Record<string, unknown>)[prop]);
    });
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

/** Parámetros para crear un snapshot de cálculo de APU. */
export interface CreateApuSnapshotParams {
  id: Uuid;
  apuTemplateId: Uuid;
  estimateVersionId: Uuid;
  /** Componentes congelados (cada uno con su `totalComponentCost`). */
  components: readonly ApuComponent[];
  createdAt: IsoDateTime;
  /**
   * Costo unitario calculado. Si se omite, se deriva sumando los
   * `totalComponentCost` de los componentes (única fuente de verdad).
   */
  calculatedUnitCost?: DecimalString;
}

/**
 * Crea un snapshot inmutable de cálculo de APU. El detalle de componentes se
 * congela tal cual; el costo unitario se deriva de ellos si no se provee.
 *
 * @param params - Identidad, versión, componentes y fecha del snapshot.
 * @returns `ApuCalculationSnapshot` deep-frozen (inmutable en memoria).
 */
export function createApuCalculationSnapshot(
  params: CreateApuSnapshotParams,
): Readonly<ApuCalculationSnapshot> {
  const calculatedUnitCost =
    params.calculatedUnitCost ??
    sumDecimals(params.components.map((c) => c.totalComponentCost));

  const snapshot: ApuCalculationSnapshot = {
    id: params.id,
    apuTemplateId: params.apuTemplateId,
    estimateVersionId: params.estimateVersionId,
    calculatedUnitCost,
    componentsJson: params.components.map((c) => ({ ...c })),
    createdAt: params.createdAt,
  };

  return deepFreeze(snapshot);
}

/**
 * Snapshot inmutable de los totales financieros de una versión de presupuesto.
 * No es una entidad del contrato congelado v1; es un agregado de dominio para
 * congelar la cadena directa → AIU → total → m² en una versión emitida.
 */
export interface EstimateTotalsSnapshot {
  estimateVersionId: Uuid;
  directCosts: DecimalString;
  indirectLines: ReadonlyArray<{
    code: string;
    name: string;
    percentage: DecimalString;
    base: DecimalString;
    amount: DecimalString;
    visibleToClient: boolean;
  }>;
  totalIndirect: DecimalString;
  totalCost: DecimalString;
  builtArea: DecimalString;
  valuePerSqm: DecimalString;
  createdAt: IsoDateTime;
}

/**
 * Crea un snapshot inmutable de los totales de una versión de presupuesto.
 *
 * @param params - Versión, cadena de totales y fecha.
 * @returns Snapshot deep-frozen.
 */
export function createEstimateTotalsSnapshot(
  params: EstimateTotalsSnapshot,
): Readonly<EstimateTotalsSnapshot> {
  return deepFreeze({
    ...params,
    indirectLines: params.indirectLines.map((l) => ({ ...l })),
  });
}
