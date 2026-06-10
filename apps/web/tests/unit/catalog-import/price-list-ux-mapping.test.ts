/**
 * price-list-ux-mapping.test.ts — Lógica de mapeo y panel avanzado UX
 * (PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1).
 *
 * Pruebas 16–21 del spec de hotfix (lógica pura, sin React):
 * 16. Auto-mapeo cierra panel avanzado cuando mapeo obligatorio está completo.
 * 17. Faltantes abren panel avanzado.
 * 18. Columnas duplicadas incompatibles se rechazan (una columna → un campo).
 * 19. Preview se recalcula con nuevo mapeo.
 * 20. Catálogo conserva su contrato original (code, name, resourceType, unit).
 * 21. Importación de catálogo continúa funcionando con su propio contrato.
 */
import { describe, it, expect } from 'vitest';
import { resolveMapping, suggestMapping } from '@/server/catalog/import/mapping';
import { buildCatalogImportPreview } from '@/server/catalog/import/preview';
import { buildPriceListPreview } from '@/server/catalog/import/price-list';
import { parseCatalogFile } from '@/server/catalog/import/parse-file';
import {
  PRICE_LIST_FIELDS,
  CATALOG_REQUIRED_FIELDS,
  type ColumnAssignment,
} from '@/lib/catalog-import/types';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IDENTIFIER_FIELDS = ['externalSku', 'externalReference', 'code'] as const;

/** Replica la lógica de isPriceListMappingComplete del wizard. */
function isPriceListMappingComplete(mapping: ColumnAssignment[]): boolean {
  const mapped = new Set(mapping.filter((a) => a.columnIndex !== null).map((a) => a.field));
  return mapped.has('observedPrice') && IDENTIFIER_FIELDS.some((f) => mapped.has(f));
}

/** Replica la lógica de isCatalogMappingComplete del wizard. */
function isCatalogMappingComplete(mapping: ColumnAssignment[]): boolean {
  const mapped = new Set(mapping.filter((a) => a.columnIndex !== null).map((a) => a.field));
  return (CATALOG_REQUIRED_FIELDS as readonly string[]).every((f) => mapped.has(f));
}

function parseCsv(lines: string[], name = 'test.csv') {
  return parseCatalogFile(Buffer.from(lines.join('\n'), 'utf8'), name);
}

const RESOURCES: ResourceIdentifier[] = [
  {
    id: 'r-1', code: 'MAT-001', name: 'Recurso A', unit: 'm2',
    externalSku: 'SKU-001', externalReference: null,
  },
];

// ─── Test 16: auto-mapeo completo → panel cerrado ────────────────────────────

describe('PL-16 — auto-mapeo cierra panel cuando mapeo obligatorio está completo', () => {
  it('archivo con externalSku + observedPrice ⇒ mapping completo → panel debe estar cerrado', () => {
    const headers = ['externalSku', 'observedPrice', 'description'];
    const mapping = suggestMapping(headers, PRICE_LIST_FIELDS);
    // El wizard calcula isPriceListMappingComplete sobre el mapping retornado
    expect(isPriceListMappingComplete(mapping)).toBe(true);
    // Panel debe estar CERRADO (negación de lo anterior)
    const shouldOpenPanel = !isPriceListMappingComplete(mapping);
    expect(shouldOpenPanel).toBe(false);
  });

  it('archivo con todos los campos de precio ⇒ auto-detección completa', () => {
    const headers = [
      'externalSku', 'externalReference', 'code',
      'observedPrice', 'discountPercent', 'currency',
    ];
    const mapping = suggestMapping(headers, PRICE_LIST_FIELDS);
    expect(isPriceListMappingComplete(mapping)).toBe(true);
  });
});

// ─── Test 17: faltantes abren panel ──────────────────────────────────────────

describe('PL-17 — faltantes abren panel avanzado', () => {
  it('archivo sin observedPrice ⇒ mapping incompleto → panel debe estar abierto', () => {
    const headers = ['externalSku', 'description'];
    const mapping = suggestMapping(headers, PRICE_LIST_FIELDS);
    expect(isPriceListMappingComplete(mapping)).toBe(false);
    const shouldOpenPanel = !isPriceListMappingComplete(mapping);
    expect(shouldOpenPanel).toBe(true);
  });

  it('archivo sin ningún identificador ⇒ mapping incompleto → panel debe estar abierto', () => {
    const headers = ['observedPrice', 'description'];
    const mapping = suggestMapping(headers, PRICE_LIST_FIELDS);
    expect(isPriceListMappingComplete(mapping)).toBe(false);
  });

  it('archivo sin observedPrice ni identificador ⇒ mapping incompleto', () => {
    const headers = ['description', 'notes'];
    const mapping = suggestMapping(headers, PRICE_LIST_FIELDS);
    expect(isPriceListMappingComplete(mapping)).toBe(false);
  });
});

// ─── Test 18: columnas duplicadas incompatibles se rechazan ──────────────────

