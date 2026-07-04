import { describe, it, expect } from 'vitest';
import { evaluateSteelUixPreviewAccess, STEEL_UIX_PREVIEW_ROLES } from '@/lib/steel/preview-gate';

describe('evaluateSteelUixPreviewAccess', () => {
  it('deniega si el env no es exactamente "true"', () => {
    expect(evaluateSteelUixPreviewAccess(undefined, 'admin')).toBe(false);
    expect(evaluateSteelUixPreviewAccess('1', 'admin')).toBe(false);
    expect(evaluateSteelUixPreviewAccess('false', 'admin')).toBe(false);
  });

  it('permite para roles de preview con env activo', () => {
    for (const role of STEEL_UIX_PREVIEW_ROLES) {
      expect(evaluateSteelUixPreviewAccess('true', role)).toBe(true);
    }
  });

  it('deniega para roles fuera de la lista de preview, con env activo', () => {
    expect(evaluateSteelUixPreviewAccess('true', 'obra')).toBe(false);
    expect(evaluateSteelUixPreviewAccess('true', 'compras')).toBe(false);
    expect(evaluateSteelUixPreviewAccess('true', 'consulta')).toBe(false);
  });

  it('deniega sin rol (nulo/ausente) aunque el env esté activo', () => {
    expect(evaluateSteelUixPreviewAccess('true', null)).toBe(false);
    expect(evaluateSteelUixPreviewAccess('true', undefined)).toBe(false);
  });

  it('la lista de roles de preview es admin/gerencia/presupuestos (espejo de D1)', () => {
    expect([...STEEL_UIX_PREVIEW_ROLES].sort()).toEqual(['admin', 'gerencia', 'presupuestos'].sort());
  });
});
