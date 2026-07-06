/**
 * manual-excel-formula-first.test.ts — F8B P5: export formula-first editable
 * offline. Cantidad/SON/diámetro/longitud son celdas editables; kg/ml y
 * longitud comercial vienen por VLOOKUP desde CONFIG_VARILLAS; ml/kg por
 * unidad, totales, varillas comerciales y desperdicio son FÓRMULAS que
 * recalculan al cambiar un dígito. Estilo ICONIC y sanitización intactos
 * (cubiertos también por manual-excel-iconic / manual-excel-export).
 */
import { describe, expect, it } from 'vitest';
import type ExcelJS from 'exceljs';
import {
  STEEL_MANUAL_EXCEL_SHEETS,
  buildSteelManualExcelWorkbook,
} from '@/lib/steel/manual-excel-export';
import { computeManualLines, type ManualLineRecord, type ManualTakeoffRecord } from '@/lib/steel/manual-takeoff';

function takeoff(overrides: Partial<ManualTakeoffRecord> = {}): ManualTakeoffRecord {
  return {
    id: 'mtk-ff',
    name: 'Takeoff Formula First',
    projectName: 'Proyecto',
    scopeLabel: 'Vigas de cimentación',
    status: 'draft',
    createdAt: '2026-07-06',
    lines: [],
    ...overrides,
  };
}

const RECORDS: ManualLineRecord[] = [
  { id: 'l1', originalDescription: '2x153E#3184', assumedWastePct: '5' },
  { id: 'l2', originalDescription: '5#5600', assumedWastePct: '5' },
];

function formulaOf(cell: ExcelJS.Cell): string {
  const value = cell.value as { formula?: string } | null;
  return value && typeof value === 'object' && 'formula' in value ? String(value.formula) : '';
}

describe('F8B P5 — Excel formula-first', () => {
  const lines = computeManualLines(RECORDS);
  const wb = buildSteelManualExcelWorkbook({
    takeoff: takeoff({ lines: RECORDS }),
    lines,
    generatedAt: new Date('2026-07-06T12:00:00.000Z'),
  });
  const cantidades = wb.getWorksheet('01_CANTIDADES')!;

  it('cantidad, SON, diámetro y longitud de corte son celdas editables (valores planos)', () => {
    expect(typeof cantidades.getCell('F2').value).toBe('number'); // diametro 3
    expect(cantidades.getCell('F2').value).toBe(3);
    expect(typeof cantidades.getCell('G2').value).toBe('number'); // longitud 1.84
    expect(cantidades.getCell('G2').value).toBeCloseTo(1.84, 6);
    expect(typeof cantidades.getCell('H2').value).toBe('number'); // cantidad 153
    expect(cantidades.getCell('H2').value).toBe(153);
    expect(typeof cantidades.getCell('I2').value).toBe('number'); // SON/repeticiones 2
    expect(cantidades.getCell('I2').value).toBe(2);
  });

  it('kg/ml viene por búsqueda en CONFIG_VARILLAS (cambiar el diámetro recalcula)', () => {
    expect(formulaOf(cantidades.getCell('J2'))).toContain('VLOOKUP(F2,CONFIG_VARILLAS!$A$2:$C$20,2,0)');
  });

  it('cambiar CANT en el workbook recalcula: ml total referencia la celda editable', () => {
    // M (ml total) = G*H*I ⇒ depende de longitud, cantidad y SON editables.
    expect(cantidades.getCell('M2').value).toMatchObject({ formula: 'G2*H2*I2' });
    // Cadena completa: N (kg total) = M*J ⇒ un dígito cambiado recalcula kg.
    expect(cantidades.getCell('N2').value).toMatchObject({ formula: 'M2*J2' });
  });

  it('ML total y W total son fórmulas, no valores fijos (líneas y resumen)', () => {
    expect(formulaOf(cantidades.getCell('M2')).length).toBeGreaterThan(0);
    expect(formulaOf(cantidades.getCell('N2')).length).toBeGreaterThan(0);
    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(resumen.getCell('B9').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!M2:M3)" });
    expect(resumen.getCell('B10').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!N2:N3)" });
    expect(resumen.getCell('B11').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!P2:P3)" });
  });

  it('ml/kg por unidad, varillas comerciales y desperdicio son fórmulas', () => {
    expect(cantidades.getCell('K2').value).toMatchObject({ formula: 'G2' });
    expect(cantidades.getCell('L2').value).toMatchObject({ formula: 'G2*J2' });
    expect(formulaOf(cantidades.getCell('P2'))).toBe('IF(O2>0,CEILING(M2/O2,1),0)');
    expect(formulaOf(cantidades.getCell('Q2'))).toBe('IF(O2>0,P2*O2-M2,0)');
  });

  it('CONFIG_VARILLAS existe con diámetro, kg/ml y longitud comercial activa editable', () => {
    expect(STEEL_MANUAL_EXCEL_SHEETS).toContain('CONFIG_VARILLAS');
    const config = wb.getWorksheet('CONFIG_VARILLAS')!;
    expect(config.getRow(1).values).toMatchObject([, 'diametro #', 'peso kg/ml', 'longitud comercial activa m', 'nota']);
    // #3 ⇒ 0.560 kg/ml (spec F1); longitud activa = mayor configurada (12).
    const rowFor3 = config.getRow(3);
    expect(rowFor3.getCell(1).value).toBe(3);
    expect(rowFor3.getCell(2).value).toBeCloseTo(0.56, 3);
    expect(rowFor3.getCell(3).value).toBe(12);
  });

  it('la longitud comercial configurada del takeoff aparece en CONFIG_VARILLAS', () => {
    const custom = buildSteelManualExcelWorkbook({
      takeoff: takeoff({ lines: RECORDS, commercialLengthsM: ['6', '7.5'] }),
      lines,
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    }).getWorksheet('CONFIG_VARILLAS')!;
    expect(custom.getRow(2).getCell(3).value).toBe(7.5);
    expect(String(custom.getRow(2).getCell(4).value)).toContain('6 / 7.5');
  });

  it('las fórmulas generadas no rompen la sanitización del texto de usuario', () => {
    const hostile: ManualLineRecord[] = [
      { id: 'h1', originalDescription: '=2+2', assumedWastePct: '5' },
      { id: 'h2', originalDescription: '2x153E#3184', assumedWastePct: '5' },
    ];
    const hostileWb = buildSteelManualExcelWorkbook({
      takeoff: takeoff({ lines: hostile }),
      lines: computeManualLines(hostile),
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    });
    const sheet = hostileWb.getWorksheet('01_CANTIDADES')!;
    expect(sheet.getCell('C2').value).toBe("'=2+2"); // texto hostil neutralizado
    expect(sheet.getCell('M3').value).toMatchObject({ formula: 'G3*H3*I3' }); // fórmula propia intacta
  });

  it('mantiene el estilo ICONIC (header navy + acento cyan) en la hoja nueva', () => {
    const config = wb.getWorksheet('CONFIG_VARILLAS')!;
    const header = config.getRow(1).getCell(1);
    expect((header.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBe('FF020148');
    expect(header.border?.bottom?.color?.argb).toBe('FF00B8FF');
  });
});