describe('PL-18 — columnas duplicadas incompatibles se rechazan', () => {
  it('resolveMapping: una columna no puede asignarse a dos campos', () => {
    const headers = ['precio', 'sku'];
    const conflicting: ColumnAssignment[] = [
      { field: 'observedPrice', columnIndex: 0 },
      { field: 'externalSku', columnIndex: 0 }, // misma columna → debe anularse
    ];
    const mapping = resolveMapping(headers, conflicting, PRICE_LIST_FIELDS);
    const byField = new Map(mapping.map((a) => [a.field, a.columnIndex]));
    // Solo uno de los dos puede tener la columna 0
    const col0Count = mapping.filter((a) => a.columnIndex === 0).length;
    expect(col0Count).toBeLessThanOrEqual(1);
    // El primero en el input gana (observedPrice)
    expect(byField.get('observedPrice')).toBe(0);
    expect(byField.get('externalSku')).toBeNull();
  });

  it('después de re-asignar, el mapeo sigue siendo válido structuralmente', () => {
    const headers = ['col0', 'col1'];
    const mapping = resolveMapping(
      headers,
      [
        { field: 'observedPrice', columnIndex: 0 },
        { field: 'externalSku', columnIndex: 1 },
        { field: 'externalReference', columnIndex: 1 }, // conflicto con externalSku
      ],
      PRICE_LIST_FIELDS,
    );
    // Ninguna columna aparece dos veces
    const usedColumns = mapping.filter((a) => a.columnIndex !== null).map((a) => a.columnIndex);
    const uniqueColumns = new Set(usedColumns);
    expect(usedColumns.length).toBe(uniqueColumns.size);
  });
});

// ─── Test 19: preview se recalcula ───────────────────────────────────────────

describe('PL-19 — preview se recalcula al cambiar mapeo', () => {
  it('mapeo incorrecto → 0 matches; mapeo corregido → 1 match', () => {
    const lines = ['col_sku,col_precio', 'SKU-001,169000'];
    const parsed = parseCsv(lines);

    // Mapeo inicial incorrecto (sin observedPrice mapeado)
    const wrongMapping = resolveMapping(parsed.headers, [
      { field: 'externalSku', columnIndex: 0 },
      // observedPrice sin asignar
    ], PRICE_LIST_FIELDS);
    const wrong = buildPriceListPreview(parsed, wrongMapping, RESOURCES, { id: 'p', name: 'P' }, 'test.csv');
    expect(wrong.preview.errors.length).toBeGreaterThan(0);
    expect(wrong.preview.importable).toBe(false);

    // Mapeo corregido
    const correctMapping = resolveMapping(parsed.headers, [
      { field: 'externalSku', columnIndex: 0 },
      { field: 'observedPrice', columnIndex: 1 },
    ], PRICE_LIST_FIELDS);
    const correct = buildPriceListPreview(parsed, correctMapping, RESOURCES, { id: 'p', name: 'P' }, 'test.csv');
    expect(correct.preview.errors).toHaveLength(0);
    expect(correct.preview.matchedCount).toBe(1);
    expect(correct.preview.importable).toBe(true);
  });
});

// ─── Test 20: Catálogo conserva contrato original ────────────────────────────

describe('PL-20 — contrato catálogo intacto: exige code, name, resourceType, unit', () => {
  for (const required of CATALOG_REQUIRED_FIELDS) {
    it(`falta "${required}" en catálogo ⇒ error bloqueante`, () => {
      const presentFields = (CATALOG_REQUIRED_FIELDS as readonly string[]).filter(
        (f) => f !== required,
      );
      const csvLines = [presentFields.join(','), presentFields.map(() => 'x').join(',')];
      const parsed = parseCsv(csvLines);
      const mapping = resolveMapping(parsed.headers, null);
      const { preview } = buildCatalogImportPreview(
        parsed, mapping, new Set(), new Set(), 'f.csv',
      );
      expect(preview.importable).toBe(false);
      expect(preview.errors.some((e) => e.includes(required))).toBe(true);
    });
  }

  it('isCatalogMappingComplete detecta correctamente cuando faltan campos', () => {
    const incompleteMapping: ColumnAssignment[] = [
      { field: 'code', columnIndex: 0 },
      { field: 'name', columnIndex: 1 },
      // Faltan resourceType y unit
    ];
    expect(isCatalogMappingComplete(incompleteMapping)).toBe(false);
  });

  it('isCatalogMappingComplete es true cuando todos los obligatorios están', () => {
    const completeMapping: ColumnAssignment[] = [
      { field: 'code', columnIndex: 0 },
      { field: 'name', columnIndex: 1 },
      { field: 'resourceType', columnIndex: 2 },
      { field: 'unit', columnIndex: 3 },
    ];
    expect(isCatalogMappingComplete(completeMapping)).toBe(true);
  });
});

// ─── Test 21: Importación de catálogo continúa funcionando ───────────────────

describe('PL-21 — importación de catálogo continúa funcionando', () => {
  it('CSV con encabezados estándar genera preview importable', () => {
    const csvLines = [
      'code,name,resourceType,unit',
      'MAT-001,Cemento,material,saco',
      'MO-001,Oficial,mano de obra,dia',
    ];
    const parsed = parseCsv(csvLines);
    const mapping = resolveMapping(parsed.headers, null);
    const { preview } = buildCatalogImportPreview(
      parsed, mapping, new Set(), new Set(), 'f.csv',
    );
    expect(preview.importable).toBe(true);
    expect(preview.newCount).toBe(2);
    expect(preview.errors).toHaveLength(0);
  });

  it('catálogo NO acepta precio de lista de proveedor como equivalente a observedPrice del catálogo', () => {
    // El importador de catálogo acepta observedPrice pero como campo OPCIONAL
    // (para crear observación de precio opcional junto al recurso).
    const csvLines = [
      'code,name,resourceType,unit,observedPrice',
      'MAT-002,Arena,material,m3,80000',
    ];
    const parsed = parseCsv(csvLines);
    const mapping = resolveMapping(parsed.headers, null);
    const { preview, importableRows } = buildCatalogImportPreview(
      parsed, mapping, new Set(), new Set(), 'f.csv',
    );
    // El catálogo crea el recurso normalmente
    expect(preview.importable).toBe(true);
    expect(preview.newCount).toBe(1);
    // Y la observación queda como pending
    expect(preview.pendingObservationCount).toBe(1);
    expect(importableRows[0]!.observation?.observedPrice).toBe('80000');
  });
});
