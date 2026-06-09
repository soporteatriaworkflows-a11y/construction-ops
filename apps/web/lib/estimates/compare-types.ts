/**
 * compare-types.ts — Tipos CLIENT-SAFE de comparación de versiones (4E.3B).
 *
 * Sin dependencias de servidor. Dinero como `DecimalString`. Comparación
 * READ-ONLY. Contrato: `docs/ESTIMATE_VERSION_COMPARE_CONTRACT.md`.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { EstimateVersionStatus } from '@/lib/contracts/read-model';

export type { EstimateVersionStatus } from '@/lib/contracts/read-model';

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

/** Métrica financiera comparada (base vs target + deltas). */
export interface FinancialDelta {
  base: DecimalString;
  target: DecimalString;
  /** target − base. */
  delta: DecimalString;
  /** (delta / base) × 100; `null` cuando base = 0 (sin división por cero). */
  deltaPct: DecimalString | null;
}

/** Resumen financiero comparado de las dos versiones. */
export interface VersionCompareFinancial {
  directTotal: FinancialDelta;
  administration: FinancialDelta;
  contingency: FinancialDelta;
  utility: FinancialDelta;
  utilityVat: FinancialDelta;
  indirectTotal: FinancialDelta;
  grandTotal: FinancialDelta;
}

/** Par base/target de un campo (null = ausente en esa versión). */
export interface Pair<T> {
  base: T | null;
  target: T | null;
}

/** Diff de un ítem (clave `chapterCode + itemCode + occurrenceIndex`). */
export interface ItemDiff {
  status: DiffStatus;
  chapterCode: string;
  code: string;
  occurrenceIndex: number;
  description: Pair<string>;
  unit: Pair<string>;
  quantity: Pair<DecimalString>;
  unitPrice: Pair<DecimalString>;
  subtotal: Pair<DecimalString>;
  /** target.subtotal − base.subtotal (ausente = 0). */
  subtotalDelta: DecimalString;
  archived: Pair<boolean>;
  archivedChanged: boolean;
  /** El código se repite dentro del capítulo en alguna versión ⇒ emparejado por orden. */
  duplicateCodeWarning: boolean;
}

/** Diff de un capítulo (clave `code`, único por versión). */
export interface ChapterDiff {
  status: DiffStatus;
  code: string;
  name: Pair<string>;
  /** Subtotal ACTIVO (excluye archivados). */
  subtotal: { base: DecimalString; target: DecimalString };
  subtotalDelta: DecimalString;
  archived: Pair<boolean>;
  archivedChanged: boolean;
  items: ItemDiff[];
}

export interface CompareVersionRef {
  id: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
}

/** Resultado completo de la comparación de dos versiones del mismo estimate. */
export interface VersionCompareResult {
  estimateId: Uuid;
  base: CompareVersionRef;
  target: CompareVersionRef;
  financial: VersionCompareFinancial;
  chapters: ChapterDiff[];
  /** Hubo al menos un código de ítem repetido (emparejamiento por orden). */
  duplicateCodeWarning: boolean;
}
