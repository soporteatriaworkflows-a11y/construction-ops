/**
 * validation.ts — Validación pura y generación de `code` (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §4,§5`.
 *
 * Funciones puras y testeables sin DB: validación de `CreateProjectInput`,
 * normalización a una entrada limpia, y derivación del slug base de `code`.
 */
import type { CreateProjectInput } from './types';
import { ProjectValidationError, type ProjectValidationIssue } from './errors';

/** Límites de longitud del contrato §5 (tras trim). */
export const NAME_MIN = 1;
export const NAME_MAX = 160;
export const CITY_MIN = 1;
export const CITY_MAX = 120;
export const DESCRIPTION_MAX = 2000;
/** Tope del slug base antes del sufijo anti-colisión (contrato §4). */
export const CODE_BASE_MAX = 40;
/** Slug por defecto cuando el nombre no produce caracteres válidos. */
export const CODE_FALLBACK = 'proyecto';
/** Reintentos máximos del sufijo anti-colisión (`-2`, `-3`, …). */
export const CODE_MAX_ATTEMPTS = 50;

/** Entrada de creación ya validada y normalizada (lista para persistir). */
export interface NormalizedProjectInput {
  name: string;
  /** Persiste en `projects.location`. */
  location: string;
  description: string | null;
  status: 'active';
}

/**
 * Valida y normaliza `CreateProjectInput`. Función PURA (sin DB).
 *
 * @throws ProjectValidationError con la lista de problemas detectados.
 */
export function validateCreateProjectInput(
  input: CreateProjectInput,
): NormalizedProjectInput {
  const issues: ProjectValidationIssue[] = [];

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const city = typeof input?.city === 'string' ? input.city.trim() : '';
  const description =
    typeof input?.description === 'string' ? input.description.trim() : '';

  if (name.length < NAME_MIN) {
    issues.push({ field: 'name', message: 'El nombre es obligatorio.' });
  } else if (name.length > NAME_MAX) {
    issues.push({
      field: 'name',
      message: `El nombre no puede superar ${NAME_MAX} caracteres.`,
    });
  }

  if (city.length < CITY_MIN) {
    issues.push({ field: 'city', message: 'La ciudad es obligatoria.' });
  } else if (city.length > CITY_MAX) {
    issues.push({
      field: 'city',
      message: `La ciudad no puede superar ${CITY_MAX} caracteres.`,
    });
  }

  if (description.length > DESCRIPTION_MAX) {
    issues.push({
      field: 'description',
      message: `La descripción no puede superar ${DESCRIPTION_MAX} caracteres.`,
    });
  }

  // En 4B.1 el único estado inicial permitido es 'active' (default).
  const status = input?.initialStatus;
  if (status !== undefined && status !== 'active') {
    issues.push({
      field: 'initialStatus',
      message: "El único estado inicial permitido es 'active'.",
    });
  }

  if (issues.length > 0) throw new ProjectValidationError(issues);

  return {
    name,
    location: city,
    description: description.length > 0 ? description : null,
    status: 'active',
  };
}

/**
 * Deriva el slug base de `code` a partir del nombre (contrato §4):
 * minúsculas, ASCII, espacios→`-`, solo `[a-z0-9-]`, ≤ 40 chars, sin guiones
 * colgantes. Si queda vacío ⇒ `'proyecto'`. Función PURA.
 */
export function slugifyProjectCode(name: string): string {
  const ascii = (name ?? '')
    .normalize('NFD')
    // Elimina marcas diacríticas (acentos) tras la descomposición.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  let base = ascii
    // Cualquier cosa que no sea [a-z0-9] se vuelve separador.
    .replace(/[^a-z0-9]+/g, '-')
    // Colapsa guiones repetidos.
    .replace(/-+/g, '-')
    // Recorta guiones colgantes.
    .replace(/^-+|-+$/g, '');

  if (base.length > CODE_BASE_MAX) {
    base = base.slice(0, CODE_BASE_MAX).replace(/-+$/g, '');
  }

  return base.length > 0 ? base : CODE_FALLBACK;
}

/**
 * Construye el candidato n-ésimo de `code`: el primero es `base`; a partir del
 * segundo se sufija `-2`, `-3`, … (contrato §4). Función PURA.
 *
 * @param base - Slug base ya saneado.
 * @param attempt - 0-indexado (0 ⇒ `base`, 1 ⇒ `base-2`, …).
 */
export function buildCodeCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  return `${base}-${attempt + 1}`;
}
