/**
 * parse-file.test.ts — Archivos (CATALOG_BULK_ONBOARDING_V1, mandato T01–T08).
 * Sin red, sin DB. SheetJS genera los workbooks de prueba en memoria.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  assertCatalogImportFile,
  parseCatalogFile,
} from '@/server/catalog/import/parse-file';
import { CatalogImportFileError } from '@/server/catalog/import/errors';
import { CATALOG_IMPORT_LIMITS } from '@/lib/catalog-import/types';
import { sanitizeCsvCell, buildSanitizedCsv } from '@/lib/catalog-import/csv';

const HEADERS = ['code', 'name', 'resourceType', 'unit'];
const ROWS = [
  ['MAT-001', 'Cemento gris 50kg', 'material', 'saco'],
  ['MAT-002', 'Arena fina', 'material', 'm3'],
];

function workbookBuffer(bookType: XLSX.BookType): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
  return XLSX.write(wb, { type: 'buffer', bookType }) as Buffer;
}

function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

describe('parseCatalogFile — formatos aceptados', () => {
  it('T01 — acepta .xlsx y lee encabezados + filas', () => {
    const parsed = parseCatalogFile(workbookBuffer('xlsx'), 'catalogo.xlsx');
    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]![0]).toBe('MAT-001');
    expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('T02 — acepta .xls (BIFF8)', () => {
    const parsed = parseCatalogFile(workbookBuffer('xls'), 'catalogo.xls');
    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows).toHaveLength(2);
  });

  it('T03 — acepta .csv', () => {
    const parsed = parseCatalogFile(
      csvBuffer(['code,name,resourceType,unit', 'MAT-001,Cemento,material,saco']),
      'catalogo.csv',
    );
    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows[0]![1]).toBe('Cemento');
  });

  it('T04 — rechaza extensión inválida (.pdf, .docx, .exe)', () => {
    for (const name of ['lista.pdf', 'lista.docx', 'lista.exe', 'lista']) {
      expect(() => parseCatalogFile(csvBuffer(['a,b']), name)).toThrow(CatalogImportFileError);
    }
    const fakePdf = new File([new Uint8Array(10)], 'lista.pdf');
    expect(() => assertCatalogImportFile(fakePdf)).toThrow(CatalogImportFileError);
  });

  it('T05 — rechaza archivo mayor a 10MB', () => {
    const big = new File([new Uint8Array(CATALOG_IMPORT_LIMITS.maxFileBytes + 1)], 'big.csv');
    expect(() => assertCatalogImportFile(big)).toThrow(/10 MB/);
  });

  it('T06 — rechaza más de 5.000 filas de datos', () => {
    const lines = ['code,name,resourceType,unit'];
    for (let i = 0; i < CATALOG_IMPORT_LIMITS.maxRows + 1; i++) {
      lines.push(`C${i},Recurso ${i},material,und`);
    }
    expect(() => parseCatalogFile(csvBuffer(lines), 'muchas.csv')).toThrow(/5000 filas/);
  });

  it('T06b — acepta exactamente 5.000 filas de datos', () => {
    const lines = ['code,name,resourceType,unit'];
    for (let i = 0; i < CATALOG_IMPORT_LIMITS.maxRows; i++) {
      lines.push(`C${i},Recurso ${i},material,und`);
    }
    const parsed = parseCatalogFile(csvBuffer(lines), 'exacto.csv');
    expect(parsed.rows).toHaveLength(CATALOG_IMPORT_LIMITS.maxRows);
  });

  it('T07 — no ejecuta fórmulas: celdas =… quedan como texto literal', () => {
    const parsed = parseCatalogFile(
      csvBuffer(['code,name,resourceType,unit', '=SUM(1;2),=2+2,material,und']),
      'formulas.csv',
    );
    // SheetJS con cellFormula:false nunca evalúa; el valor llega crudo.
    expect(parsed.rows[0]![0]).toContain('SUM');
    expect(parsed.rows[0]![1]).toBe('=2+2');
  });

  it('T07b — xlsx con fórmula: se lee el valor cacheado, nunca se evalúa', () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ['MAT-9', 'Con formula', 'material', 'und']]);
    // Celda con fórmula y SIN valor cacheado: no debe aparecer resultado calculado.
    ws['E2'] = { t: 'n', f: 'SUM(1,2)' } as XLSX.CellObject;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const parsed = parseCatalogFile(buf, 'f.xlsx');
    expect(parsed.rows[0]![4] ?? '').not.toBe('3');
  });

  it('omite filas vacías y las cuenta', () => {
    const parsed = parseCatalogFile(
      csvBuffer(['code,name,resourceType,unit', 'A,Uno,material,und', ',,,', 'B,Dos,material,und']),
      'vacias.csv',
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.omittedEmptyRows).toBe(1);
  });

  it('digest cambia si cambia el contenido (integridad preview↔confirmación)', () => {
    const a = parseCatalogFile(csvBuffer(['code,name,resourceType,unit', 'A,Uno,material,und']), 'a.csv');
    const b = parseCatalogFile(csvBuffer(['code,name,resourceType,unit', 'A,Dos,material,und']), 'a.csv');
    expect(a.digest).not.toBe(b.digest);
  });
});

describe('CSV exportado — sanitización contra formula injection (T08)', () => {
  it('T08 — neutraliza celdas que comienzan con =, +, -, @, TAB, CR', () => {
    expect(sanitizeCsvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(sanitizeCsvCell('+57')).toBe("'+57");
    expect(sanitizeCsvCell('-5')).toBe("'-5");
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCsvCell('\t=x')).toBe("'\t=x");
    expect(sanitizeCsvCell('normal')).toBe('normal');
  });

  it('T08b — escapa comillas y separadores (RFC 4180) y construye CSV completo', () => {
    const csv = buildSanitizedCsv(
      ['Fila', 'Mensaje'],
      [
        [1, 'texto, con coma'],
        [2, '=HYPERLINK("http://evil")'],
      ],
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Fila,Mensaje');
    expect(lines[1]).toBe('1,"texto, con coma"');
    expect(lines[2]).toContain("'=HYPERLINK");
  });
});
