/**
 * validation.test.ts — Validación pura y generación de `code` de proyectos (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §4,§5`.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCreateProjectInput,
  slugifyProjectCode,
  buildCodeCandidate,
  CODE_FALLBACK,
  CODE_BASE_MAX,
  NAME_MAX,
  CITY_MAX,
  DESCRIPTION_MAX,
} from '@/server/projects/validation';
import { ProjectValidationError } from '@/server/projects/errors';

describe('validateCreateProjectInput', () => {
  it('normaliza una entrada válida (trim + city→location + status default)', () => {
    const out = validateCreateProjectInput({
      name: '  Torre Norte  ',
      city: '  Bogotá  ',
      description: '  edificio  ',
    });
    expect(out).toEqual({
      name: 'Torre Norte',
      location: 'Bogotá',
      description: 'edificio',
      status: 'active',
    });
  });

  it('descripción vacía/ausente ⇒ null', () => {
    expect(validateCreateProjectInput({ name: 'X', city: 'Y' }).description).toBeNull();
    expect(
      validateCreateProjectInput({ name: 'X', city: 'Y', description: '   ' }).description,
    ).toBeNull();
  });

  it('acepta initialStatus="active" explícito', () => {
    expect(
      validateCreateProjectInput({ name: 'X', city: 'Y', initialStatus: 'active' }).status,
    ).toBe('active');
  });

  it('rechaza name vacío', () => {
    expect(() => validateCreateProjectInput({ name: '   ', city: 'Y' })).toThrow(
      ProjectValidationError,
    );
  });

  it('rechaza city vacía', () => {
    expect(() => validateCreateProjectInput({ name: 'X', city: '' })).toThrow(
      ProjectValidationError,
    );
  });

  it('rechaza name demasiado largo', () => {
    expect(() =>
      validateCreateProjectInput({ name: 'a'.repeat(NAME_MAX + 1), city: 'Y' }),
    ).toThrow(ProjectValidationError);
  });

  it('rechaza city demasiado larga', () => {
    expect(() =>
      validateCreateProjectInput({ name: 'X', city: 'a'.repeat(CITY_MAX + 1) }),
    ).toThrow(ProjectValidationError);
  });

  it('rechaza description demasiado larga', () => {
    expect(() =>
      validateCreateProjectInput({
        name: 'X',
        city: 'Y',
        description: 'a'.repeat(DESCRIPTION_MAX + 1),
      }),
    ).toThrow(ProjectValidationError);
  });

  it('rechaza initialStatus distinto de active (4B.1)', () => {
    expect(() =>
      // @ts-expect-error — fuera del tipo permitido a propósito.
      validateCreateProjectInput({ name: 'X', city: 'Y', initialStatus: 'archived' }),
    ).toThrow(ProjectValidationError);
  });

  it('acumula múltiples problemas en issues', () => {
    try {
      validateCreateProjectInput({ name: '', city: '' });
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectValidationError);
      const fields = (e as ProjectValidationError).issues.map((i) => i.field).sort();
      expect(fields).toEqual(['city', 'name']);
    }
  });
});

describe('slugifyProjectCode', () => {
  it('minúsculas, espacios→guion, ASCII sin acentos', () => {
    expect(slugifyProjectCode('Torre Norte')).toBe('torre-norte');
    expect(slugifyProjectCode('Edificio Bogotá')).toBe('edificio-bogota');
  });

  it('colapsa separadores y recorta guiones colgantes', () => {
    expect(slugifyProjectCode('  ¡Hola!!  Mundo  ')).toBe('hola-mundo');
    expect(slugifyProjectCode('--A__B--')).toBe('a-b');
  });

  it('recorta a CODE_BASE_MAX sin guion colgante', () => {
    const out = slugifyProjectCode('palabra '.repeat(20));
    expect(out.length).toBeLessThanOrEqual(CODE_BASE_MAX);
    expect(out.endsWith('-')).toBe(false);
  });

  it('vacío / solo símbolos ⇒ fallback', () => {
    expect(slugifyProjectCode('')).toBe(CODE_FALLBACK);
    expect(slugifyProjectCode('!!!')).toBe(CODE_FALLBACK);
    expect(slugifyProjectCode('—')).toBe(CODE_FALLBACK);
  });
});

describe('buildCodeCandidate', () => {
  it('attempt 0 ⇒ base; luego sufijo -2, -3, …', () => {
    expect(buildCodeCandidate('torre', 0)).toBe('torre');
    expect(buildCodeCandidate('torre', 1)).toBe('torre-2');
    expect(buildCodeCandidate('torre', 2)).toBe('torre-3');
  });
});
