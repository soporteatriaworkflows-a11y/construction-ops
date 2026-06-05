/**
 * validation.ts — Validación pura y generación de `code` de presupuestos (4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §4,§5`.
 */
import type { CreateEstimateInput } from './types';
import { EstimateValidationError, type EstimateValidationIssue } from './errors';

export const NAME_MIN = 1;
export const NAME_MAX = 160;
export const DESCRIPTION_MAX = 2000;
export const CODE_BASE_MAX = 40;
export const CODE_FALLBACK = 'presupuesto';
export const CODE_MAX_ATTEMPTS = 50;

export interface NormalizedEstimateInput {
  name: string;
  description: string | null;
}

/**
 * Valida y normaliza `CreateEstimateInput`. Función PURA (sin DB).
 * @throws EstimateValidationError
 */
export function validateCreateEstimateInput(
  input: CreateEstimateInput,
): NormalizedEstimateInput {
  const issues: EstimateValidationIssue[] = [];

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input?.description === 'string' ? input.description.trim() : '';

  if (name.length < NAME_MIN) {
    issues.push({ field: 'name', message: 'El nombre del presupuesto es obligatorio.' });
  } else if (name.length > NAME_MAX) {
    issues.push({
      field: 'name',
      message: `El nombre no puede superar ${NAME_MAX} caracteres.`,
    });
  }

  if (description.length > DESCRIPTION_MAX) {
    issues.push({
      field: 'description',
      message: `La descripción no puede superar ${DESCRIPTION_MAX} caracteres.`,
    });
  }

  if (issues.length > 0) throw new EstimateValidationError(issues);

  return { name, description: description.length > 0 ? description : null };
}

/** Slug base de `code` (≤40, `[a-z0-9-]`, fallback `presupuesto`). Función PURA. */
export function slugifyEstimateCode(name: string): string {
  const ascii = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  let base = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length > CODE_BASE_MAX) {
    base = base.slice(0, CODE_BASE_MAX).replace(/-+$/g, '');
  }

  return base.length > 0 ? base : CODE_FALLBACK;
}

/** Candidato n-ésimo de `code` (`base`, `base-2`, …). Función PURA. */
export function buildEstimateCodeCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  return `${base}-${attempt + 1}`;
}
