/**
 * boq-edit-types.ts — Tipos CLIENT-SAFE de edición manual de BOQ (4E.2A).
 *
 * Sin dependencias de servidor (los consume la UI). Dinero/cantidades como
 * `DecimalString` (string), NUNCA `number`. El navegador jamás envía `subtotal`
 * ni totales: se derivan/recalculan server-side y el invariant lo fuerza el
 * trigger `boq_items_recompute_subtotal`. Contrato: `docs/BOQ_MANUAL_EDITING_CONTRACT.md`.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';

export type { DecimalString, Uuid } from '@/lib/utils/types';

/** Entrada permitida desde el navegador para crear/editar un capítulo. */
export interface ChapterInput {
  code: string;
  name: string;
}

/** Entrada permitida desde el navegador para crear un ítem BOQ. */
export interface BoqItemInput {
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
}

/** Entrada de edición de ítem; `targetChapterId` (opcional) mueve el ítem. */
export interface BoqItemUpdateInput extends BoqItemInput {
  targetChapterId?: Uuid | null;
}

/** Capítulo editable + contexto. `isManual` = creado a mano (sin origen Excel). */
export interface EditableChapterView {
  id: Uuid;
  code: string;
  name: string;
  sourceCode: string | null;
  sourceRow: number | null;
  isManual: boolean;
  editable: boolean;
  estimateId: Uuid;
  versionNumber: number;
}

/** Referencia mínima de capítulo (para el selector de "mover"). */
export interface ChapterRef {
  id: Uuid;
  code: string;
  name: string;
}

/** Ítem editable + contexto + capítulos disponibles para mover. */
export interface EditableBoqItemView {
  id: Uuid;
  chapterId: Uuid;
  chapterCode: string;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  sourceCode: string | null;
  sourceRow: number | null;
  isManual: boolean;
  editable: boolean;
  versionNumber: number;
  availableChapters: ChapterRef[];
}

/** Resultado de una mutación de capítulo (incluye resumen recalculado). */
export interface ChapterMutationResult {
  chapterId: Uuid;
  financial: FinancialSummary;
}

/** Resultado de una mutación de ítem (subtotal + resumen recalculados). */
export interface BoqItemMutationResult {
  itemId: Uuid;
  chapterId: Uuid;
  subtotal: DecimalString;
  financial: FinancialSummary;
}
