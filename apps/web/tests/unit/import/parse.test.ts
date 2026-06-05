/**
 * parse.test.ts — Parser del Excel de BOQ (formato Golden Master v1, 4C.1).
 *
 * Construye workbooks SINTÉTICOS sanitizados en memoria (sin el Excel privado
 * real) y valida: detección de hoja/encabezados, clasificación capítulo/ítem,
 * recálculo server-side de subtotales/total, advertencias, errores y digest.
 *
 * Propiedad: agent-excel-mapper.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoqWorkbook, digestNormalized, ExcelParseError } from '@/server/estimates/import/parse';
import { EXPECTED_SHEET } from '@/lib/import/types';

function buildWorkbook(rows: unknown[][], sheetName = EXPECTED_SHEET): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const HEADERS = ['code', 'description', 'unit', 'quantity', 'unit_price', 'subtotal'];

describe('parseBoqWorkbook — caso válido', () => {
  const buf = buildWorkbook([
    HEADERS,
    ['CAP1', 'Preliminares', '', '', '', ''],
    ['1.01', 'Excavación', 'm3', 2, 3, 6],
    ['1.02', 'Relleno', 'm3', 4, 5, 20],
    ['', '', '', '', '', ''], // fila vacía → ignorada
    ['CAP2', 'Cimentación', '', '', '', ''],
    ['2.01', 'Zapata', 'un', 10, 100, 999], // subtotal informado erróneo → warning
  ]);
  const { preview, normalized } = parseBoqWorkbook(buf, 'demo.xlsx');

  it('detecta 2 capítulos y 3 ítems', () => {
    expect(preview.chapterCount).toBe(2);
    expect(preview.itemCount).toBe(3);
  });

  it('recalcula subtotales server-side (no usa la columna F)', () => {
    const it = preview.itemsSample.find((i) => i.code === '2.01')!;
    expect(it.subtotal).toBe('1000'); // 10×100, NO 999
  });

  it('directTotal = Σ subtotales recalculados (6+20+1000 = 1026)', () => {
    expect(Number(preview.directTotal)).toBe(1026);
  });

  it('advierte cuando el subtotal del Excel difiere del recalculado', () => {
    expect(preview.warnings.some((w) => w.code === 'subtotal_mismatch')).toBe(true);
  });

  it('ignora filas vacías (advertencia informativa)', () => {
    expect(preview.warnings.some((w) => w.code === 'empty_row_skipped')).toBe(true);
  });

  it('asocia cada ítem a su capítulo', () => {
    expect(normalized.items.filter((i) => i.chapterCode === 'CAP1')).toHaveLength(2);
    expect(normalized.items.filter((i) => i.chapterCode === 'CAP2')).toHaveLength(1);
  });

  it('digest es estable y reproducible para el mismo contenido', () => {
    const again = parseBoqWorkbook(buf, 'demo.xlsx');
    expect(again.preview.digest).toBe(preview.digest);
    expect(preview.digest).toBe(digestNormalized(normalized));
    expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseBoqWorkbook — errores bloqueantes', () => {
  it('hoja faltante ⇒ ExcelParseError con hojas detectadas', () => {
    const buf = buildWorkbook([HEADERS, ['CAP1', 'X', '', '', '', '']], 'OTRA HOJA');
    try {
      parseBoqWorkbook(buf, 'x.xlsx');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExcelParseError);
      expect((e as ExcelParseError).detectedSheets).toContain('OTRA HOJA');
    }
  });

  it('encabezados obligatorios ausentes ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([['foo', 'bar'], ['CAP1', 'X']]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(ExcelParseError);
  });

  it('ítem antes de un capítulo ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([HEADERS, ['1.01', 'Item suelto', 'm3', 1, 2, 2]]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(/sin un cap/i);
  });

  it('cantidad/precio no numérico ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([
      HEADERS,
      ['CAP1', 'C', '', '', '', ''],
      ['1.01', 'Item', 'm3', 'abc', 2, 0],
    ]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(/num[eé]rico/i);
  });

  it('valor negativo ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([
      HEADERS,
      ['CAP1', 'C', '', '', '', ''],
      ['1.01', 'Item', 'm3', -1, 2, -2],
    ]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(/negativo/i);
  });

  it('código de capítulo duplicado ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([
      HEADERS,
      ['CAP1', 'A', '', '', '', ''],
      ['1.01', 'i', 'm3', 1, 1, 1],
      ['CAP1', 'B', '', '', '', ''],
    ]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(/duplicado/i);
  });

  it('archivo sin capítulos ni ítems ⇒ ExcelParseError', () => {
    const buf = buildWorkbook([HEADERS]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(ExcelParseError);
  });

  it('archivo no .xlsx (buffer basura) ⇒ ExcelParseError', () => {
    expect(() => parseBoqWorkbook(Buffer.from('no soy un xlsx'), 'x.xlsx')).toThrow(
      ExcelParseError,
    );
  });
});

describe('parseBoqWorkbook — encabezados en español + acentos', () => {
  it('reconoce "Código/Descripción/Unidad/Cantidad/V/Unitario"', () => {
    const buf = buildWorkbook([
      ['Código', 'Descripción', 'Unidad', 'Cantidad', 'V/Unitario', 'V/Total'],
      ['CAP1', 'Capítulo', '', '', '', ''],
      ['1.01', 'Ítem', 'm2', 3, 4, 12],
    ]);
    const { preview } = parseBoqWorkbook(buf, 'es.xlsx');
    expect(preview.chapterCount).toBe(1);
    expect(preview.itemCount).toBe(1);
    expect(preview.directTotal).toBe('12');
  });
});
