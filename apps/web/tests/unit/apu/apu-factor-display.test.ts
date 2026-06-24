/**
 * apu-factor-display.test.ts — Capa de presentación read-only de factores APU
 * (APU_SMART_DEFAULTS_V1A). Solo helpers puros; sin DB, sin cálculo financiero.
 */
import { describe, it, expect } from 'vitest';
import {
  describeWasteFactor,
  formatFractionPct,
  formatSuggestedRange,
  resolveRecommendedWaste,
  isWastePctOverridden,
  wastePctDelta,
  canEditWastePct,
  FACTOR_MICROCOPY,
  MATERIAL_WASTE_SUGGESTED,
} from '@/app/(dashboard)/apu/_lib/apu-factor-display';

describe('describeWasteFactor — origen/chip', () => {
  it('material importado con desperdicio → chip "Importado (Excel)"', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0.08', apuOriginType: 'workbook_import' });
    expect(d.chipKind).toBe('excel');
    expect(d.chipLabel).toBe('Importado (Excel)');
    expect(d.hasWaste).toBe(true);
  });

  it('material manual con desperdicio → chip "Manual"', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0.05', apuOriginType: 'manual' });
    expect(d.chipKind).toBe('manual');
  });

  it('origen desconocido con desperdicio → "Sin clasificar" (no inventa "Recomendado")', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0.05', apuOriginType: undefined });
    expect(d.chipKind).toBe('unclassified');
  });

  it('sin desperdicio (0) → chip "Sin desperdicio"', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0', apuOriginType: 'manual' });
    expect(d.chipKind).toBe('none');
    expect(d.hasWaste).toBe(false);
  });
});

describe('describeWasteFactor — rango y fuera de rango', () => {
  it('material dentro de rango (≤10%) → sin advertencia', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0.10', apuOriginType: 'manual' });
    expect(d.suggestedRange).toEqual({ min: 0, max: 0.1 });
    expect(d.outOfRange).toBe(false);
    expect(d.warning).toBeNull();
  });

  it('material fuera de rango (>10%) → advertencia (no bloqueante)', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0.12', apuOriginType: 'manual' });
    expect(d.outOfRange).toBe(true);
    expect(d.warning).toBe(FACTOR_MICROCOPY.outOfRange);
  });

  it('mano de obra: no aplica rango (suggestedRange null), nunca fuera de rango', () => {
    const d = describeWasteFactor({ componentType: 'labor', wastePct: '0.30', apuOriginType: 'manual' });
    expect(d.suggestedRange).toBeNull();
    expect(d.outOfRange).toBe(false);
    expect(d.applies).toBe(false);
  });

  it('material con 0 desperdicio no marca fuera de rango', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: '0', apuOriginType: 'manual' });
    expect(d.outOfRange).toBe(false);
  });

  it('valor inválido degrada a 0 sin lanzar', () => {
    const d = describeWasteFactor({ componentType: 'material', wastePct: 'abc' as never, apuOriginType: 'manual' });
    expect(d.hasWaste).toBe(false);
    expect(d.outOfRange).toBe(false);
  });
});

describe('formato', () => {
  it('formatFractionPct: entero sin decimales, fracción con un decimal', () => {
    expect(formatFractionPct(0.1)).toBe('10%');
    expect(formatFractionPct(0.075)).toBe('7.5%');
    expect(formatFractionPct(0)).toBe('0%');
  });

  it('formatSuggestedRange usa la banda de material', () => {
    expect(formatSuggestedRange(MATERIAL_WASTE_SUGGESTED)).toBe('0% – 10%');
  });
});

// ── V1B: lógica read-side de override (recomendado vs aplicado) ──
describe('resolveRecommendedWaste — fallback', () => {
  it('recomendado null/undefined → recomendado = aplicado', () => {
    expect(resolveRecommendedWaste('0.08', null)).toBe('0.08');
    expect(resolveRecommendedWaste('0.08', undefined)).toBe('0.08');
  });
  it('recomendado presente → se respeta', () => {
    expect(resolveRecommendedWaste('0.12', '0.07')).toBe('0.07');
  });
});

describe('isWastePctOverridden', () => {
  it('aplicado = recomendado → false', () => {
    expect(isWastePctOverridden('0.07', '0.07')).toBe(false);
  });
  it('sin recomendado (fallback = aplicado) → false', () => {
    expect(isWastePctOverridden('0.07', null)).toBe(false);
  });
  it('aplicado distinto del recomendado → true', () => {
    expect(isWastePctOverridden('0.12', '0.07')).toBe(true);
  });
});

describe('wastePctDelta', () => {
  it('delta aplicado − recomendado', () => {
    expect(wastePctDelta('0.12', '0.07')).toBeCloseTo(0.05, 9);
    expect(wastePctDelta('0.07', '0.07')).toBe(0);
    expect(wastePctDelta('0.07', null)).toBe(0);
  });
});

describe('canEditWastePct — gating (espejo de RPC; duda → false)', () => {
  it('sin modo creación → false', () => {
    expect(canEditWastePct({ creationMode: false, role: 'management', archived: false })).toBe(false);
  });
  it('APU archivado → false aunque tenga rol y modo', () => {
    expect(canEditWastePct({ creationMode: true, role: 'management', archived: true })).toBe(false);
  });
  it('rol no interno → false', () => {
    expect(canEditWastePct({ creationMode: true, role: 'client', archived: false })).toBe(false);
  });
  it('management/internal + modo creación + no archivado → true', () => {
    expect(canEditWastePct({ creationMode: true, role: 'management', archived: false })).toBe(true);
    expect(canEditWastePct({ creationMode: true, role: 'internal', archived: false })).toBe(true);
  });
});
