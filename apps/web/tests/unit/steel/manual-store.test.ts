import { describe, it, expect } from 'vitest';
import {
  loadManualTakeoffs,
  MANUAL_TAKEOFFS_STORAGE_KEY,
  parseStoredManualTakeoffs,
  saveManualTakeoffs,
  serializeManualTakeoffs,
} from '@/lib/steel/manual-store';
import type { ManualTakeoffRecord } from '@/lib/steel/manual-takeoff';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const VALID_TAKEOFF: ManualTakeoffRecord = {
  id: 'mtk-abc',
  name: 'Refuerzo etapa 1',
  projectName: 'Proyecto Alfa',
  scopeLabel: 'Torre A / Piso 1',
  status: 'in_review',
  createdAt: '2026-07-03',
  lines: [
    { id: 'line-1', originalDescription: '5#5600', assumedWastePct: '5' },
    { id: 'line-2', originalDescription: '15 + 35 + 15', assumedWastePct: '0', manualBarNumber: 3 },
  ],
};

describe('manual-store (persistencia local defensiva F3)', () => {
  it('parseo fail-safe: null, JSON inválido o no-array devuelven lista vacía sin lanzar', () => {
    expect(parseStoredManualTakeoffs(null)).toEqual([]);
    expect(parseStoredManualTakeoffs('{corrupto')).toEqual([]);
    expect(parseStoredManualTakeoffs('{"no":"array"}')).toEqual([]);
    expect(parseStoredManualTakeoffs('"texto"')).toEqual([]);
  });

  it('round-trip: serializar y parsear preserva takeoffs y líneas', () => {
    const parsed = parseStoredManualTakeoffs(serializeManualTakeoffs([VALID_TAKEOFF]));
    expect(parsed).toEqual([VALID_TAKEOFF]);
  });

  it('descarta items corruptos y normaliza campos inválidos', () => {
    const raw = JSON.stringify([
      VALID_TAKEOFF,
      { id: '', name: 'sin id' }, // inválido: id vacío
      'no soy objeto',
      {
        id: 'mtk-x',
        name: 'Estado y líneas raras',
        status: 'estado-desconocido', // → draft
        lines: [
          { id: 'ok', originalDescription: '74E#3200', assumedWastePct: 'no-numérico' }, // → '0'
          { id: '', originalDescription: 'sin id' }, // línea descartada
          null,
        ],
      },
    ]);
    const parsed = parseStoredManualTakeoffs(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.status).toBe('draft');
    expect(parsed[1]?.lines).toHaveLength(1);
    expect(parsed[1]?.lines[0]?.assumedWastePct).toBe('0');
    expect(parsed[1]?.projectName).toBe('');
  });

  it('save/load funcionan contra un Storage inyectado bajo la clave versionada', () => {
    const storage = fakeStorage();
    saveManualTakeoffs([VALID_TAKEOFF], storage);
    expect(storage.getItem(MANUAL_TAKEOFFS_STORAGE_KEY)).toBeTruthy();
    expect(loadManualTakeoffs(storage)).toEqual([VALID_TAKEOFF]);
  });

  it('load con storage vacío o corrupto devuelve lista vacía', () => {
    expect(loadManualTakeoffs(fakeStorage())).toEqual([]);
    expect(
      loadManualTakeoffs(fakeStorage({ [MANUAL_TAKEOFFS_STORAGE_KEY]: '{{{' })),
    ).toEqual([]);
  });
});
