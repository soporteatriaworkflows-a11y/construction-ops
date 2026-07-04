import { describe, expect, it } from 'vitest';
import {
  STEEL_MANUAL_EXCEL_SHEETS,
  buildSteelManualExcelWorkbook,
  sanitizeExcelCellText,
} from '@/lib/steel/manual-excel-export';
import {
  buildManualCutPlan,
  buildManualOrderDraft,
  computeManualLines,
  type ManualLineRecord,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';

function line(overrides: Partial<ManualLineRecord> & Pick<ManualLineRecord, 'id' | 'originalDescription'>): ManualLineRecord {
  return { assumedWastePct: '5', ...overrides };
}

function takeoff(lines: readonly ManualLineRecord[] = []): ManualTakeoffRecord {
  return {
    id: 'mtk-excel',
    name: 'Takeoff Excel',
    projectName: 'Proyecto Alfa',
    scopeLabel: 'Torre A',
    status: 'draft',
    createdAt: '2026-07-03',
    lines,
  };
}

function workbookText(wb: ReturnType<typeof buildSteelManualExcelWorkbook>): string {
  const values: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value != null) values.push(JSON.stringify(cell.value).toLowerCase());
      });
    });
  });
  return values.join(' | ');
}

describe('manual-excel-export (F4A)', () => {
  it('sanitizeExcelCellText neutraliza formula injection en strings', () => {
    expect(sanitizeExcelCellText('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeExcelCellText('+57')).toBe("'+57");
    expect(sanitizeExcelCellText('-10')).toBe("'-10");
    expect(sanitizeExcelCellText('@cmd')).toBe("'@cmd");
    expect(sanitizeExcelCellText('5#5600')).toBe('5#5600');
  });

  it('crea las siete hojas requeridas con nombres estables', () => {
    const records = [line({ id: 'e1', originalDescription: '5#5600' })];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(wb.worksheets.map((ws) => ws.name)).toEqual(STEEL_MANUAL_EXCEL_SHEETS);
  });

  it('mantiene numeros como numeros e incluye formulas seguras para ml/kg/subtotales', () => {
    const records = [
      line({ id: 'e1', originalDescription: '5#5600' }),
      line({ id: 'e2', originalDescription: '74E#3200' }),
    ];
    const lines = computeManualLines(records);
    const planResult = buildManualCutPlan(lines);
    const order = buildManualOrderDraft('Takeoff Excel', planResult.plan);
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines,
      planResult,
      order,
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    const cantidades = wb.getWorksheet('01_CANTIDADES');
    expect(cantidades).toBeDefined();
    expect(typeof cantidades!.getCell('F2').value).toBe('number');
    expect(cantidades!.getCell('K2').value).toMatchObject({ formula: 'F2*G2*H2' });
    expect(cantidades!.getCell('L2').value).toMatchObject({ formula: 'J2*G2*H2' });

    const resumen = wb.getWorksheet('00_RESUMEN');
    expect(resumen!.getCell('B9').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!K2:K3)" });

    const pedido = wb.getWorksheet('05_PEDIDO_PROVEEDOR');
    expect(pedido!.getCell('H2').value).toMatchObject({ formula: 'F2*G2' });
  });

  it('sanitiza valores de celdas del workbook sin convertir numeros', () => {
    const records = [
      line({ id: 'e1', originalDescription: '=2+2' }),
      line({ id: 'e2', originalDescription: '5#5600' }),
    ];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });
    const cantidades = wb.getWorksheet('01_CANTIDADES')!;

    expect(cantidades.getCell('C2').value).toBe("'=2+2");
    expect(typeof cantidades.getCell('F3').value).toBe('number');
  });

  it('no incluye tokens de DB/Supabase/RLS/produccion/deploy ni secretos', () => {
    const records = [line({ id: 'e1', originalDescription: '5#5600' })];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });
    const haystack = workbookText(wb);

    for (const forbidden of ['supabase', 'rls', 'service_role', 'anon_key', '.env', 'database_url', 'production', 'deploy']) {
      expect(haystack).not.toContain(forbidden);
    }
  });
});
