/**
 * review-types.ts — Tipos CLIENT-SAFE de revisión operativa del presupuesto (4D.1).
 *
 * Sin dependencias de servidor (los consume la UI). Dinero/cantidades como
 * `DecimalString` (string), NUNCA `number`. `sourceCode`/`sourceRow` exponen la
 * trazabilidad de normalización (4C.3) de forma secundaria.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';

export type { DecimalString, Uuid } from '@/lib/utils/types';

/** Fila de la tabla de capítulos (resumen por capítulo). */
export interface ChapterReviewItem {
  id: Uuid;
  code: string;
  name: string;
  sortOrder: number;
  itemCount: number;
  /** Σ subtotales de sus ítems ACTIVOS (DecimalString). */
  subtotal: DecimalString;
  /** Trazabilidad: código/fila originales del Excel (null si no normalizado). */
  sourceCode: string | null;
  sourceRow: number | null;
  /** 4E.2B: capítulo archivado (solo aparece con includeArchived). */
  archived: boolean;
}

/** Fila de la tabla de ítems BOQ de un capítulo. */
export interface BoqItemReviewView {
  id: Uuid;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  sortOrder: number;
  sourceCode: string | null;
  sourceRow: number | null;
  /** 4E.2B: ítem archivado (solo aparece con includeArchived). */
  archived: boolean;
}

/** Detalle de un capítulo + contexto (proyecto/alcance/presupuesto/versión). */
export interface ChapterDetailView {
  id: Uuid;
  code: string;
  name: string;
  sortOrder: number;
  subtotal: DecimalString;
  itemCount: number;
  sourceCode: string | null;
  sourceRow: number | null;
  /** 4E.2B: el capítulo está archivado. */
  archived: boolean;
  estimateId: Uuid;
  estimateName: string;
  versionNumber: number;
  scopeId: Uuid;
  scopeName: string | null;
  projectId: Uuid;
  projectName: string | null;
}
