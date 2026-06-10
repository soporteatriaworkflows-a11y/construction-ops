/**
 * price-list-validation.test.ts — Validación del contrato de lista de precios
 * (PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1).
 *
 * Pruebas 1–15 del spec de hotfix:
 *  1.  Price-list import no exige name.
 *  2.  Price-list import no exige resourceType.
 *  3.  Price-list exige observedPrice.
 *  4.  Price-list exige al menos SKU, referencia o code.
 *  5.  SKU exacto hace match.
 *  6.  Referencia exacta hace match.
 *  7.  Code exacto hace match.
 *  8.  Sin match queda sin asociar.
 *  9.  Múltiples matches quedan ambiguos.
 * 10.  No crea recurso desde lista de proveedor.
 * 11.  Observación creada = pending.
 * 12.  Nunca approved.
 * 13.  No modifica BOQ.
 * 14.  No modifica AIU.
 * 15.  No modifica exports.
 *
 * Lógica pura (sin DB): usa buildPriceListPreview directamente.
 */
import { describe, it, expect } from 'vitest';
import { buildPriceListPreview } from '@/server/catalog/import/price-list';
import { resolveMapping } from '@/server/catalog/import/mapping';
import { parseCatalogFile } from '@/server/catalog/import/parse-file';
import { PRICE_LIST_FIELDS } from '@/lib/catalog-import/types';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROVIDER = { id: 'prov-decorceramica', name: 'Decorcerámica' };

/** Recurso de referencia para las pruebas de matching. */
const RESOURCES: ResourceIdentifier[] = [
  {
    id: 'r-sku-6751',
    code: 'MAT-PORC-DC-001',
    name: 'Dolce Vita Sei 20x20 Negro',
    unit: 'm2',
    externalSku: '6751',
    externalReference: 'KP04NG1620',
  },
  {
    id: 'r-code-only',
    code: 'MAT-CERAMICA-002',
    name: 'Cerámica genérica',
    unit: 'm2',
    externalSku: null,
    externalReference: null,
  },
];

function makeFile(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

function buildPreview(
  csvLines: string[],
  resources: ResourceIdentifier[] = RESOURCES,
  fileName = 'test.csv',
) {
  const buf = makeFile(csvLines);
  const parsed = parseCatalogFile(buf, fileName);
  const mapping = resolveMapping(parsed.headers, null, PRICE_LIST_FIELDS);
  return buildPriceListPreview(parsed, mapping, resources, PROVIDER, fileName);
}

// ─── Tests 1–4: Contrato de campos obligatorios ──────────────────────────────

describe('PL-1 — no requiere "name"', () => {
  it('un archivo sin columna "name" procesa correctamente', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    // No debe haber error sobre "name"
    expect(preview.errors.every((e) => !e.toLowerCase().includes('name'))).toBe(true);
    expect(preview.errors.every((e) => !e.toLowerCase().includes('nombre'))).toBe(true);
  });

  it('la ausencia de "name" no hace la importación no importable por sí sola', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    // Puede ser importable (tiene observedPrice + identificador)
    expect(preview.importable).toBe(true);
    expect(preview.matchedCount).toBe(1);
  });
});

describe('PL-2 — no requiere "resourceType"', () => {
  it('un archivo sin columna "resourceType" procesa correctamente', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    expect(preview.errors.every((e) => !e.toLowerCase().includes('resourcetype'))).toBe(true);
    expect(preview.errors.every((e) => !e.toLowerCase().includes('tipo de recurso'))).toBe(true);
    expect(preview.errors.every((e) => !e.toLowerCase().includes('tipo recurso'))).toBe(true);
  });
});

