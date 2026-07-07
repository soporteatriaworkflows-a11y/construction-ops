/**
 * manual-excel-formula-first.test.ts — F8B/F8C: export formula-first editable
 * offline, alineado al contrato VC-VERF (CANTIDADES BELLA SUIZA, hoja
 * VC-VERF-06072026): CANT./SON/código/longitudes editables; (W) VARILLA y
 * LONGITUD COMERCIAL por VLOOKUP de CONFIG_VARILLAS; ML×UND, (W)×UND,
 * CANT. ML TOTAL, (W) TOTAL, CANT. VARILLAS y columnas por longitud comercial
 * como FÓRMULAS: cambiar un dígito recalcula todo el workbook.
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
  {
    id: 'l1',
    originalDescription: '2x153E#3184',
    assumedWastePct: '5',
    evidence: {
      sourceFileName: 'vigas.dxf',
      pageNumber: 1,
      sourceType: 'dxf',
      readingMethod: 'dxf',
      elementKey: 'VC-EJE-3',
      locationText: 'EJE 3',
      beamDetailId: 'bd-VC-EJE-3',
      position: 'estribo',
    },
  },
  { id: 'l2', originalDescription: '5#5600', assumedWastePct: '5' },
];

function formulaOf(cell: ExcelJS.Cell): string {
  const value = cell.value as { formula?: string } | null;
  return value && typeof value === 'object' && 'formula' in value ? String(value.formula) : '';
}

describe('F8C — Excel formula-first contrato VC-VERF', () => {
  const lines = computeManualLines(RECORDS);
  const wb = buildSteelManualExcelWorkbook({
    takeoff: takeoff({ lines: RECORDS }),
    lines,
    generatedAt: new Date('2026-07-06T12:00:00.000Z'),
  });
  const cantidades = wb.getWorksheet('01_CANTIDADES')!;

  it('la cabecera sigue el contrato VC-VERF', () => {
    expect((cantidades.getRow(1).values as unknown[]).slice(1, 21)).toEqual([
      'ITEM',
      'ELEMENTO ESTRUCTURAL',
      'UBICACION EJE',
      'DESCRIPCION',
      'Ø VARILLA',
      'CODIGO VARILLA',
      '(W) VARILLA kg/ml',
      'LONGITUD COMERCIAL m',
      'LONGITUD CORTE m',
      'CANT.',
      'SON',
      'ML X UND.',
      '(W) X UND.',
      'CANT. ML TOTAL',
      '(W) TOTAL',
      'CANT. VARILLAS',
      'VARILLAS 6 M',
      'VARILLAS 9 M',
      'VARILLAS 12 M',
      'DESPERDICIO ML',
    ]);
  });

  it('ELEMENTO ESTRUCTURAL y UBICACION EJE vienen de la evidencia del beam detail', () => {
    expect(cantidades.getCell('B2').value).toBe('VC-EJE-3');
    expect(cantidades.getCell('C2').value).toBe('EJE 3');
    // Sin evidencia de viga, cae al alcance del takeoff (jamás celda rota).
    expect(cantidades.getCell('B3').value).toBe('Vigas de cimentación');
  });

  it('CANT., SON, código y longitud de corte son celdas editables (valores planos)', () => {
    expect(cantidades.getCell('F2').value).toBe(3); // código varilla
    expect(cantidades.getCell('I2').value).toBeCloseTo(1.84, 6); // longitud corte
    expect(cantidades.getCell('J2').value).toBe(153); // CANT.
    expect(cantidades.getCell('K2').value).toBe(2); // SON
  });

  it('(W) VARILLA y LONGITUD COMERCIAL vienen por búsqueda en CONFIG_VARILLAS', () => {
    expect(formulaOf(cantidades.getCell('G2'))).toContain('VLOOKUP(F2,CONFIG_VARILLAS!$A$2:$C$20,2,0)');
    expect(formulaOf(cantidades.getCell('H2'))).toContain('VLOOKUP(F2,CONFIG_VARILLAS!$A$2:$C$20,3,0)');
  });

  it('ML X UND., (W) X UND., ML TOTAL, (W) TOTAL y CANT. VARILLAS son fórmulas', () => {
    expect(cantidades.getCell('L2').value).toMatchObject({ formula: 'I2' });
    expect(cantidades.getCell('M2').value).toMatchObject({ formula: 'I2*G2' });
    expect(cantidades.getCell('N2').value).toMatchObject({ formula: 'I2*J2*K2' });
    expect(cantidades.getCell('O2').value).toMatchObject({ formula: 'N2*G2' });
    expect(formulaOf(cantidades.getCell('P2'))).toBe('IF(H2>0,CEILING(N2/H2,1),0)');
  });

  it('editar CANT/SON/LONGITUD CORTE recalcula: la cadena referencia las celdas editables', () => {
    // N (ml total) = I*J*K depende de longitud (I), CANT (J) y SON (K).
    expect(formulaOf(cantidades.getCell('N2'))).toBe('I2*J2*K2');
    // O (kg total) = N*G ⇒ un dígito cambiado recalcula el peso.
    expect(formulaOf(cantidades.getCell('O2'))).toBe('N2*G2');
  });

  it('las columnas por longitud comercial son fórmulas de distribución', () => {
    expect(formulaOf(cantidades.getCell('Q2'))).toBe('IF($H2=6,$P2,0)');
    expect(formulaOf(cantidades.getCell('R2'))).toBe('IF($H2=9,$P2,0)');
    expect(formulaOf(cantidades.getCell('S2'))).toBe('IF($H2=12,$P2,0)');
    expect(formulaOf(cantidades.getCell('T2'))).toBe('IF(H2>0,P2*H2-N2,0)');
  });

  it('el resumen suma con fórmulas (ML total, W total, varillas)', () => {
    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(resumen.getCell('B9').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!N2:N3)" });
    expect(resumen.getCell('B10').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!O2:O3)" });
    expect(resumen.getCell('B11').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!P2:P3)" });
  });

  it('CONFIG_VARILLAS existe con código, kg/ml y longitud comercial activa', () => {
    expect(STEEL_MANUAL_EXCEL_SHEETS).toContain('CONFIG_VARILLAS');
    const config = wb.getWorksheet('CONFIG_VARILLAS')!;
    const rowFor3 = config.getRow(3);
    expect(rowFor3.getCell(1).value).toBe(3);
    expect(rowFor3.getCell(2).value).toBeCloseTo(0.56, 3);
    expect(rowFor3.getCell(3).value).toBe(12);
  });

  it('longitudes configuradas del takeoff generan sus propias columnas', () => {
    const custom = buildSteelManualExcelWorkbook({
      takeoff: takeoff({ lines: RECORDS, commercialLengthsM: ['6', '7.5'] }),
      lines,
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    }).getWorksheet('01_CANTIDADES')!;
    expect(custom.getCell('Q1').value).toBe('VARILLAS 6 M');
    expect(custom.getCell('R1').value).toBe('VARILLAS 7.5 M');
    expect(formulaOf(custom.getCell('R2'))).toBe('IF($H2=7.5,$P2,0)');
  });

  it('las fórmulas no rompen la sanitización del texto de usuario', () => {
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
    expect(sheet.getCell('D2').value).toBe("'=2+2");
    expect(sheet.getCell('N3').value).toMatchObject({ formula: 'I3*J3*K3' });
  });

  it('mantiene el estilo ICONIC (F8D: header suave con acento cyan) en cantidades y CONFIG_VARILLAS', () => {
    const header = cantidades.getRow(1).getCell(1);
    expect((header.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBe('FFE9F1FC');
    expect(header.font?.color?.argb).toBe('FF1B1F3E');
    expect(header.border?.bottom?.color?.argb).toBe('FF00B8FF');
    const config = wb.getWorksheet('CONFIG_VARILLAS')!.getRow(1).getCell(1);
    expect((config.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBe('FFE9F1FC');
  });
});
