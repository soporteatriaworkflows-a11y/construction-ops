/**
 * waste-override-validation.test.ts — Lógica pura del override de desperdicio
 * (APU_SMART_DEFAULTS_V1B). Sin DB; el backstop real es la RPC.
 */
import { describe, it, expect } from 'vitest';
import {
  validateWasteOverrideInput,
  mapWasteOverrideRpcError,
  WasteOverrideError,
  WASTE_OVERRIDE_MESSAGES,
} from '@/server/apu-overrides/validation';

const CID = '00000000-0000-4000-8000-0000000000a1';

describe('validateWasteOverrideInput', () => {
  it('normaliza entrada válida (trim de nota)', () => {
    const v = validateWasteOverrideInput({ componentId: CID, wastePct: '0.08', note: '  ok  ' });
    expect(v).toEqual({ componentId: CID, wastePct: 0.08, note: 'ok' });
  });

  it('nota vacía → null', () => {
    expect(validateWasteOverrideInput({ componentId: CID, wastePct: '0', note: '   ' }).note).toBeNull();
  });

  it('componentId inválido → invalid_component', () => {
    expect(() => validateWasteOverrideInput({ componentId: 'nope', wastePct: '0.1' }))
      .toThrowError(expect.objectContaining({ code: 'invalid_component' }));
  });

  it('rechaza fuera de rango (>1, <0, NaN)', () => {
    for (const bad of ['1.5', '-0.1', 'abc']) {
      expect(() => validateWasteOverrideInput({ componentId: CID, wastePct: bad }))
        .toThrowError(expect.objectContaining({ code: 'invalid_waste_pct' }));
    }
  });

  it('acepta límites 0 y 1', () => {
    expect(validateWasteOverrideInput({ componentId: CID, wastePct: '0' }).wastePct).toBe(0);
    expect(validateWasteOverrideInput({ componentId: CID, wastePct: '1' }).wastePct).toBe(1);
  });
});

describe('mapWasteOverrideRpcError', () => {
  it('mapea códigos de dominio de la RPC', () => {
    for (const code of ['no_session', 'insufficient_role', 'apu_archived', 'invalid_waste_pct', 'component_not_found'] as const) {
      const e = mapWasteOverrideRpcError({ message: code, code: '42501' });
      expect(e).toBeInstanceOf(WasteOverrideError);
      expect(e.code).toBe(code);
      expect(e.message).toBe(WASTE_OVERRIDE_MESSAGES[code]);
    }
  });

  it('error desconocido → override_failed', () => {
    expect(mapWasteOverrideRpcError({ message: 'something weird' }).code).toBe('override_failed');
    expect(mapWasteOverrideRpcError(null).code).toBe('override_failed');
  });
});
