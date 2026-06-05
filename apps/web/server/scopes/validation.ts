/**
 * validation.ts — Validación pura y generación de `code` de alcances (4B.2).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §4,§5`.
 *
 * Funciones puras y testeables sin DB: validación de `CreateScopeInput`,
 * normalización, y derivación del slug base de `code` (único por proyecto).
 */
import type { CreateScopeInput, ScopeType } from './types';
import { SCOPE_TYPES } from './types';
import { ScopeValidationError, type ScopeValidationIssue } from './errors';

/** Límites de longitud del contrato §5 (tras trim). */
export const NAME_MIN = 1;
export const NAME_MAX = 160;
export const DESCRIPTION_MAX = 2000;
/** Tope del slug base antes del sufijo anti-colisión (contrato §4). */
export const CODE_BASE_MAX = 40;
/** Slug por defecto cuando el nombre no produce caracteres válidos. */
export const CODE_FALLBACK = 'alcance';
/** Reintentos máximos del sufijo anti-colisión (`-2`, `-3`, …). */
export const CODE_MAX_ATTEMPTS = 50;

/** Entrada de creación ya validada y normalizada (lista para persistir). */
export interface NormalizedScopeInput {
  name: string;
  scopeType: ScopeType;
  description: string | null;
}

function isScopeType(v: unknown): v is ScopeType {
  return typeof v === 'string' && (SCOPE_TYPES as readonly string[]).includes(v);
}

/**
 * Valida y normaliza `CreateScopeInput`. Función PURA (sin DB).
 *
 * @throws ScopeValidationError con la lista de problemas detectados.
 */
export function validateCreateScopeInput(
  input: CreateScopeInput,
): NormalizedScopeInput {
  const issues: ScopeValidationIssue[] = [];

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input?.description === 'string' ? input.description.trim() : '';

  if (name.length < NAME_MIN) {
    issues.push({ field: 'name', message: 'El nombre del alcance es obligatorio.' });
  } else if (name.length > NAME_MAX) {
    issues.push({
      field: 'name',
      message: `El nombre no puede superar ${NAME_MAX} caracteres.`,
    });
  }

  if (!isScopeType(input?.scopeType)) {
    issues.push({
      field: 'scopeType',
      message: 'Selecciona un tipo de alcance válido.',
    });
  }

  if (description.length > DESCRIPTION_MAX) {
    issues.push({
      field: 'description',
      message: `La descripción no puede superar ${DESCRIPTION_MAX} caracteres.`,
    });
  }

  if (issues.length > 0) throw new ScopeValidationError(issues);

  return {
    name,
    scopeType: input.scopeType,
    description: description.length > 0 ? description : null,
  };
}

/**
 * Deriva el slug base de `code` a partir del nombre (contrato §4): minúsculas,
 * ASCII, espacios→`-`, solo `[a-z0-9-]`, ≤ 40 chars, sin guiones colgantes. Si
 * queda vacío ⇒ `'alcance'`. Función PURA.
 */
export function slugifyScopeCode(name: string): string {
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

/**
 * Construye el candidato n-ésimo de `code`: el primero es `base`; a partir del
 * segundo se sufija `-2`, `-3`, … (contrato §4). Función PURA.
 */
export function buildScopeCodeCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  return `${base}-${attempt + 1}`;
}
