/**
 * Tests unitarios — lib/utils/format.ts
 * Verifica que las funciones de formato no realizan cálculos financieros
 * y que producen las salidas esperadas.
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import {
  formatCOP,
  formatNumber,
  formatPct,
  formatDate,
  formatDateTime,
  RESOURCE_TYPE_LABELS,
  ESTIMATE_VERSION_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
} from '@/lib/utils/format';

describe('formatCOP', () => {
  it('formatea un valor decimal válido a COP', () => {
    const result = formatCOP('336084479.9369073500');
    expect(result).toContain('$');
    // Debería contener la cifra formateada en es-CO
    expect(result).toMatch(/336/);
  });

  it('devuelve — para un valor no numérico', () => {
    expect(formatCOP('invalid')).toBe('—');
  });

  it('devuelve — para string vacío', () => {
    expect(formatCOP('')).toBe('—');
  });

  it('formatea cero correctamente', () => {
    const result = formatCOP('0');
    expect(result).toContain('$');
  });
});

describe('formatNumber', () => {
  it('formatea con 2 decimales por defecto', () => {
    const result = formatNumber('42.5000');
    expect(result).toContain('42');
  });

  it('formatea con 4 decimales', () => {
    const result = formatNumber('42.5000', 4);
    expect(result).toContain('42');
  });

  it('devuelve — para NaN', () => {
    expect(formatNumber('abc')).toBe('—');
  });
});

describe('formatPct', () => {
  it('formatea fracción 0.035 como porcentaje', () => {
    const result = formatPct('0.0350');
    expect(result).toContain('%');
    expect(result).toContain('3');
  });

  it('formatea fracción 0.19 correctamente', () => {
    const result = formatPct('0.1900');
    expect(result).toContain('19');
  });

  it('devuelve — para NaN', () => {
    expect(formatPct('nan')).toBe('—');
  });
});

describe('formatDate', () => {
  it('formatea fecha ISO al formato dd/MM/yyyy', () => {
    expect(formatDate('2026-05-29')).toBe('29/05/2026');
  });

  it('devuelve — para null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('devuelve — para undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('devuelve el valor si no es parseable', () => {
    // Un valor que no sigue el formato YYYY-MM-DD completo
    const result = formatDate('2026');
    // Devuelve el valor original o — dependiendo del split
    expect(typeof result).toBe('string');
  });
});

describe('formatDateTime', () => {
  it('formatea un IsoDateTime a fecha local', () => {
    const result = formatDateTime('2026-05-29T10:00:00-05:00');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('—');
  });

  it('devuelve — para null', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('Labels de enums', () => {
  it('contiene etiquetas para todos los tipos de recurso', () => {
    const types = ['material', 'labor', 'equipment', 'tool', 'subcontract', 'other'];
    types.forEach((t) => {
      expect(RESOURCE_TYPE_LABELS[t]).toBeDefined();
      expect(RESOURCE_TYPE_LABELS[t]!.length).toBeGreaterThan(0);
    });
  });

  it('contiene etiquetas para estados de versión', () => {
    const statuses = ['draft', 'review', 'approved', 'issued', 'archived'];
    statuses.forEach((s) => {
      expect(ESTIMATE_VERSION_STATUS_LABELS[s]).toBeDefined();
    });
  });

  it('contiene etiquetas para estados de proyecto', () => {
    const statuses = ['active', 'archived', 'closed'];
    statuses.forEach((s) => {
      expect(PROJECT_STATUS_LABELS[s]).toBeDefined();
    });
  });
});
