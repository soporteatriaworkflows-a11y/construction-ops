/**
 * manual-excel-iconic.test.ts — Identidad visual ICONIC del export (F7.1 F).
 *
 * Regla dura: los estilos NO rompen nombres de hojas, fórmulas ni la
 * sanitización de formula injection (eso lo cubre manual-excel-export.test.ts,
 * que sigue pasando sin cambios de fondo).
 */
import { describe, expect, it } from 'vitest';
import type ExcelJS from 'exceljs';
import {
  STEEL_MANUAL_EXCEL_SHEETS,
  buildSteelManualExcelWorkbook,
} from '@/lib/steel/manual-excel-export';
import { computeManualLines, type ManualLineRecord, type ManualTakeoffRecord } from '@/lib/steel/manual-takeoff';

const ICONIC_NAVY = 'FF020148';
const ICONIC_BLUE = 'FF005DD6';
const ICONIC_CYAN = 'FF00B8FF';

function takeoff(overrides: Partial<ManualTakeoffRecord> = {}): ManualTakeoffRecord {
  return {
    id: 'mtk-iconic',
    name: 'Takeoff ICONIC',
    projectName: 'Proyecto',
    scopeLabel: 'Torre A',
    status: 'draft',
    createdAt: '2026-07-05',
    lines: [],
    ...overrides,
  };
}

function records(): ManualLineRecord[] {
  return [
    {
      id: 'e1',
      originalDescription: '5#5600',
      assumedWastePct: '5',
      evidence: { sourceFileName: 'plano.pdf', pageNumber: 2, readingMethod: 'native_text', confidence: '0.92' },
    },
    {
      id: 'e2',
      originalDescription: '74E#3200',
      assumedWastePct: '5',
      evidence: { sourceFileName: 'plano.pdf', pageNumber: 3, readingMethod: 'ocr', confidence: '0.45' },
    },
  ];
}

function fillColor(cell: ExcelJS.Cell): string | undefined {
  return (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
}

describe('Excel ICONIC (F7.1 F)', () => {
  const lines = computeManualLines(records());
  const wb = buildSteelManualExcelWorkbook({
    takeoff: takeoff({ lines: records() }),
    lines,
    generatedAt: new Date('2026-07-05T12:00:00.000Z'),
  });

  it('mantiene las hojas existentes con nombres estables', () => {
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(STEEL_MANUAL_EXCEL_SHEETS);
  });

  it('headers con fondo navy ICONIC, texto blanco y acento cyan', () => {
    const evidencias = wb.getWorksheet('EVIDENCIAS')!;
    const header = evidencias.getRow(1).getCell(1);
    expect(fillColor(header)).toBe(ICONIC_NAVY);
    expect(header.font?.color?.argb).toBe('FFFFFFFF');
    expect(header.font?.bold).toBe(true);
    expect(header.border?.bottom?.color?.argb).toBe(ICONIC_CYAN);
  });

  it('freeze de fila de encabezado y filtros presentes en hojas de datos', () => {
    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    expect(cantidades.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(cantidades.autoFilter).toBeTruthy();
    // Anchos de columnas configurados.
    expect(cantidades.getColumn(1).width).toBeGreaterThan(0);
  });

  it('el resumen abre con banner ICONIC navy y franja cyan', () => {
    const resumen = wb.getWorksheet('00_RESUMEN')!;
    const banner = resumen.getCell('A1');
    expect(String(banner.value)).toContain('ICONIC');
    expect(fillColor(banner)).toBe(ICONIC_NAVY);
    expect(banner.font?.color?.argb).toBe('FFFFFFFF');
    expect(fillColor(resumen.getCell('A2'))).toBe(ICONIC_CYAN);
    // Las celdas fijas del resumen NO se movieron (fórmulas/totales intactos).
    expect(resumen.getCell('A10').value).toBe('Total kg');
    expect(resumen.getCell('A18').value).toBe('Nota');
  });

  it('pestañas con color de marca', () => {
    expect(wb.getWorksheet('00_RESUMEN')!.properties.tabColor?.argb).toBe(ICONIC_NAVY);
    expect(wb.getWorksheet('01_CANTIDADES')!.properties.tabColor?.argb).toBe(ICONIC_BLUE);
  });

  it('formato numérico en cantidades/kg y acentos suaves por confianza', () => {
    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    expect(cantidades.getColumn(9).numFmt).toBe('#,##0.00'); // I longitud corte
    expect(cantidades.getColumn(13).numFmt).toBe('#,##0.000'); // M (W) x und

    const evidencias = wb.getWorksheet('EVIDENCIAS')!;
    // Confianza 0.92 ⇒ verde suave; 0.45 ⇒ rojo suave (columna H).
    expect(fillColor(evidencias.getCell('H2'))).toBe('FFE2F5E9');
    expect(fillColor(evidencias.getCell('H3'))).toBe('FFFBE2E2');
  });

  it('las formulas de cantidades siguen intactas con los estilos aplicados', () => {
    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    expect(cantidades.getCell('N2').value).toMatchObject({ formula: 'I2*J2*K2' });
    expect(cantidades.getCell('O2').value).toMatchObject({ formula: 'N2*G2' });
    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(resumen.getCell('B9').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!N2:N3)" });
  });

  it('06_CONFIGURACION refleja las longitudes comerciales del takeoff', () => {
    const configured = buildSteelManualExcelWorkbook({
      takeoff: takeoff({ lines: records(), commercialLengthsM: ['6', '7.5'] }),
      lines,
      generatedAt: new Date('2026-07-05T12:00:00.000Z'),
    }).getWorksheet('06_CONFIGURACION')!;
    expect(configured.getCell('B2').value).toBe('6 / 7.5');
    expect(String(configured.getCell('C2').value)).toContain('configuradas en este takeoff');

    const defaults = wb.getWorksheet('06_CONFIGURACION')!;
    expect(defaults.getCell('B2').value).toBe('6 / 9 / 12');
    expect(String(defaults.getCell('C2').value)).toContain('default del preview');
  });
});
