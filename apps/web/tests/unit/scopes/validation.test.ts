/**
 * validation.test.ts — Validación pura y generación de `code` de alcances (4B.2).
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCreateScopeInput,
  slugifyScopeCode,
  buildScopeCodeCandidate,
  NAME_MAX,
  DESCRIPTION_MAX,
} from '@/server/scopes/validation';
import { ScopeValidationError } from '@/server/scopes/errors';

describe('validateCreateScopeInput', () => {
  it('normaliza una entrada válida (trim + description null si vacía)', () => {
    const out = validateCreateScopeInput({ name: '  Primer Piso ', scopeType: 'floor' });
    expect(out).toEqual({ name: 'Primer Piso', scopeType: 'floor', description: null });
  });

  it('conserva la descripción cuando viene', () => {
    const out = validateCreateScopeInput({
      name: 'P1',
      scopeType: 'floor',
      description: '  algo  ',
    });
    expect(out.description).toBe('algo');
  });

  it('nombre vacío ⇒ ScopeValidationError (field name)', () => {
    try {
      validateCreateScopeInput({ name: '   ', scopeType: 'floor' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScopeValidationError);
      expect((e as ScopeValidationError).issues.some((i) => i.field === 'name')).toBe(true);
    }
  });

  it('scopeType inválido ⇒ ScopeValidationError (field scopeType)', () => {
    try {
      validateCreateScopeInput({ name: 'X', scopeType: 'roof' as never });
      expect.unreachable();
    } catch (e) {
      expect((e as ScopeValidationError).issues.some((i) => i.field === 'scopeType')).toBe(true);
    }
  });

  it('nombre demasiado largo ⇒ error', () => {
    expect(() =>
      validateCreateScopeInput({ name: 'a'.repeat(NAME_MAX + 1), scopeType: 'floor' }),
    ).toThrow(ScopeValidationError);
  });

  it('descripción demasiado larga ⇒ error', () => {
    expect(() =>
      validateCreateScopeInput({
        name: 'X',
        scopeType: 'floor',
        description: 'a'.repeat(DESCRIPTION_MAX + 1),
      }),
    ).toThrow(ScopeValidationError);
  });

  it('acepta los 7 tipos de alcance del esquema', () => {
    for (const t of ['floor', 'tower', 'stage', 'package', 'unit', 'modification', 'other'] as const) {
      expect(validateCreateScopeInput({ name: 'X', scopeType: t }).scopeType).toBe(t);
    }
  });
});

describe('slugifyScopeCode', () => {
  it('normaliza acentos, espacios y mayúsculas', () => {
    expect(slugifyScopeCode('Primer Píso')).toBe('primer-piso');
  });
  it('nombre sin caracteres válidos ⇒ fallback "alcance"', () => {
    expect(slugifyScopeCode('  --  ')).toBe('alcance');
  });
});

describe('buildScopeCodeCandidate', () => {
  it('attempt 0 ⇒ base; 1 ⇒ base-2; 2 ⇒ base-3', () => {
    expect(buildScopeCodeCandidate('p1', 0)).toBe('p1');
    expect(buildScopeCodeCandidate('p1', 1)).toBe('p1-2');
    expect(buildScopeCodeCandidate('p1', 2)).toBe('p1-3');
  });
});
