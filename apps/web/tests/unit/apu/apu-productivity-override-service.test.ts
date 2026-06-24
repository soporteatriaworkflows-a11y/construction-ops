/**
 * apu-productivity-override-service.test.ts — Validación, repository (RPC) y
 * read-model wiring del override de rendimiento (APU_PRODUCTIVITY_CREW_OVERRIDES_V1C).
 * No toca DB real: el cliente Supabase está mockeado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import {
  updateApuComponentLaborProductivityOverride,
  resetApuComponentLaborProductivityOverride,
  validateProductivityOverride,
  mapProductivityOverrideRpcError,
  ProductivityOverrideError,
} from '@/server/apu-productivity-overrides';
import { computeApuDetail, type RawApuComponent } from '@/server/read-model/compute';
import { projectApuDetailForRole } from '@/server/read-model/types';

const CID = '00000000-0000-4000-8000-000000000abc';

beforeEach(() => rpcMock.mockReset());

describe('validateProductivityOverride', () => {
  it('rechaza componentId no UUID', () => {
    expect(() => validateProductivityOverride({ componentId: 'x', productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: '2' }))
      .toThrowError(ProductivityOverrideError);
  });
  it('rechaza productivity <= 0', () => {
    try { validateProductivityOverride({ componentId: CID, productivityUnit: 'unit_per_crew_day', productivity: '0', crewSize: '2' }); }
    catch (e) { expect((e as ProductivityOverrideError).code).toBe('invalid_productivity'); }
  });
  it('rechaza crew_size faltante en unit_per_crew_day', () => {
    try { validateProductivityOverride({ componentId: CID, productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: null }); }
    catch (e) { expect((e as ProductivityOverrideError).code).toBe('invalid_crew_size'); }
  });
  it('rechaza unidad inválida', () => {
    try { validateProductivityOverride({ componentId: CID, productivityUnit: 'per_hour', productivity: '4', crewSize: '2' }); }
    catch (e) { expect((e as ProductivityOverrideError).code).toBe('invalid_productivity_unit'); }
  });
  it('acepta person_day_per_unit sin crew', () => {
    const v = validateProductivityOverride({ componentId: CID, productivityUnit: 'person_day_per_unit', productivity: '0.4' });
    expect(v.productivityUnit).toBe('person_day_per_unit');
    expect(v.crewSize).toBeNull();
  });
});

describe('mapProductivityOverrideRpcError', () => {
  it('mapea cada código', () => {
    for (const code of ['no_session','no_membership','insufficient_role','component_not_found','not_labor_component','apu_archived','invalid_crew_size','no_recommended_baseline'] as const) {
      expect(mapProductivityOverrideRpcError({ message: `error: ${code}` }).code).toBe(code);
    }
  });
  it('distingue invalid_productivity_unit de invalid_productivity (orden de substring)', () => {
    expect(mapProductivityOverrideRpcError({ message: 'invalid_productivity_unit' }).code).toBe('invalid_productivity_unit');
    expect(mapProductivityOverrideRpcError({ message: 'invalid_productivity' }).code).toBe('invalid_productivity');
  });
  it('desconocido → unknown_error', () => {
    expect(mapProductivityOverrideRpcError({ message: 'boom' }).code).toBe('unknown_error');
  });
});

describe('updateApuComponentLaborProductivityOverride — RPC', () => {
  it('llama la RPC update con los parámetros correctos y mapea el resultado', async () => {
    rpcMock.mockResolvedValue({
      data: { componentId: CID, quantity: '0.5', recommendedLaborQuantity: '0.6', appliedProductivity: '4', productivityUnit: 'unit_per_crew_day', appliedCrewSize: '2' },
      error: null,
    });
    const res = await updateApuComponentLaborProductivityOverride({ componentId: CID, productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: '2', note: '  ' });
    expect(rpcMock).toHaveBeenCalledWith('update_apu_component_labor_productivity_override', {
      p_component_id: CID, p_productivity: '4', p_crew_size: '2', p_productivity_unit: 'unit_per_crew_day', p_note: null,
    });
    expect(res).toEqual({ componentId: CID, quantity: '0.5', recommendedLaborQuantity: '0.6', appliedProductivity: '4', productivityUnit: 'unit_per_crew_day', appliedCrewSize: '2' });
  });
  it('mapea error RPC not_labor_component', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_labor_component' } });
    await expect(updateApuComponentLaborProductivityOverride({ componentId: CID, productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: '2' }))
      .rejects.toMatchObject({ code: 'not_labor_component' });
  });
  it('NO envía p_waste_pct ni p_unit_price (no toca desperdicio/precio)', async () => {
    rpcMock.mockResolvedValue({ data: { componentId: CID, quantity: '0.4' }, error: null });
    await updateApuComponentLaborProductivityOverride({ componentId: CID, productivityUnit: 'person_day_per_unit', productivity: '0.4' });
    const call = rpcMock.mock.calls[0];
    if (!call) throw new Error('RPC no fue invocada');
    const args = call[1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain('p_waste_pct');
    expect(Object.keys(args)).not.toContain('p_unit_price_snapshot');
    expect(args.p_crew_size).toBeNull();
  });
});

describe('resetApuComponentLaborProductivityOverride — RPC', () => {
  it('llama la RPC reset y mapea el resultado', async () => {
    rpcMock.mockResolvedValue({ data: { componentId: CID, quantity: '0.6', reset: true }, error: null });
    const res = await resetApuComponentLaborProductivityOverride(CID);
    expect(rpcMock).toHaveBeenCalledWith('reset_apu_component_labor_productivity_override', { p_component_id: CID });
    expect(res).toEqual({ componentId: CID, quantity: '0.6', reset: true });
  });
  it('mapea error no_recommended_baseline', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'no_recommended_baseline' } });
    await expect(resetApuComponentLaborProductivityOverride(CID)).rejects.toMatchObject({ code: 'no_recommended_baseline' });
  });
});

describe('read-model wiring — computeApuDetail mapea campos productivity', () => {
  const laborRow: RawApuComponent = {
    id: CID,
    componentType: 'labor',
    quantity: '0.5',
    wastePct: '0',
    unitPriceSnapshot: '100000',
    totalComponentCost: '50000',
    sortOrder: 0,
    recommendedLaborQuantity: '0.6',
    appliedProductivity: '4',
    productivityUnit: 'unit_per_crew_day',
    appliedCrewSize: '2',
    productivitySource: 'manual',
    productivityNote: 'cuadrilla reforzada',
  };

  it('expone los campos productivity en la vista (rol interno)', () => {
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [laborRow]);
    const view = detail.components[0];
    if (!view) throw new Error('sin componente');
    expect(view.appliedProductivity).toBe('4');
    expect(view.productivityUnit).toBe('unit_per_crew_day');
    expect(view.appliedCrewSize).toBe('2');
    expect(view.recommendedLaborQuantity).toBe('0.6');
    expect(view.productivitySource).toBe('manual');
    expect(view.productivityNote).toBe('cuadrilla reforzada');
    // quantity y precio NO se alteran.
    expect(view.quantity).toBe('0.5');
    expect(view.unitPriceSnapshot).toBe('100000');
    expect(view.wastePct).toBe('0');
  });

  it('rol client NO recibe productivityNote (🔒)', () => {
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [laborRow]);
    const projected = projectApuDetailForRole(detail, 'client');
    const pview = projected.components[0];
    if (!pview) throw new Error('sin componente');
    expect(pview.productivityNote).toBeUndefined();
    // pero los valores no sensibles sí permanecen.
    expect(pview.appliedProductivity).toBe('4');
  });

  it('componente material no recibe metadata de rendimiento', () => {
    const materialRow: RawApuComponent = { id: CID, componentType: 'material', quantity: '5', wastePct: '0.08', unitPriceSnapshot: '1000', totalComponentCost: '5400', sortOrder: 0 };
    const detail = computeApuDetail({ id: 't1', code: 'A', name: 'n', unit: 'm2', version: 1, defaultToolPct: '0' }, [materialRow]);
    const mview = detail.components[0];
    if (!mview) throw new Error('sin componente');
    expect(mview.appliedProductivity).toBeUndefined();
    expect(mview.productivitySource).toBeUndefined();
  });
});
