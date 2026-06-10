/**
 * mapping-preview.test.ts — Mapeo (T09–T14) y preview (T15–T20)
 * (CATALOG_BULK_ONBOARDING_V1). Lógica pura, sin red ni DB.
 */
import { describe, it, expect } from 'vitest';
import {
  suggestMapping,
  resolveMapping,
  normalizeResourceType,
  isKnownUnit,
  parsePositiveDecimal,
} from '@/server/catalog/import/mapping';
import { buildCatalogImportPreview } from '@/server/catalog/import/preview';
import { parseCatalogFile } from '@/server/catalog/import/parse-file';
import { CATALOG_REQUIRED_FIELDS } from '@/lib/catalog-import/types';

function parsedCsv(lines: string[], name = 'test.csv') {
  return parseCatalogFile(Buffer.from(lines.join('\n'), 'utf8'), name);
}

const NO_PROVIDERS = new Set<string>();
const NO_EXISTING = new Set<string>();

describe('Mapeo de columnas (T09–T14)', () => {
  it('T09 — mapea columnas manualmente (resolveMapping respeta la intención)', () => {
    const headers = ['X', 'Y', 'Z', 'W'];
    const mapping = resolveMapping(headers, [
      { field: 'code', columnIndex: 3 },
      { field: 'name', columnIndex: 0 },
      { field: 'resourceType', columnIndex: 1 },
      { field: 'unit', columnIndex: 2 },
    ]);
    const byField = Object.fromEntries(mapping.map((a) => [a.field, a.columnIndex]));
    expect(byField.code).toBe(3);
    expect(byField.name).toBe(0);
    expect(byField.resourceType).toBe(1);
    expect(byField.unit).toBe(2);
  });

  it('T09b — una columna no puede asignarse a dos campos; índices inválidos se anulan', () => {
    const headers = ['A', 'B'];
    const mapping = resolveMapping(headers, [
      { field: 'code', columnIndex: 0 },
      { field: 'name', columnIndex: 0 }, // misma columna ⇒ anulada
      { field: 'unit', columnIndex: 99 }, // fuera de rango ⇒ anulada
    ]);
    const byField = Object.fromEntries(mapping.map((a) => [a.field, a.columnIndex]));
    expect(byField.code).toBe(0);
    expect(byField.name).toBeNull();
    expect(byField.unit).toBeNull();
  });

  it('T10–T13 — exige code, name, resourceType y unit (error bloqueante si faltan)', () => {
    for (const missing of CATALOG_REQUIRED_FIELDS) {
      const headers = CATALOG_REQUIRED_FIELDS.filter((f) => f !== missing);
      const parsed = parsedCsv([headers.join(','), headers.map(() => 'x').join(',')]);
      const mapping = resolveMapping(parsed.headers, null);
      const { preview } = buildCatalogImportPreview(parsed, mapping, NO_EXISTING, NO_PROVIDERS, 'f.csv');
      expect(preview.importable).toBe(false);
      expect(preview.errors.some((e) => e.includes(missing))).toBe(true);
    }
  });

  it('T14 — acepta columnas opcionales con sinónimos es/en', () => {
    const headers = [
      'codigo', 'nombre', 'tipo', 'unidad', 'descripcion', 'categoria', 'marca',
      'referencia', 'sku', 'desperdicio', 'proveedor', 'url', 'precio', 'descuento',
      'moneda', 'vigencia', 'notas',
    ];
    const mapping = suggestMapping(headers);
    const assigned = new Set(
      mapping.filter((a) => a.columnIndex !== null).map((a) => a.field),
    );
    for (const f of [
      'code', 'name', 'resourceType', 'unit', 'description', 'category', 'brand',
      'externalReference', 'externalSku', 'defaultWastePct', 'providerName',
      'sourceUrl', 'observedPrice', 'discountPercent', 'currency', 'validUntil', 'notes',
    ]) {
      expect(assigned.has(f)).toBe(true);
    }
  });

  it('normaliza resourceType con sinónimos y rechaza valores desconocidos', () => {
    expect(normalizeResourceType('Mano de Obra')).toBe('labor');
    expect(normalizeResourceType('MATERIALES')).toBe('material');
    expect(normalizeResourceType('equipo')).toBe('equipment');
    expect(normalizeResourceType('subcontrato')).toBe('subcontract');
    expect(normalizeResourceType('cosa rara')).toBeNull();
  });

  it('reconoce unidades comunes y normaliza m²/m³', () => {
    expect(isKnownUnit('m²')).toBe(true);
    expect(isKnownUnit('M3')).toBe(true);
    expect(isKnownUnit('Und')).toBe(true);
    expect(isKnownUnit('zorks')).toBe(false);
  });

  it('parsea precios con separadores locales', () => {
    expect(parsePositiveDecimal('$ 169.000')).toBe('169000');
    expect(parsePositiveDecimal('29.900,50')).toBe('29900.5');
    expect(parsePositiveDecimal('29,900.50')).toBe('29900.5');
    expect(parsePositiveDecimal('-5')).toBeNull();
    expect(parsePositiveDecimal('abc')).toBeNull();
  });
});