describe('PL-3 — exige observedPrice', () => {
  it('sin columna de precio ⇒ error bloqueante en preview', () => {
    const { preview } = buildPreview([
      'externalSku,description',
      '6751,Dolce Vita',
    ]);
    expect(preview.errors.some((e) => e.toLowerCase().includes('observedprice') || e.toLowerCase().includes('precio'))).toBe(true);
    expect(preview.importable).toBe(false);
  });

  it('precio presente ⇒ sin error de campo observedPrice', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    expect(preview.errors.every((e) => !e.includes('observedPrice'))).toBe(true);
  });
});

describe('PL-4 — exige al menos un identificador (SKU, referencia o código)', () => {
  it('sin ningún identificador ⇒ error bloqueante', () => {
    const { preview } = buildPreview([
      'observedPrice,description',
      '169000,Piso cerámica',
    ]);
    expect(preview.errors.some((e) =>
      e.toLowerCase().includes('identificad') ||
      e.toLowerCase().includes('sku') ||
      e.toLowerCase().includes('referencia') ||
      e.toLowerCase().includes('código')
    )).toBe(true);
    expect(preview.importable).toBe(false);
  });

  it('externalSku solo ⇒ identificador válido', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    expect(preview.errors).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });

  it('externalReference solo ⇒ identificador válido', () => {
    const { preview } = buildPreview([
      'externalReference,observedPrice',
      'KP04NG1620,169000',
    ]);
    expect(preview.errors).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });

  it('code solo ⇒ identificador válido', () => {
    const { preview } = buildPreview([
      'code,observedPrice',
      'MAT-CERAMICA-002,55000',
    ]);
    expect(preview.errors).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });
});

// ─── Tests 5–9: Matching ──────────────────────────────────────────────────────

describe('PL-5 — SKU exacto hace match', () => {
  it('fila con externalSku = "6751" coincide con el recurso correcto', () => {
    const { preview } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    expect(preview.matchedCount).toBe(1);
    const row = preview.rows[0]!;
    expect(row.matchType).toBe('sku');
    expect(row.resourceCode).toBe('MAT-PORC-DC-001');
    expect(row.status).toBe('matched');
  });
});

describe('PL-6 — referencia exacta hace match', () => {
  it('fila con externalReference = "KP04NG1620" coincide con el recurso correcto', () => {
    const { preview } = buildPreview([
      'externalReference,observedPrice',
      'KP04NG1620,169000',
    ]);
    expect(preview.matchedCount).toBe(1);
    const row = preview.rows[0]!;
    expect(row.matchType).toBe('reference');
    expect(row.resourceCode).toBe('MAT-PORC-DC-001');
    expect(row.status).toBe('matched');
  });
});

describe('PL-7 — code exacto hace match', () => {
  it('fila con code = "MAT-CERAMICA-002" coincide por código', () => {
    const { preview } = buildPreview([
      'code,observedPrice',
      'MAT-CERAMICA-002,55000',
    ]);
    expect(preview.matchedCount).toBe(1);
    const row = preview.rows[0]!;
    expect(row.matchType).toBe('code');
    expect(row.resourceCode).toBe('MAT-CERAMICA-002');
  });
});

describe('PL-8 — sin match queda "Sin asociar"', () => {
  it('SKU desconocido queda sin asociar; no se genera observación ni recurso', () => {
    const { preview, matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '9999,85000',
    ]);
    expect(preview.unmatchedCount).toBe(1);
    expect(preview.matchedCount).toBe(0);
    expect(preview.importable).toBe(false);
    // matchedRows está vacío: no hay nada que insertar
    expect(matchedRows).toHaveLength(0);
    const row = preview.rows[0]!;
    expect(row.matchType).toBe('none');
    expect(row.status).toBe('unmatched');
    expect(row.messages.some((m) => m.toLowerCase().includes('sin asociar'))).toBe(true);
  });

  it('fila con match + fila sin match: solo la asociada genera matchedRow', () => {
    const { preview, matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
      '9999,85000',
    ]);
    expect(preview.matchedCount).toBe(1);
    expect(preview.unmatchedCount).toBe(1);
    expect(matchedRows).toHaveLength(1);
    expect(matchedRows[0]!.resourceCode).toBe('MAT-PORC-DC-001');
  });
});

