/**
 * unit-alias.test.ts — UNIT_ALIAS_NORMALIZATION_V1 (Fase 4A).
 * Mandato: tests 7-13 (aliases) + integración con price-list (sin warning falso
 * para el caso real Decorcerámica: archivo "m2" vs recurso "m²").
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeUnit, unitsEquivalent, UNIT_ALIAS_TABLE } from '@/server/pricing/units';
import { buildPriceListPreview } from '@/server/catalog/import/price-list';
import { resolveMapping } from '@/server/catalog/import/mapping';
import { parseCatalogFile } from '@/server/catalog/import/parse-file';
import { PRICE_LIST_FIELDS } from '@/lib/catalog-import/types';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';

describe('UNIT_ALIAS_NORMALIZATION_V1 — canonicalizeUnit', () => {
  // Test 7: m2 = m²
  it('UA-07: m2 equivale a m²', () => {
    expect(unitsEquivalent('m2', 'm²')).toBe(true);
    expect(canonicalizeUnit('m2').canonical).toBe('m²');
  });

  // Test 8: M2 = m²
  it('UA-08: M2 (mayúscula) equivale a m²', () => {
    expect(unitsEquivalent('M2', 'm²')).toBe(true);
    expect(canonicalizeUnit('M2').canonical).toBe('m²');
  });

  // Test 9: metro cuadrado = m²
  it('UA-09: "metro cuadrado" y "metros cuadrados" equivalen a m²', () => {
    expect(unitsEquivalent('metro cuadrado', 'm²')).toBe(true);
    expect(unitsEquivalent('Metros  Cuadrados', 'm2')).toBe(true);
  });

  // Test 10: und = unidad
  it('UA-10: und, unidad y unidades equivalen', () => {
    expect(unitsEquivalent('und', 'unidad')).toBe(true);
    expect(unitsEquivalent('UNIDADES', 'und')).toBe(true);
    expect(canonicalizeUnit('unidad').canonical).toBe('und');
  });

  // Test 11: dia = día
  it('UA-11: dia, día y jornada equivalen', () => {
    expect(unitsEquivalent('dia', 'día')).toBe(true);
    expect(unitsEquivalent('jornada', 'dia')).toBe(true);
    expect(canonicalizeUnit('jornada').canonical).toBe('día');
  });

  // Test 12: raw unit preservada
  it('UA-12: el valor raw original se preserva intacto', () => {
    const r = canonicalizeUnit('  M2 ');
    expect(r.raw).toBe('  M2 ');
    expect(r.canonical).toBe('m²');
    expect(r.recognized).toBe(true);
  });

  // Test 13: unidades realmente distintas NO equivalen (generarán warning)
  it('UA-13: unidades semánticamente distintas no equivalen', () => {
    expect(unitsEquivalent('m²', 'und')).toBe(false);
    expect(unitsEquivalent('m2', 'm3')).toBe(false);
    expect(unitsEquivalent('día', 'hora')).toBe(false);
  });

  it('UA-extra: unidades fuera de tabla comparan léxicamente sin inventar', () => {
    expect(canonicalizeUnit('kg').recognized).toBe(false);
    expect(unitsEquivalent('kg', 'KG ')).toBe(true);
    expect(unitsEquivalent('kg', 'g')).toBe(false);
  });

  it('UA-extra: vacío solo equivale a vacío', () => {
    expect(unitsEquivalent('', '')).toBe(true);
    expect(unitsEquivalent(null, undefined)).toBe(true);
    expect(unitsEquivalent('', 'm2')).toBe(false);
  });

  it('UA-extra: la tabla documentada cubre los tres grupos del mandato', () => {
    const canonicals = UNIT_ALIAS_TABLE.map((g) => g.canonical);
    expect(canonicals).toEqual(['m²', 'und', 'día']);
    for (const group of UNIT_ALIAS_TABLE) {
      for (const alias of group.aliases) {
        expect(canonicalizeUnit(alias).canonical).toBe(group.canonical);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Integración con la lista de precios de proveedor.
// ---------------------------------------------------------------------------

const PROVIDER = { id: 'prov-decorceramica', name: 'Decorcerámica' };

const RESOURCES: ResourceIdentifier[] = [
  {
    id: 'r-sku-6751',
    code: 'MAT-PORC-DC-001',
    name: 'Dolce Vita Sei 20x20 Negro',
    unit: 'm²',
    externalSku: '6751',
    externalReference: 'KP04NG1620',
  },
];

function buildPreview(csvLines: string[]) {
  const buf = Buffer.from(csvLines.join('\n'), 'utf8');
  const parsed = parseCatalogFile(buf, 'unidades.csv');
  const mapping = resolveMapping(parsed.headers, null, PRICE_LIST_FIELDS);
  return buildPriceListPreview(parsed, mapping, RESOURCES, PROVIDER, 'unidades.csv');
}

describe('UNIT_ALIAS_NORMALIZATION_V1 — price-list sin warning falso', () => {
  it('UA-PL-1: unidad de archivo m2 vs recurso m² ⇒ SIN warning de unidad', () => {
    const { allReports } = buildPreview(['sku,precio,unidad', '6751,169000,m2']);
    expect(allReports).toHaveLength(1);
    expect(allReports[0]!.status).toBe('matched');
    expect(allReports[0]!.messages.join(' ')).not.toMatch(/difiere/i);
  });

  it('UA-PL-2: unidad realmente distinta (und vs m²) ⇒ SÍ warning', () => {
    const { allReports } = buildPreview(['sku,precio,unidad', '6751,169000,und']);
    expect(allReports).toHaveLength(1);
    expect(allReports[0]!.status).toBe('matched');
    expect(allReports[0]!.messages.join(' ')).toMatch(/difiere/i);
  });

  it('UA-PL-3: la observación conserva la unidad RAW del archivo', () => {
    const { matchedRows } = buildPreview(['sku,precio,unidad', '6751,169000,m2']);
    expect(matchedRows[0]?.unit).toBe('m2');
  });
});
