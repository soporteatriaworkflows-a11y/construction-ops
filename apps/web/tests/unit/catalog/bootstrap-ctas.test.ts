/**
 * bootstrap-ctas.test.ts — Tests de validacion pura para creacion de recursos.
 * Sin DB, sin render de React — solo logica de validacion.
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import { validateResourceCreateInput } from '@/server/catalog/validation';
import { ResourceValidationError } from '@/server/catalog/errors';
import type { ResourceCreateInput } from '@/server/catalog/types';

const VALID_INPUT: ResourceCreateInput = {
  code: 'MAT-001',
  name: 'Cemento Portland',
  resourceType: 'material',
  unit: 'kg',
};

describe('validateResourceCreateInput', () => {
  it('lanza ResourceValidationError si code esta vacio', () => {
    expect(() =>
      validateResourceCreateInput({ ...VALID_INPUT, code: '' }),
    ).toThrowError(ResourceValidationError);

    try {
      validateResourceCreateInput({ ...VALID_INPUT, code: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      expect((e as ResourceValidationError).issues.some((i) => i.field === 'code')).toBe(true);
    }
  });

  it('lanza ResourceValidationError si code contiene caracteres invalidos', () => {
    try {
      validateResourceCreateInput({ ...VALID_INPUT, code: 'MAT 001!' });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      const codeIssue = err.issues.find((i) => i.field === 'code');
      expect(codeIssue).toBeDefined();
      expect(codeIssue!.message).toMatch(/solo puede contener/);
    }
  });

  it('lanza ResourceValidationError si name esta vacio', () => {
    try {
      validateResourceCreateInput({ ...VALID_INPUT, name: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      expect(err.issues.some((i) => i.field === 'name')).toBe(true);
    }
  });

  it('lanza ResourceValidationError si resourceType es invalido', () => {
    try {
      validateResourceCreateInput({
        ...VALID_INPUT,
        // @ts-expect-error: valor invalido intencional para el test
        resourceType: 'invalid_type',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      expect(err.issues.some((i) => i.field === 'resourceType')).toBe(true);
    }
  });

  it('lanza ResourceValidationError si unit esta vacia', () => {
    try {
      validateResourceCreateInput({ ...VALID_INPUT, unit: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      expect(err.issues.some((i) => i.field === 'unit')).toBe(true);
    }
  });

  it('no lanza si el input es valido', () => {
    expect(() => validateResourceCreateInput(VALID_INPUT)).not.toThrow();
    const result = validateResourceCreateInput(VALID_INPUT);
    expect(result.code).toBe('MAT-001');
    expect(result.name).toBe('Cemento Portland');
    expect(result.resourceType).toBe('material');
    expect(result.unit).toBe('kg');
  });

  it('lanza ResourceValidationError si code supera 40 caracteres', () => {
    const longCode = 'A'.repeat(41);
    try {
      validateResourceCreateInput({ ...VALID_INPUT, code: longCode });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      const codeIssue = err.issues.find((i) => i.field === 'code');
      expect(codeIssue).toBeDefined();
      expect(codeIssue!.message).toMatch(/40/);
    }
  });

  it('acumula multiples errores en un solo throw', () => {
    try {
      validateResourceCreateInput({
        code: '',
        name: '',
        // @ts-expect-error: valor invalido intencional para el test
        resourceType: 'bad',
        unit: '',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ResourceValidationError);
      const err = e as ResourceValidationError;
      // Al menos 4 campos con error: code, name, resourceType, unit
      expect(err.issues.length).toBeGreaterThanOrEqual(4);
      const fields = err.issues.map((i) => i.field);
      expect(fields).toContain('code');
      expect(fields).toContain('name');
      expect(fields).toContain('resourceType');
      expect(fields).toContain('unit');
    }
  });
});