describe('PL-9 — múltiples matches quedan ambiguos', () => {
  it('dos recursos con el mismo SKU ⇒ estado ambiguous, sin asociar', () => {
    const resourcesWithDup: ResourceIdentifier[] = [
      ...RESOURCES,
      {
        id: 'r-sku-dup',
        code: 'MAT-PORC-DC-DUP',
        name: 'Duplicado SKU',
        unit: 'm2',
        externalSku: '6751', // mismo SKU que MAT-PORC-DC-001
        externalReference: null,
      },
    ];
    const { preview, matchedRows } = buildPreview(
      ['externalSku,observedPrice', '6751,169000'],
      resourcesWithDup,
    );
    expect(preview.rows[0]!.matchType).toBe('ambiguous');
    expect(preview.unmatchedCount).toBe(1);
    expect(matchedRows).toHaveLength(0); // nunca se resuelve en silencio
    expect(preview.rows[0]!.messages.some((m) => m.toLowerCase().includes('ambigua'))).toBe(true);
  });
});

// ─── Tests 10–15: Invariantes de negocio ─────────────────────────────────────

describe('PL-10 — no crea recursos desde lista de proveedor', () => {
  it('buildPriceListPreview no produce ningún NormalizedCatalogRow', () => {
    // La función NO retorna importableRows (que son solo para catálogo).
    // Solo retorna matchedRows con los recursos EXISTENTES.
    const { preview, matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
      '9999,85000', // sin match — debe quedar sin asociar, no crear recurso
    ]);
    // matchedRows solo referencia recursos que ya existen (r-sku-6751)
    for (const mr of matchedRows) {
      expect(RESOURCES.some((r) => r.id === mr.resourceId)).toBe(true);
    }
    // La fila sin match no genera ninguna entrada en matchedRows
    expect(matchedRows.every((mr) => mr.resourceCode !== '9999')).toBe(true);
    expect(preview.unmatchedCount).toBe(1);
  });

  it('el resultado tiene matchedRows solo para recursos existentes (nunca nuevos)', () => {
    // Todos los identificadores del archivo que NO existen en resources queden sin asociar
    const { matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',   // existe → matchedRow
      'NUEVO-SKU,5000', // no existe → NO matchedRow
    ]);
    expect(matchedRows).toHaveLength(1);
    expect(matchedRows[0]!.resourceId).toBe('r-sku-6751');
  });
});

describe('PL-11 — observaciones generadas son pending (dominio)', () => {
  it('matchedRows contienen todos los campos para crear observaciones pending', () => {
    const { matchedRows } = buildPreview([
      'externalSku,observedPrice,discountPercent',
      '6751,169000,8',
    ]);
    expect(matchedRows).toHaveLength(1);
    const mr = matchedRows[0]!;
    expect(mr.observedPrice).toBe('169000');
    expect(mr.discountPercent).toBe('8');
    expect(mr.resourceId).toBe('r-sku-6751');
    // El dominio puro no asigna status (lo hace el repositorio DB con 'pending')
    // pero verifica que no incluye campos de aprobación
    expect('approvedBy' in mr).toBe(false);
    expect('approvedAt' in mr).toBe(false);
  });
});

