import { describe, expect, it } from 'vitest';
import {
  STEEL_MANUAL_EXCEL_SHEETS,
  buildSteelManualExcelWorkbook,
  sanitizeExcelCellText,
  type ManualExcelLineEvidence,
} from '@/lib/steel/manual-excel-export';
import {
  buildManualCutPlan,
  buildManualOrderDraft,
  computeManualLines,
  type ManualLineRecord,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';

// El export F4A.2 acepta evidencia laxa (duck typing); desde F6E la línea
// manual también trae `evidence` tipada, así que se reemplaza (Omit) para
// poder probar los casos de sanitización con valores hostiles.
type ManualLineRecordWithEvidence = Omit<ManualLineRecord, 'evidence'> & {
  evidence?: ManualExcelLineEvidence;
};

function line(
  overrides: Partial<ManualLineRecordWithEvidence> & Pick<ManualLineRecord, 'id' | 'originalDescription'>,
): ManualLineRecord {
  return { assumedWastePct: '5', ...overrides } as unknown as ManualLineRecord;
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
    expect(sanitizeExcelCellText('=SUM(1,1)')).toBe("'=SUM(1,1)");
    expect(sanitizeExcelCellText('+1')).toBe("'+1");
    expect(sanitizeExcelCellText('-1')).toBe("'-1");
    expect(sanitizeExcelCellText('@cmd')).toBe("'@cmd");
    expect(sanitizeExcelCellText('\t=SUM(1,1)')).toBe("'\t=SUM(1,1)");
    expect(sanitizeExcelCellText('\r=SUM(1,1)')).toBe("'\r=SUM(1,1)");
    expect(sanitizeExcelCellText('\n=SUM(1,1)')).toBe("'\n=SUM(1,1)");
    expect(sanitizeExcelCellText('   =SUM(1,1)')).toBe("'   =SUM(1,1)");
    expect(sanitizeExcelCellText('\t+1')).toBe("'\t+1");
    expect(sanitizeExcelCellText('\r@cmd')).toBe("'\r@cmd");
    expect(sanitizeExcelCellText('texto normal')).toBe('texto normal');
    expect(sanitizeExcelCellText('texto, con "comillas"\ny salto')).toBe('texto, con "comillas"\ny salto');
  });

  it('crea las hojas requeridas con nombres estables', () => {
    const records = [line({ id: 'e1', originalDescription: '5#5600' })];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(wb.worksheets.map((ws) => ws.name)).toEqual(STEEL_MANUAL_EXCEL_SHEETS);
  });

  it('genera workbook valido con 0 lineas y totales sin rangos invalidos', () => {
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(),
      lines: [],
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(wb.worksheets.map((ws) => ws.name)).toEqual(STEEL_MANUAL_EXCEL_SHEETS);
    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(resumen.getCell('B9').value).toMatchObject({ formula: '0' });
    expect(resumen.getCell('B10').value).toMatchObject({ formula: '0' });
    expect(resumen.getCell('B11').value).toMatchObject({ formula: '0' });
    expect(wb.getWorksheet('01_CANTIDADES')!.rowCount).toBe(1);
  });

  it('incluye headers minimos de alertas, plan de corte, sobrantes y evidencias', () => {
    const records = [
      line({ id: 'e1', originalDescription: '5#5600' }),
      line({ id: 'e2', originalDescription: 'texto libre' }),
    ];
    const lines = computeManualLines(records);
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines,
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(wb.getWorksheet('02_ALERTAS')!.getRow(1).values).toMatchObject([
      ,
      'linea',
      'severidad',
      'codigo',
      'mensaje',
      'explicacion',
      'accion sugerida',
    ]);
    expect(wb.getWorksheet('03_PLAN_CORTE')!.getRow(1).values).toMatchObject([
      ,
      'grupo compatible',
      'material',
      'longitud comercial',
      'cortes asignados',
      'elementos destino',
      'sobrante',
      'estado sobrante',
    ]);
    expect(wb.getWorksheet('04_SOBRANTES')!.getRow(1).values).toMatchObject([
      ,
      'material',
      'longitud sobrante',
      'peso sobrante',
      'origen',
      'posible destino',
      'estado',
      'ahorro ml',
      'ahorro kg',
      'ahorro COP (referencia)',
    ]);
    expect(wb.getWorksheet('EVIDENCIAS')!.getRow(1).values).toMatchObject([
      ,
      'linea / item',
      'elemento',
      'descripcion original',
      'archivo fuente',
      'pagina',
      'tipo fuente',
      'metodo lectura',
      'confianza',
      'fragmento original',
      'observaciones',
      'estado revision',
      'modo cantidad',
    ]);
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
    // F8C VC-VERF: código (F) y longitud de corte (I) editables como números.
    expect(typeof cantidades!.getCell('F2').value).toBe('number');
    expect(typeof cantidades!.getCell('I2').value).toBe('number');
    expect(cantidades!.getCell('N2').value).toMatchObject({ formula: 'I2*J2*K2' });
    expect(cantidades!.getCell('O2').value).toMatchObject({ formula: 'N2*G2' });
    expect(cantidades!.getCell('W1').value).toBe('fuente');
    expect(cantidades!.getCell('AB1').value).toBe('observacion');

    const resumen = wb.getWorksheet('00_RESUMEN');
    expect(resumen!.getCell('B9').value).toMatchObject({ formula: "SUM('01_CANTIDADES'!N2:N3)" });

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

    expect(cantidades.getCell('D2').value).toBe("'=2+2");
    expect(typeof cantidades.getCell('F3').value).toBe('number');
  });

  it('exporta CONTROL_LECTURA y EVIDENCIAS sin romper lineas sin evidencia', () => {
    const records = [
      line({ id: 'e1', originalDescription: '5#5600' }),
      line({ id: 'e2', originalDescription: '74E#3200' }),
    ];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    const control = wb.getWorksheet('CONTROL_LECTURA')!;
    expect(control.getCell('B2').value).toBe('Takeoff Excel');
    expect(control.getCell('B6').value).toBe(2);
    expect(control.getCell('B7').value).toBe(0);
    expect(control.getCell('B8').value).toBe(2);
    expect(control.getCell('B9').value).toBe(0);

    const evidencias = wb.getWorksheet('EVIDENCIAS')!;
    expect(evidencias.rowCount).toBe(3);
    // F7.1: sin fuente se dice explícitamente, nunca celda vacía.
    // F8D: método y estado en español.
    expect(evidencias.getCell('D2').value).toBe('fuente no disponible');
    expect(evidencias.getCell('G2').value).toBe('desconocido');
    expect(evidencias.getCell('K2').value).toBe('Sin revisar');
  });

  it('exporta evidencia opcional en CONTROL_LECTURA, EVIDENCIAS y columnas finales de cantidades', () => {
    const records = [
      line({
        id: 'e1',
        originalDescription: '5#5600',
        evidence: {
          sourceFileName: 'plano-estructural.pdf',
          pageNumber: 4,
          sourceType: 'manual_selection',
          readingMethod: 'manual',
          confidence: '0.92',
          originalFragment: 'Zapata Z-1 5#5600',
          observation: 'Revisado contra detalle S-04',
          reviewStatus: 'approved',
        },
      }),
      line({
        id: 'e2',
        originalDescription: '74E#3200',
        evidence: {
          sourceFileName: 'plano-estructural.pdf',
          pageNumber: 5,
          sourceType: 'native_text',
          readingMethod: 'native_text',
          confidence: '0.45',
          originalFragment: 'Estribos 74E#3200',
          observation: 'Confirmar separacion',
          reviewStatus: 'needs_review',
        },
      }),
    ];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });

    const control = wb.getWorksheet('CONTROL_LECTURA')!;
    expect(control.getCell('B7').value).toBe(2);
    expect(control.getCell('B8').value).toBe(0);
    expect(control.getCell('B9').value).toBe(1);

    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    expect(cantidades.getCell('W2').value).toBe('plano-estructural.pdf');
    expect(cantidades.getCell('X2').value).toBe('4');
    expect(cantidades.getCell('Y2').value).toBe('manual_selection');
    expect(cantidades.getCell('Z2').value).toBe('manual');
    expect(cantidades.getCell('AA2').value).toBe('0.92');
    expect(cantidades.getCell('AB2').value).toBe('Revisado contra detalle S-04');

    const evidencias = wb.getWorksheet('EVIDENCIAS')!;
    expect(evidencias.getCell('D3').value).toBe('plano-estructural.pdf');
    expect(evidencias.getCell('E3').value).toBe('5');
    expect(evidencias.getCell('F3').value).toBe('native_text');
    expect(evidencias.getCell('G3').value).toBe('texto nativo PDF');
    expect(evidencias.getCell('H3').value).toBe('0.45');
    expect(evidencias.getCell('I3').value).toBe('Estribos 74E#3200');
    expect(evidencias.getCell('J3').value).toBe('Confirmar separacion');
    expect(evidencias.getCell('K3').value).toBe('Necesita revisión');
  });

  it('sanitiza texto peligroso en evidencia sin afectar formulas internas', () => {
    const records = [
      line({
        id: 'e1',
        originalDescription: '5#5600',
        evidence: {
          sourceFileName: '=cmd.xlsx',
          pageNumber: '\t=SUM(1,1)',
          sourceType: '+pdf',
          readingMethod: 'manual',
          confidence: '-1',
          originalFragment: '@fragment',
          observation: '   =SUM(1,1)',
          reviewStatus: '=approved',
        },
      }),
    ];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });
    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    const evidencias = wb.getWorksheet('EVIDENCIAS')!;

    expect(cantidades.getCell('N2').value).toMatchObject({ formula: 'I2*J2*K2' });
    expect(cantidades.getCell('W2').value).toBe("'=cmd.xlsx");
    expect(cantidades.getCell('X2').value).toBe("'\t=SUM(1,1)");
    expect(cantidades.getCell('Y2').value).toBe("'+pdf");
    expect(cantidades.getCell('AA2').value).toBe("'-1");
    expect(cantidades.getCell('AB2').value).toBe("'   =SUM(1,1)");
    expect(evidencias.getCell('I2').value).toBe("'@fragment");
    expect(evidencias.getCell('K2').value).toBe("'=approved");
  });

  it('no incluye tokens de DB/Supabase/RLS/produccion/deploy ni secretos', () => {
    const records = [line({ id: 'e1', originalDescription: '5#5600' })];
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoff(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-04T12:00:00.000Z'),
    });
    const haystack = workbookText(wb);

    for (const forbidden of ['supabase', 'rls', 'service_role', 'anon_key', '.env', 'database_url', 'production', 'deploy', 'storage']) {
      expect(haystack).not.toContain(forbidden);
    }
  });
});
