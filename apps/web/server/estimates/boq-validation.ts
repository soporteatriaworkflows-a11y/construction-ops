/**
 * boq-validation.ts — Validación PURA de capítulos e ítems BOQ (4E.2A).
 *
 * Propiedad: agent-db-rls. Sin DB. Dinero/cantidad con `Decimal` (sin float).
 * Contrato: `docs/BOQ_MANUAL_EDITING_CONTRACT.md §2,§3`.
 */
import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';
import type { ChapterInput, BoqItemInput, BoqItemUpdateInput } from '@/lib/estimates/boq-edit-types';
import { BoqValidationError, type BoqValidationIssue } from './errors';

export const CHAPTER_CODE_MAX = 60;
export const CHAPTER_NAME_MAX = 200;
export const ITEM_CODE_MAX = 60;
export const ITEM_DESCRIPTION_MAX = 1000;
export const ITEM_UNIT_MAX = 30;

export interface NormalizedChapterInput {
  code: string;
  name: string;
}

export interface NormalizedBoqItemInput {
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
}

export interface NormalizedBoqItemUpdate extends NormalizedBoqItemInput {
  targetChapterId: string | null;
}

/**
 * Parsea una cantidad/precio. Acepta solo `^\d+(\.\d+)?$` tras quitar espacios
 * (los inputs `type=number` envían decimales planos). Devuelve la forma canónica
 * (sin ceros sobrantes) o `null` si es inválida o negativa.
 */
export function parseNonNegativeDecimal(raw: unknown): DecimalString | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s/g, '');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  try {
    const d = new Decimal(s);
    if (d.isNegative()) return null;
    return d.toFixed();
  } catch {
    return null;
  }
}

/** Valida y normaliza la entrada de un capítulo. @throws BoqValidationError */
export function validateChapterInput(input: ChapterInput): NormalizedChapterInput {
  const issues: BoqValidationIssue[] = [];
  const code = typeof input?.code === 'string' ? input.code.trim() : '';
  const name = typeof input?.name === 'string' ? input.name.trim() : '';

  if (code.length < 1) issues.push({ field: 'code', message: 'El código del capítulo es obligatorio.' });
  else if (code.length > CHAPTER_CODE_MAX) issues.push({ field: 'code', message: `El código no puede superar ${CHAPTER_CODE_MAX} caracteres.` });

  if (name.length < 1) issues.push({ field: 'name', message: 'El nombre del capítulo es obligatorio.' });
  else if (name.length > CHAPTER_NAME_MAX) issues.push({ field: 'name', message: `El nombre no puede superar ${CHAPTER_NAME_MAX} caracteres.` });

  if (issues.length > 0) throw new BoqValidationError(issues);
  return { code, name };
}

function validateItemCommon(input: BoqItemInput, issues: BoqValidationIssue[]): NormalizedBoqItemInput {
  const code = typeof input?.code === 'string' ? input.code.trim() : '';
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const unit = typeof input?.unit === 'string' ? input.unit.trim() : '';

  if (code.length < 1) issues.push({ field: 'code', message: 'El código del ítem es obligatorio.' });
  else if (code.length > ITEM_CODE_MAX) issues.push({ field: 'code', message: `El código no puede superar ${ITEM_CODE_MAX} caracteres.` });

  if (description.length < 1) issues.push({ field: 'description', message: 'La descripción es obligatoria.' });
  else if (description.length > ITEM_DESCRIPTION_MAX) issues.push({ field: 'description', message: `La descripción no puede superar ${ITEM_DESCRIPTION_MAX} caracteres.` });

  if (unit.length < 1) issues.push({ field: 'unit', message: 'La unidad es obligatoria.' });
  else if (unit.length > ITEM_UNIT_MAX) issues.push({ field: 'unit', message: `La unidad no puede superar ${ITEM_UNIT_MAX} caracteres.` });

  const quantity = parseNonNegativeDecimal(input?.quantity);
  if (quantity === null) issues.push({ field: 'quantity', message: 'La cantidad debe ser un número no negativo.' });

  const unitPrice = parseNonNegativeDecimal(input?.unitPrice);
  if (unitPrice === null) issues.push({ field: 'unitPrice', message: 'El valor unitario debe ser un número no negativo.' });

  return { code, description, unit, quantity: quantity ?? '0', unitPrice: unitPrice ?? '0' };
}

/** Valida y normaliza la entrada de creación de un ítem. @throws BoqValidationError */
export function validateBoqItemInput(input: BoqItemInput): NormalizedBoqItemInput {
  const issues: BoqValidationIssue[] = [];
  const out = validateItemCommon(input, issues);
  if (issues.length > 0) throw new BoqValidationError(issues);
  return out;
}

/** Valida y normaliza la edición de un ítem (con posible mover). @throws BoqValidationError */
export function validateBoqItemUpdate(input: BoqItemUpdateInput): NormalizedBoqItemUpdate {
  const issues: BoqValidationIssue[] = [];
  const out = validateItemCommon(input, issues);
  const target =
    typeof input?.targetChapterId === 'string' && input.targetChapterId.trim().length > 0
      ? input.targetChapterId.trim()
      : null;
  if (issues.length > 0) throw new BoqValidationError(issues);
  return { ...out, targetChapterId: target };
}

/** Subtotal derivado server-side (espejo del trigger DB). PURA. */
export function deriveSubtotal(quantity: DecimalString, unitPrice: DecimalString): DecimalString {
  return new Decimal(quantity).times(unitPrice).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed();
}