describe('PL-12 — nunca approved', () => {
  it('los matchedRows no contienen campos de aprobación', () => {
    const { matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    for (const mr of matchedRows) {
      // Garantiza que el dominio puro no genera aprobaciones
      expect(Object.keys(mr)).not.toContain('approvedBy');
      expect(Object.keys(mr)).not.toContain('approvedAt');
      expect(Object.keys(mr)).not.toContain('status'); // status lo asigna el repo
    }
  });
});

describe('PL-13/14/15 — no toca BOQ, AIU ni exports', () => {
  it('buildPriceListPreview no retorna ningún campo de BOQ ni AIU', () => {
    const { preview, matchedRows, allReports } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    // Ningún campo de BOQ presente
    const boqFields = ['boqItemId', 'estimateVersionId', 'chapterId', 'aiu', 'aiuPercent'];
    const allFields = [
      ...Object.keys(preview),
      ...matchedRows.flatMap(Object.keys),
      ...allReports.flatMap(Object.keys),
    ];
    for (const f of boqFields) {
      expect(allFields).not.toContain(f);
    }
  });

  it('preview solo indica tablas de catálogo/pricing (no BOQ)', () => {
    // El dominio puro no tiene referencia a BOQ: verificamos que los matchedRows
    // solo referencian resourceId y datos de precio/proveedor.
    const { matchedRows } = buildPreview([
      'externalSku,observedPrice',
      '6751,169000',
    ]);
    expect(matchedRows[0]).toMatchObject({
      row: expect.any(Number),
      resourceId: expect.any(String),
      resourceCode: expect.any(String),
      resourceUnit: expect.any(String),
      observedPrice: expect.any(String),
      discountPercent: expect.any(String),
      currency: expect.any(String),
    });
  });
});

// ─── Fixture del spec (Decorcerámica real) ────────────────────────────────────

describe('Fixture del spec — archivo de prueba Decorcerámica', () => {
  const FIXTURE_CSV = [
    'externalSku,externalReference,code,description,unit,observedPrice,discountPercent,currency,sourceUrl,observedAt,validUntil,notes',
    '6751,KP04NG1620,MAT-PORC-DC-001,Dolce Vita Sei 20x20 Negro,m2,169000,0,COP,https://www.decorceramica.com/dolce-vita-sei-20x20-negro/p,2026-06-10,,Precio público web',
    '9999,SIN-MATCH-001,,Producto sin asociación para probar reporte,m2,85000,10,COP,,2026-06-10,,Debe quedar como sin asociar',
  ];

  it('fila SKU 6751 hace match correcto y produce matchedRow', () => {
    const { preview, matchedRows } = buildPreview(FIXTURE_CSV);
    const matched = preview.rows.find((r) => r.identifier === '6751');
    expect(matched).toBeDefined();
    expect(matched!.matchType).toBe('sku');
    expect(matched!.resourceCode).toBe('MAT-PORC-DC-001');
    expect(matchedRows.find((mr) => mr.resourceId === 'r-sku-6751')).toBeDefined();
  });

  it('fila SKU 9999 queda sin asociar y no genera recurso', () => {
    const { preview, matchedRows } = buildPreview(FIXTURE_CSV);
    const unmatched = preview.rows.find((r) => r.identifier === '9999');
    expect(unmatched).toBeDefined();
    expect(unmatched!.matchType).toBe('none');
    expect(unmatched!.status).toBe('unmatched');
    // No genera matchedRow
    expect(matchedRows.find((mr) => mr.resourceCode === '9999')).toBeUndefined();
  });

  it('resumen correcto: 1 asociada, 1 sin asociar, 0 inválidas', () => {
    const { preview } = buildPreview(FIXTURE_CSV);
    expect(preview.matchedCount).toBe(1);
    expect(preview.unmatchedCount).toBe(1);
    expect(preview.invalidCount).toBe(0);
    expect(preview.totalRows).toBe(2);
  });

  it('archivo no exige name ni resourceType ⇒ sin errores de esos campos', () => {
    const { preview } = buildPreview(FIXTURE_CSV);
    const forbiddenErrors = preview.errors.filter(
      (e) =>
        e.toLowerCase().includes('name') ||
        e.toLowerCase().includes('nombre') ||
        e.toLowerCase().includes('resourcetype') ||
        e.toLowerCase().includes('tipo de recurso'),
    );
    expect(forbiddenErrors).toHaveLength(0);
  });
});
