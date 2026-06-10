/**
 * validation.ts — Validación de inputs para Price Intelligence (Fase 3A).
 * Propiedad: agent-pricing.
 */
import Decimal from 'decimal.js';
import { ObservationValidationError, ProviderValidationError } from './errors';
import type { ProviderCreateInput, CreateObservationInput } from './types';

const VALID_SOURCE_TYPES = [
  'official_api','official_feed','supplier_csv',
  'manual','public_web','invoice','quotation',
] as const;

const VALID_SUPPLIER_TYPES = [
  'vendor','distributor','manufacturer','subcontractor','other',
] as const;

export function validateProviderCreateInput(
  input: ProviderCreateInput,
): ProviderCreateInput & Required<Pick<ProviderCreateInput, 'supplierType' | 'defaultDiscountPercent'>> {
  const issues: Array<{ field: string; message: string }> = [];

  const name = input.name?.trim() ?? '';
  if (!name) issues.push({ field: 'name', message: 'El nombre del proveedor es obligatorio.' });
  if (name.length > 200) issues.push({ field: 'name', message: 'El nombre no puede superar 200 caracteres.' });

  const supplierType = input.supplierType ?? 'vendor';
  if (!VALID_SUPPLIER_TYPES.includes(supplierType as typeof VALID_SUPPLIER_TYPES[number])) {
    issues.push({ field: 'supplierType', message: 'Tipo de proveedor inválido.' });
  }

  const discountStr = input.defaultDiscountPercent ?? '0';
  let discount: Decimal;
  try {
    discount = new Decimal(discountStr);
  } catch {
    issues.push({ field: 'defaultDiscountPercent', message: 'Descuento debe ser un número válido.' });
    discount = new Decimal(0);
  }
  if (discount.lt(0) || discount.gt(100)) {
    issues.push({ field: 'defaultDiscountPercent', message: 'Descuento debe estar entre 0 y 100.' });
  }

  if (issues.length > 0) throw new ProviderValidationError(issues);

  return {
    ...input,
    name,
    supplierType,
    defaultDiscountPercent: discountStr,
  };
}

export function validateCreateObservationInput(input: CreateObservationInput): CreateObservationInput {
  const issues: Array<{ field: string; message: string }> = [];

  if (!input.resourceId?.trim()) {
    issues.push({ field: 'resourceId', message: 'El recurso es obligatorio.' });
  }

  let observedPrice: Decimal;
  try {
    observedPrice = new Decimal(input.observedPrice);
  } catch {
    issues.push({ field: 'observedPrice', message: 'Precio observado debe ser un número válido.' });
    observedPrice = new Decimal(0);
  }
  if (observedPrice.lt(0)) {
    issues.push({ field: 'observedPrice', message: 'El precio observado no puede ser negativo.' });
  }

  const discountStr = input.discountPercent ?? '0';
  let discount: Decimal;
  try {
    discount = new Decimal(discountStr);
  } catch {
    issues.push({ field: 'discountPercent', message: 'Descuento debe ser un número válido.' });
    discount = new Decimal(0);
  }
  if (discount.lt(0) || discount.gt(100)) {
    issues.push({ field: 'discountPercent', message: 'Descuento debe estar entre 0 y 100.' });
  }

  const unit = input.unit?.trim() ?? '';
  if (!unit) issues.push({ field: 'unit', message: 'La unidad es obligatoria.' });

  const currency = input.currency ?? 'COP';
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({ field: 'currency', message: 'Moneda debe ser un código ISO-4217 de 3 letras mayúsculas.' });
  }

  if (!VALID_SOURCE_TYPES.includes(input.sourceType as typeof VALID_SOURCE_TYPES[number])) {
    issues.push({ field: 'sourceType', message: 'Tipo de fuente inválido.' });
  }

  if (!input.observedAt) {
    issues.push({ field: 'observedAt', message: 'La fecha de observación es obligatoria.' });
  }

  if (issues.length > 0) throw new ObservationValidationError(issues);

  return {
    ...input,
    unit,
    currency,
    discountPercent: discountStr,
  };
}

/** Calcula isStale en tiempo de ejecución (no persistido). */
export function computeIsStale(
  status: string,
  approvedAt: string | null,
  validUntil: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== 'approved') return false;
  if (validUntil != null) {
    return now > new Date(validUntil);
  }
  if (approvedAt != null) {
    const diffMs = now.getTime() - new Date(approvedAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 30;
  }
  return false;
}
