/**
 * apu-material-consumption-override.test.ts — Validación, repository (RPC) y
 * read-model wiring del override de consumo material
 * (APU_MATERIAL_CONSUMPTION_OVERRIDES_V1). Cliente Supabase mockeado (no DB real).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import {
  updateApuComponentMaterialConsumptionOverride,
  resetApuComponentMaterialConsumptionOverride,
  validateMaterialConsumptionInput,
  mapMaterialConsumptionRpcError,
  MaterialConsumptionError,
} from '@/server/apu-material-overrides';
import { computeApuDetail, type RawApuComponent } from '@/server/read-model/compute';
import { projectApuDetailForRole } from '@/server/read-model/types';

const CID = '00000000-0000-4000-8000-000000000abc';

beforeEach(() => rpcMock.mockReset());

describe('validateMaterialConsumptionInput', () => {
  it('rechaza componentId no UUID', () => {
    expect(() => validateMaterialConsumptionInput({ componentId: 'x', quantity: '0.05' })).toThrowError(MaterialConsumptionError);
  });
  it('rechaza quantity <= 0', () => {
    expect(() => validateMaterialConsumptionInput({ componentId: CID, quantity: '0' })).toThrowError(MaterialConsumptionError);
    expect(() => validateMaterialConsumptionInput({ componentId: CID, quantity: '-1' })).toThrowError(MaterialConsumptionError);
  });
  it('acepta consumo válido y normaliza la nota vacía a null', () => {
    const v = validateMaterialConsumptionInput({ componentId: CID, quantity: '0.06', note: '   ' });
    expect(v.quantity).toBe('0.06');
    expect(v.note).toBeNull();
  });
});

describe('mapMaterialConsumptionRpcError', () => {
  it('mapea cada código', () => {
    for (const code of ['no_session','no_membership','insufficient_role','component_not_found','not_material_component','apu_archived','invalid_quantity','no_recommended_baseline'] as const) {
      expect(mapMaterialConsumptionRpcError({ message: `error: ${code}` }).code).toBe(code);
    }
  });
  it('desconocido → unknown_error', () => {
    expect(mapMaterialConsumptionRpcError({ message: 'boom' }).code).toBe('unknown_error');
  });
});

describe('updateApuComponentMaterialConsumptionOverride — RPC', () => {
  it('llama la RPC update con los parámetros correctos y mapea el resultado', async () => {
    rpcMock.mockResolvedValue({ data: { componentId: CID, quantity: '0.05', recommendedMaterialQuantity: '0.06', overridden: true }, error: null });
    const res = await updateApuComponentMaterialConsumptionOverride({ componentId: CID, quantity: '0.05', note: '  ' });
    expect(rpcMock).toHaveBeenCalledWith('update_apu_component_material_consumption_override', { p_component_id: CID, p_quantity: '0.05', p_note: null });
    expect(res).toEqual({ componentId: CID, quantity: '0.05', recommendedMaterialQuantity: '0.06', overridden: true });
  });
  it('NO envía p_waste_pct ni p_unit_price (no toca desperdicio/precio)', async () => {
    rpcMock.mockResolvedValue({ data: { componentId: CID, quantity: '0.05' }, error: null });
    await updateApuComponentMaterialConsumptionOverride({ componentId: CID, quantity: '0.05' });
    const call = rpcMock.mock.calls[0];
    if (!call) throw new Error('RPC no invocada');
    const args = call[1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain('p_waste_pct');
    expect(Object.keys(args)).not.toContain('p_unit_price_snapshot');
  });
  it('mapea error not_material_component', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_material_component' } });
    await expect(updateApuComponentMaterialConsumptionOverride({ componentId: CID, quantity: '0.05' })).rejects.toMatchObject({ code: 'not_material_component' });
  });
});

describe('resetApuComponentMaterialConsumptionOverride — RPC', () => {
  it('llama la RPC reset y mapea el resultado', async () => {
    rpcMock.mockResolvedValue({ data: { componentId: CID, quantity: '0.06', reset: true }, error: null });
    const res = await resetApuComponentMaterialConsumptionOverride(CID);
    expect(rpcMock).toHaveBeenCalledWith('reset_apu_component_material_consumption_override', { p_component_id: CID });
    expect(res).toEqual({ componentId: CID, quantity: '0.06', reset: true });
  });
  it('mapea error no_recommended_baseline', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'no_recommended_baseline' } });
    await expect(resetApuComponentMaterialConsumptionOverride(CID)).rejects.toMatchObject({ code: 'no_recommended_baseline' });
  });
});

describe('read-model wiring — material consumption', () => {
  const materialRow: RawApuComponent = {
    id: CID,
    componentType: 'material',
    quantity: '0.06',
    wastePct: '0.08',
    unitPriceSnapshot: '12000',
    totalComponentCost: '777.6',
    sortOrder: 0,
    recommendedMaterialQuantity: '0.06',
    materialQuantitySource: 'manual',
    materialQuantityNote: 'rendimiento real',
  };

  it('expone los campos de consumo material (rol interno)', () => {
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [materialRow]);
    const view = detail.components[0];
    if (!view) throw new Error('sin componente');
    expect(view.recommendedMaterialQuantity).toBe('0.06');
    expect(view.materialQuantitySource).toBe('manual');
    expect(view.materialQuantityNote).toBe('rendimiento real');
    // precio y desperdicio NO se alteran.
    expect(view.unitPriceSnapshot).toBe('12000');
    expect(view.wastePct).toBe('0.08');
  });

  it('rol client NO recibe materialQuantityNote (🔒)', () => {
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [materialRow]);
    const projected = projectApuDetailForRole(detail, 'client');
    const pview = projected.components[0];
    if (!pview) throw new Error('sin componente');
    expect(pview.materialQuantityNote).toBeUndefined();
    expect(pview.materialQuantitySource).toBe('manual');
  });

  it('componente labor no recibe metadata de consumo material', () => {
    const laborRow: RawApuComponent = { id: CID, componentType: 'labor', quantity: '0.5', wastePct: '0', unitPriceSnapshot: '100000', totalComponentCost: '50000', sortOrder: 0 };
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [laborRow]);
    const view = detail.components[0];
    if (!view) throw new Error('sin componente');
    expect(view.recommendedMaterialQuantity).toBeUndefined();
    expect(view.materialQuantitySource).toBeUndefined();
  });
});
