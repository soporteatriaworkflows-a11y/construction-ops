import { describe, it, expect } from 'vitest';
import {
  MOCK_STEEL_BOQ_LINKS,
  MOCK_STEEL_ELEMENTS,
  MOCK_STEEL_ORDERS,
  MOCK_STEEL_PROFILE_LINES,
  MOCK_STEEL_SETTINGS,
  MOCK_STEEL_SPECS,
  MOCK_STEEL_TAKEOFFS,
  STEEL_RAW_DESCRIPTIONS,
} from '@/lib/steel/mock-data';

const REQUIRED_ELEMENT_TYPES = [
  'zapata',
  'viga_cimentacion',
  'columna',
  'pilote',
  'losa',
  'escalera',
  'perfil_ipe',
  'tubo_estructural',
  'platina',
  'malla_electrosoldada',
];

const REQUIRED_PARSER_CASES = ['5#5600', '74E#3200', '2X65E#3182', '10#7205 @ 15CM', '#4 L=0.62', '15 + 35 + 15'];

describe('mock-data de Steel Ops (preview UIX)', () => {
  it('ninguna colección mock está vacía', () => {
    expect(MOCK_STEEL_TAKEOFFS.length).toBeGreaterThan(0);
    expect(MOCK_STEEL_ELEMENTS.length).toBeGreaterThan(0);
    expect(STEEL_RAW_DESCRIPTIONS.length).toBeGreaterThan(0);
    expect(MOCK_STEEL_PROFILE_LINES.length).toBeGreaterThan(0);
    expect(MOCK_STEEL_SPECS.length).toBeGreaterThan(0);
    expect(MOCK_STEEL_ORDERS.length).toBeGreaterThan(0);
    expect(MOCK_STEEL_BOQ_LINKS.length).toBeGreaterThan(0);
  });

  it('incluye los 10 tipos de elemento pedidos para esta oleada', () => {
    const types = new Set<string>(MOCK_STEEL_ELEMENTS.map((e) => e.elementType));
    for (const required of REQUIRED_ELEMENT_TYPES) {
      expect(types.has(required)).toBe(true);
    }
  });

  it('incluye los 6 casos de parser pedidos', () => {
    const descriptions = STEEL_RAW_DESCRIPTIONS.map((r) => r.originalDescription);
    for (const required of REQUIRED_PARSER_CASES) {
      expect(descriptions).toContain(required);
    }
  });

  it('cada takeoff referenciado por un elemento existe', () => {
    const takeoffIds = new Set(MOCK_STEEL_TAKEOFFS.map((t) => t.id));
    for (const el of MOCK_STEEL_ELEMENTS) {
      expect(takeoffIds.has(el.takeoffId)).toBe(true);
    }
  });

  it('cada descripción cruda referencia un elemento existente', () => {
    const elementIds = new Set(MOCK_STEEL_ELEMENTS.map((e) => e.id));
    for (const raw of STEEL_RAW_DESCRIPTIONS) {
      expect(elementIds.has(raw.elementId)).toBe(true);
    }
  });

  it('settings D3/D5 tienen los defaults acordados', () => {
    expect(MOCK_STEEL_SETTINGS.commercialLengthsM).toEqual(['6', '9', '12']);
    expect(MOCK_STEEL_SETTINGS.kerfRebarM).toBe('0');
    expect(MOCK_STEEL_SETTINGS.wasteWarningPctRebar).toBe('8');
    expect(MOCK_STEEL_SETTINGS.wasteCriticalPctRebar).toBe('12');
    expect(MOCK_STEEL_SETTINGS.wasteWarningPctProfiles).toBe('5');
    expect(MOCK_STEEL_SETTINGS.wasteCriticalPctProfiles).toBe('8');
  });
});
