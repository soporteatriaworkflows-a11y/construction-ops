/**
 * parse.test.ts — Parser + normalización reversible de códigos (4C.3).
 *
 * Workbooks SINTÉTICOS sanitizados (sin datos privados). Cubre: clasificación,
 * filas reservadas, fila real, diagnóstico agregado, y la NORMALIZACIÓN:
 * propuesta determinista de capítulos duplicados (algoritmo genérico),
 * propagación de prefijos de ítems, inconsistencias históricas, trazabilidad
 * (sourceCode/sourceRow), códigos ambiguos bloqueados, overrides de la usuaria, y
 * digest del payload ORIGINAL. Propiedad: agent-excel-mapper.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoqWorkbook, digestNormalized, ExcelParseError } from '@/server/estimates/import/parse';
import { EXPECTED_SHEET } from '@/lib/import/types';

const HEADERS = ['CAP', 'ÍTEM', 'DESCRIPCIÓN', 'UN', 'CANT.', 'VR. UNITARIO', 'VR. PARCIAL'];
function build(rows: unknown[][], sheetName = EXPECTED_SHEET): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const chapter = (code: string, name: string) => ['', code, name, '', '', '', ''];
const item = (code: string, desc: string, q: number, p: number) => ['', code, desc, 'm2', q, p, q * p];

describe('parseBoqWorkbook — base válida con trazabilidad', () => {
  const buf = build([HEADERS, chapter('1', 'PRELIMINARES'), item('1.01', 'Excavación', 2, 3), item('1.02', 'Relleno', 4, 5)]);
  const { preview, normalized } = parseBoqWorkbook(buf, 'ok.xlsx');

  it('1 capítulo / 2 ítems, sin propuestas (mappings vacío), importable', () => {
    expect(preview.chapterCount).toBe(1);
    expect(preview.itemCount).toBe(2);
    expect(preview.mappings).toHaveLength(0);
    expect(preview.importable).toBe(true);
  });
  it('conserva sourceCode y sourceRow en el payload', () => {
    expect(normalized.chapters[0]).toMatchObject({ code: '1', sourceCode: '1', sourceRow: 2 });
    expect(normalized.items[0]).toMatchObject({ code: '1.01', sourceCode: '1.01', sourceRow: 3 });
    expect(normalized.items[1]!.sourceRow).toBe(4);
  });
  it('digest del preview es del payload ORIGINAL (≠ digest del final)', () => {
    expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
    // El digest normalizado (final) incluye más campos ⇒ distinto del original.
    expect(preview.digest).not.toBe(digestNormalized(normalized));
  });
});

describe('parseBoqWorkbook — capítulos duplicados (algoritmo determinista genérico)', () => {
  // 10 capítulos (1..10) cada uno con 1 ítem, luego 4 duplicados 7,8,9,10.
  const rows: unknown[][] = [HEADERS];
  for (let i = 1; i <= 10; i++) { rows.push(chapter(String(i), `CAP ${i}`)); rows.push(item(`${i}.01`, `it ${i}`, 1, i)); }
  for (const d of [7, 8, 9, 10]) { rows.push(chapter(String(d), `CAP ${d} dup`)); rows.push(item(`${d}.01`, `it ${d} dup`, 1, 1)); }
  const { preview } = parseBoqWorkbook(build(rows), 'dups.xlsx');

  it('propone 7→11, 8→12, 9→13, 10→14 (siguiente entero por encima del máximo)', () => {
    const chMaps = preview.mappings.filter((m) => m.rowType === 'chapter');
    const pairs = chMaps.map((m) => `${m.sourceCode}->${m.canonicalCode}`);
    expect(pairs).toEqual(['7->11', '8->12', '9->13', '10->14']);
  });
  it('propaga prefijos de ítems de los capítulos renumerados (7.01→11.01, …)', () => {
    const itMaps = preview.mappings.filter((m) => m.rowType === 'item').map((m) => `${m.sourceCode}->${m.canonicalCode}`);
    expect(itMaps).toEqual(['7.01->11.01', '8.01->12.01', '9.01->13.01', '10.01->14.01']);
  });
  it('14 capítulos canónicos ÚNICOS, importable', () => {
    expect(preview.chapterCount).toBe(14);
    const codes = preview.chapters.map((c) => c.code);
    expect(new Set(codes).size).toBe(14);
    expect(preview.importable).toBe(true);
  });
});

describe('parseBoqWorkbook — algoritmo genérico (otro workbook)', () => {
  it('max=3, duplicado 2 ⇒ 2→4 (no hardcodeado al archivo real)', () => {
    const rows = [HEADERS, chapter('1', 'A'), item('1.01', 'x', 1, 1), chapter('2', 'B'), item('2.01', 'y', 1, 1), chapter('3', 'C'), item('3.01', 'z', 1, 1), chapter('2', 'B dup'), item('2.01', 'y2', 1, 1)];
    const { preview } = parseBoqWorkbook(build(rows), 'g.xlsx');
    const chMap = preview.mappings.find((m) => m.rowType === 'chapter')!;
    expect(`${chMap.sourceCode}->${chMap.canonicalCode}`).toBe('2->4');
  });
});

describe('parseBoqWorkbook — inconsistencia histórica de prefijo', () => {
  it('ítems 2.02–2.03 bajo el capítulo 3 ⇒ proponer 3.02–3.03', () => {
    const rows = [HEADERS, chapter('3', 'CAP 3'), item('2.02', 'mal prefijo', 1, 1), item('2.03', 'mal prefijo', 1, 1)];
    const { preview } = parseBoqWorkbook(build(rows), 'h.xlsx');
    const itMaps = preview.mappings.filter((m) => m.rowType === 'item').map((m) => `${m.sourceCode}->${m.canonicalCode}`);
    expect(itMaps).toEqual(['2.02->3.02', '2.03->3.03']);
  });
});

describe('parseBoqWorkbook — código ambiguo bloqueado + override de la usuaria', () => {
  // Capítulo 7 duplicado ⇒ canónico 11; su ítem "ABC" no tiene patrón seguro.
  const rows = [
    HEADERS,
    chapter('7', 'CAP 7'), item('7.01', 'ok', 1, 1),
    chapter('7', 'CAP 7 dup'), item('ABC', 'sin patron', 1, 1),
  ];
  const buf = build(rows);

  it('ítem ambiguo bajo capítulo renumerado ⇒ requiresManualReview ⇒ NO importable', () => {
    const { preview } = parseBoqWorkbook(buf, 'amb.xlsx');
    const manual = preview.mappings.find((m) => m.rowType === 'item' && m.requiresManualReview);
    expect(manual).toBeDefined();
    expect(preview.importable).toBe(false);
  });

  it('con override válido del ítem ⇒ se resuelve ⇒ importable', () => {
    // El capítulo 7 dup está en la fila 4; su ítem ABC en la fila 5.
    const { preview, normalized } = parseBoqWorkbook(buf, 'amb.xlsx', [
      { rowType: 'item', sourceRow: 5, canonicalCode: '8.01' },
    ]);
    expect(preview.importable).toBe(true);
    const it = normalized.items.find((i) => i.sourceRow === 5)!;
    expect(it.code).toBe('8.01');
    expect(it.sourceCode).toBe('ABC'); // trazabilidad conservada
  });
});

describe('parseBoqWorkbook — digest original estable ante overrides', () => {
  it('el digest (integridad de archivo) NO cambia al aplicar overrides', () => {
    const buf = build([HEADERS, chapter('7', 'A'), item('7.01', 'x', 1, 1), chapter('7', 'B'), item('7.02', 'y', 1, 1)]);
    const a = parseBoqWorkbook(buf, 'x.xlsx');
    const b = parseBoqWorkbook(buf, 'x.xlsx', [{ rowType: 'chapter', sourceRow: 4, canonicalCode: '99' }]);
    expect(a.preview.digest).toBe(b.preview.digest);
    // pero el payload final sí difiere (código canónico distinto).
    expect(b.normalized.chapters.find((c) => c.sourceRow === 4)!.code).toBe('99');
  });
});

describe('parseBoqWorkbook — fatales / agregado', () => {
  it('hoja faltante ⇒ ExcelParseError con hojas detectadas', () => {
    try { parseBoqWorkbook(build([HEADERS], 'OTRA'), 'x.xlsx'); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(ExcelParseError); expect((e as ExcelParseError).detectedSheets).toContain('OTRA'); }
  });
  it('SUBTOTAL/TOTAL/AIU: no son capítulos; TOTAL cierra el BOQ', () => {
    const buf = build([
      HEADERS,
      chapter('1', 'A'), item('1.01', 'x', 10, 100),
      ['', '', 'SUBTOTAL CAPITULO', '', '', '', 1000],
      ['', '', 'TOTAL COSTOS DIRECTOS', '', '', '', 1000],
      ['', '', 'ADMINISTRACION', '', '', '', 35],
    ]);
    const { preview } = parseBoqWorkbook(buf, 'r.xlsx');
    expect(preview.chapterCount).toBe(1);
    expect(preview.itemCount).toBe(1);
    expect(preview.errors).toHaveLength(0);
  });
  it('cantidad no numérica ⇒ error agregado con fila real', () => {
    const buf = build([HEADERS, ['', '', '', '', '', '', ''], chapter('1', 'A'), item('1.01', 'x', 1, 1), ['', '1.02', 'mal', 'm2', 'abc', 2, 0]]);
    const { preview } = parseBoqWorkbook(buf, 'n.xlsx');
    const err = preview.errors.find((e) => e.kind === 'item_non_numeric');
    expect(err?.row).toBe(5);
    expect(preview.importable).toBe(false);
  });
});
