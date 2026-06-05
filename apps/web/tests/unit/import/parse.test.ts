/**
 * parse.test.ts — Parser del Excel de BOQ (plantilla real de cotización, 4C.2).
 *
 * Construye workbooks SINTÉTICOS sanitizados que reproducen la FORMA de la
 * plantilla real (7 columnas con CAP auxiliar, SUBTOTAL CAPITULO, filas vacías,
 * TOTAL COSTOS DIRECTOS, AIU, control de pagos) SIN copiar datos privados.
 *
 * Valida: clasificación capítulo/ítem, ignorado de subtotal/total/AIU, fila REAL
 * de Excel reportada (alineada pese a filas vacías), diagnóstico AGREGADO (recorre
 * toda la hoja), duplicados (capítulo bloqueante / ítem advertencia), recálculo
 * server-side, digest. Propiedad: agent-excel-mapper.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoqWorkbook, digestNormalized, ExcelParseError } from '@/server/estimates/import/parse';
import { EXPECTED_SHEET } from '@/lib/import/types';

// Encabezados de la plantilla real: A=CAP (auxiliar), B=ÍTEM (code), C=DESCRIPCIÓN,
// D=UN, E=CANT., F=VR. UNITARIO, G=VR. PARCIAL.
const HEADERS = ['CAP', 'ÍTEM', 'DESCRIPCIÓN', 'UN', 'CANT.', 'VR. UNITARIO', 'VR. PARCIAL'];

function build(rows: unknown[][], sheetName = EXPECTED_SHEET): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseBoqWorkbook — plantilla real (forma sintética)', () => {
  // Filas (1-based Excel): 1=headers, 2=cap1, 3=item, 4=item, 5=SUBTOTAL, 6=blank,
  // 7=cap2, 8=item, 9=SUBTOTAL, 10=TOTAL COSTOS DIRECTOS, 11=ADMIN, 12=IVA, 13=control.
  const buf = build([
    HEADERS,
    ['1', '1', 'PRELIMINARES', '', '', '', ''],
    ['', '1.01', 'Excavación', 'm3', 2, 3, 6],
    ['', '1.02', 'Relleno', 'm3', 4, 5, 20],
    ['', '', 'SUBTOTAL CAPITULO', '', '', '', 26],
    ['', '', '', '', '', '', ''],
    ['2', '2', 'CIMENTACIÓN', '', '', '', ''],
    ['', '2.01', 'Zapata', 'un', 10, 100, 1000],
    ['', '', 'SUBTOTAL CAPITULO', '', '', '', 1000],
    ['', '', 'TOTAL COSTOS DIRECTOS', '', '', '', 1026],
    ['', '', 'ADMINISTRACION', '', '', '', 36],
    ['', '', 'IVA SOBRE UTILIDAD', '', '', '', 7],
    ['', '', 'CONTROL DE PAGOS', '', '', '', ''],
  ]);
  const { preview, normalized } = parseBoqWorkbook(buf, 'real.xlsx');

  it('clasifica 2 capítulos y 3 ítems (SUBTOTAL no es capítulo)', () => {
    expect(preview.chapterCount).toBe(2);
    expect(preview.itemCount).toBe(3);
    expect(preview.errors).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });

  it('NO genera el error "capítulo sin código" por la fila SUBTOTAL CAPITULO', () => {
    expect(preview.errors.some((e) => e.kind === 'chapter_no_code')).toBe(false);
  });

  it('TOTAL COSTOS DIRECTOS cierra el BOQ: AIU/control de pagos NO se importan', () => {
    expect(preview.itemsSample.some((i) => /ADMINISTRACION|IVA|CONTROL/i.test(i.description))).toBe(false);
    expect(preview.warnings.some((w) => w.kind === 'aiu_ignored')).toBe(false); // están tras el TOTAL ⇒ ni se leen
  });

  it('directTotal recalculado = 6+20+1000 = 1026 (no usa VR. PARCIAL)', () => {
    expect(Number(preview.directTotal)).toBe(1026);
  });

  it('usa ÍTEM como code y la columna CAP es opcional (no bloquea ítems)', () => {
    expect(normalized.items.map((i) => i.code)).toEqual(['1.01', '1.02', '2.01']);
    expect(normalized.chapters.map((c) => c.code)).toEqual(['1', '2']);
  });

  it('reporta filas vacías ignoradas (advertencia)', () => {
    expect(preview.warnings.some((w) => w.kind === 'empty_rows_skipped')).toBe(true);
  });

  it('digest estable y reproducible', () => {
    const again = parseBoqWorkbook(buf, 'real.xlsx');
    expect(again.preview.digest).toBe(preview.digest);
    expect(preview.digest).toBe(digestNormalized(normalized));
  });
});

describe('parseBoqWorkbook — fila REAL de Excel (alineación con filas vacías)', () => {
  it('reporta el número de fila real pese a filas vacías por encima', () => {
    // Filas: 1=headers, 2=blank, 3=blank, 4=cap, 5=item sin unidad/cantidad/precio
    // pero con código y descripción → no es item (looksItem false) → capítulo válido…
    // Forzamos un ítem inválido en una fila conocida (fila 6) con CANT no numérica.
    const buf = build([
      HEADERS,
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['1', '1', 'CAP', '', '', '', ''],
      ['', '1.01', 'Item malo', 'm3', 'abc', 3, 0], // fila 5
    ]);
    const { preview } = parseBoqWorkbook(buf, 'r.xlsx');
    const err = preview.errors.find((e) => e.kind === 'item_non_numeric');
    expect(err).toBeDefined();
    expect(err!.row).toBe(5); // fila REAL de Excel, no índice compactado
  });
});

describe('parseBoqWorkbook — diagnóstico AGREGADO (no se detiene en el primero)', () => {
  it('reporta múltiples problemas en una sola pasada', () => {
    const buf = build([
      HEADERS,
      ['1', '1', 'CAP A', '', '', '', ''],
      ['', '1.01', 'ok', 'm3', 1, 2, 2],
      ['', '1.02', 'sin unidad', '', 5, 6, 30], // item_missing_field (unit vacío) — looksItem por qty/price
      ['2', '1', 'CAP duplicado', '', '', '', ''], // duplicate_chapter (code '1')
    ]);
    const { preview } = parseBoqWorkbook(buf, 'multi.xlsx');
    const kinds = preview.errors.map((e) => e.kind);
    expect(kinds).toContain('item_missing_field');
    expect(kinds).toContain('duplicate_chapter');
    expect(preview.errors.length).toBeGreaterThanOrEqual(2);
    expect(preview.importable).toBe(false);
  });
});

describe('parseBoqWorkbook — duplicados (estrategia sin normalización silenciosa)', () => {
  it('capítulo duplicado ⇒ ERROR bloqueante (constraint único por versión)', () => {
    const buf = build([
      HEADERS,
      ['1', '1', 'A', '', '', '', ''],
      ['', '1.01', 'i', 'm3', 1, 1, 1],
      ['2', '1', 'B', '', '', '', ''],
    ]);
    const { preview } = parseBoqWorkbook(buf, 'd.xlsx');
    expect(preview.errors.some((e) => e.kind === 'duplicate_chapter' && e.code === '1')).toBe(true);
    expect(preview.importable).toBe(false);
  });

  it('ítem duplicado ⇒ ADVERTENCIA (la BD no lo restringe), importable', () => {
    const buf = build([
      HEADERS,
      ['1', '1', 'A', '', '', '', ''],
      ['', '1.01', 'i', 'm3', 1, 1, 1],
      ['', '1.01', 'i dup', 'm3', 2, 2, 4],
    ]);
    const { preview } = parseBoqWorkbook(buf, 'di.xlsx');
    expect(preview.warnings.some((w) => w.kind === 'duplicate_item' && w.code === '1.01')).toBe(true);
    expect(preview.errors).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });
});

describe('parseBoqWorkbook — subtotal informado', () => {
  it('advierte si VR. PARCIAL del ítem difiere del recalculado (usa el recalculado)', () => {
    const buf = build([
      HEADERS,
      ['1', '1', 'A', '', '', '', ''],
      ['', '1.01', 'i', 'm3', 10, 100, 999], // recalculado 1000 ≠ 999
    ]);
    const { preview } = parseBoqWorkbook(buf, 's.xlsx');
    expect(preview.warnings.some((w) => w.kind === 'subtotal_mismatch')).toBe(true);
    expect(preview.itemsSample[0]!.subtotal).toBe('1000');
  });
});

describe('parseBoqWorkbook — fatales (sin filas)', () => {
  it('hoja faltante ⇒ ExcelParseError con hojas detectadas', () => {
    const buf = build([HEADERS], 'OTRA');
    try {
      parseBoqWorkbook(buf, 'x.xlsx');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExcelParseError);
      expect((e as ExcelParseError).detectedSheets).toContain('OTRA');
    }
  });

  it('encabezados obligatorios ausentes ⇒ ExcelParseError', () => {
    const buf = build([['x', 'y'], ['1', '2']]);
    expect(() => parseBoqWorkbook(buf, 'x.xlsx')).toThrow(ExcelParseError);
  });

  it('buffer no .xlsx ⇒ ExcelParseError', () => {
    expect(() => parseBoqWorkbook(Buffer.from('basura'), 'x.xlsx')).toThrow(ExcelParseError);
  });

  it('sin capítulos/ítems reconocibles ⇒ error agregado no_data (no throw)', () => {
    const buf = build([HEADERS, ['', '', 'TOTAL COSTOS DIRECTOS', '', '', '', 0]]);
    const { preview } = parseBoqWorkbook(buf, 'x.xlsx');
    expect(preview.errors.some((e) => e.kind === 'no_data')).toBe(true);
    expect(preview.importable).toBe(false);
  });
});
