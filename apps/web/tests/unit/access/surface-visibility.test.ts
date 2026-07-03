import { describe, expect, it } from 'vitest';
import { canUseQuoteAssistant, canUseWriteSurface } from '@/lib/access/surface-visibility';

describe('surface visibility', () => {
  it('habilita Asistente solo para roles con estimates + APU y no consulta', () => {
    expect(canUseQuoteAssistant('admin')).toBe(true);
    expect(canUseQuoteAssistant('gerencia')).toBe(true);
    expect(canUseQuoteAssistant('presupuestos')).toBe(true);

    expect(canUseQuoteAssistant('obra')).toBe(false);
    expect(canUseQuoteAssistant('compras')).toBe(false);
    expect(canUseQuoteAssistant('consulta')).toBe(false);
    expect(canUseQuoteAssistant(null)).toBe(false);
  });

  it('oculta superficies de escritura para consulta', () => {
    expect(canUseWriteSurface('admin')).toBe(true);
    expect(canUseWriteSurface('obra')).toBe(true);
    expect(canUseWriteSurface('compras')).toBe(true);
    expect(canUseWriteSurface('consulta')).toBe(false);
  });
});