describe('Preview (T15–T20)', () => {
  const CSV = [
    'code,name,resourceType,unit,precio',
    'NEW-1,Recurso nuevo,material,und,1000',     // nueva + precio pending
    'EXIST-1,Ya existe,material,und,',           // existente ⇒ skip
    'NEW-1,Duplicado interno,material,und,',     // duplicado en archivo
    ',Sin codigo,material,und,',                 // inválida (código vacío)
    'NEW-2,Sin tipo,,und,',                      // inválida (tipo vacío)
    'NEW-3,Precio malo,material,und,abc',        // nueva, precio inválido
  ];

  function build() {
    const parsed = parsedCsv(CSV);
    const mapping = resolveMapping(parsed.headers, null);
    return buildCatalogImportPreview(
      parsed,
      mapping,
      new Set(['EXIST-1']),
      NO_PROVIDERS,
      'preview.csv',
    );
  }

  it('T15 — cuenta nuevas', () => {
    expect(build().preview.newCount).toBe(2); // NEW-1 y NEW-3
  });

  it('T16 — cuenta existentes (skip, sin sobrescribir)', () => {
    const { preview } = build();
    expect(preview.existingCount).toBe(1);
    const row = preview.rows.find((r) => r.code === 'EXIST-1');
    expect(row?.status).toBe('skip_existing');
  });

  it('T17 — detecta duplicados dentro del archivo', () => {
    const { preview } = build();
    expect(preview.duplicateCount).toBe(1);
    const dup = preview.rows.filter((r) => r.code === 'NEW-1');
    expect(dup.some((r) => r.status === 'duplicate_in_file')).toBe(true);
  });

  it('T18 — detecta filas inválidas (código vacío, tipo inválido)', () => {
    const { preview } = build();
    expect(preview.invalidCount).toBe(2);
  });

  it('T19 — reporta skip con mensaje claro', () => {
    const { preview } = build();
    const row = preview.rows.find((r) => r.status === 'skip_existing');
    expect(row?.messages.join(' ')).toMatch(/ya existe/i);
  });

  it('T20 — reporta observaciones de precio pendientes y precios rechazados', () => {
    const { preview, importableRows } = build();
    expect(preview.pendingObservationCount).toBe(1);
    expect(preview.priceInvalidCount).toBe(1);
    const withObs = importableRows.find((r) => r.code === 'NEW-1');
    expect(withObs?.observation?.observedPrice).toBe('1000');
    const badPrice = importableRows.find((r) => r.code === 'NEW-3');
    expect(badPrice?.observation).toBeNull(); // recurso importable, precio rechazado
  });

  it('precio importable nunca llega aprobado: el preview solo declara pending', () => {
    const { preview } = build();
    const row = preview.rows.find((r) => r.code === 'NEW-1');
    expect(row?.priceStatus).toBe('pending_observation');
  });
});
