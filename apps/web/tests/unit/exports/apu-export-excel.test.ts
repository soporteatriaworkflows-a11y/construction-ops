/**
 * apu-export-excel.test.ts — Excel del anexo APU y del paquete (APU_EXPORTS_V1).
 * Casos 12–18 del mandato.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  generateLinkedApuExcel,
  generatePackageExcel,
} from '@/server/estimates/export/apu-annex';
import { generateEstimateExcel, buildEstimateExportFileName } from '@/server/estimates/export';
import { buildApuExportFileName } from '@/server/estimates/export/apu-annex';
import { selection, linkedApu, basePayload } from './apu-export-fixtures';

async function read(buf: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('APU export — Excel', () => {
  it('12. presupuesto Excel existente intacto (RESUMEN/PRESUPUESTO/TRAZABILIDAD)', async () => {
    const buf = await generateEstimateExcel(basePayload());
    const wb = await read(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['RESUMEN', 'PRESUPUESTO', 'TRAZABILIDAD']);
  });

  it('13. APU vinculados Excel genera hoja ÍNDICE APU con filas', async () => {
    const buf = await generateLinkedApuExcel(selection());
    const wb = await read(buf);
    const idx = wb.getWorksheet('ÍNDICE APU');
    expect(idx).toBeTruthy();
    // Encabezado en fila 6, primera fila de datos en 7.
    expect(idx!.getRow(7).getCell(1).value).toBe('APU-MAM-01');
  });

  it('14. APU vinculados Excel incluye componentes en la hoja del APU', async () => {
    const buf = await generateLinkedApuExcel(selection());
    const wb = await read(buf);
    const sheet = wb.getWorksheet('APU 01');
    expect(sheet).toBeTruthy();
    const flat = JSON.stringify(sheet!.getSheetValues());
    expect(flat).toContain('Cemento');
    expect(flat).toContain('Oficial');
    expect(flat).toContain('TOTAL UNITARIO');
  });

  it('15. paquete completo Excel incluye BOQ + APU', async () => {
    const buf = await generatePackageExcel(selection());
    const wb = await read(buf);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('PRESUPUESTO');
    expect(names).toContain('ÍNDICE APU');
    expect(names).toContain('APU 01');
  });

  it('16. sanitiza formula injection (texto que empieza por = / + / - / @)', async () => {
    const evil = linkedApu({ name: '=HYPERLINK("http://x")', code: '@cmd', origin: '+evil' });
    const buf = await generateLinkedApuExcel(selection({ linkedApus: [evil] }));
    const wb = await read(buf);
    const idx = wb.getWorksheet('ÍNDICE APU')!;
    const codeCell = String(idx.getRow(7).getCell(1).value);
    const nameCell = String(idx.getRow(7).getCell(2).value);
    expect(codeCell.startsWith("'@")).toBe(true);
    expect(nameCell.startsWith("'=")).toBe(true);
  });

  it('17. nombres de hojas seguros y únicos (APU NN ≤ 31 chars)', async () => {
    const many = Array.from({ length: 3 }, (_, i) => linkedApu({ apuTemplateId: `a${i}`, code: `APU-${i}` }));
    const buf = await generateLinkedApuExcel(selection({ linkedApus: many }));
    const wb = await read(buf);
    const apuSheets = wb.worksheets.map((w) => w.name).filter((n) => n.startsWith('APU '));
    expect(apuSheets).toEqual(['APU 01', 'APU 02', 'APU 03']);
    apuSheets.forEach((n) => expect(n.length).toBeLessThanOrEqual(31));
    expect(new Set(apuSheets).size).toBe(apuSheets.length);
  });

  it('18. nombres de archivo seguros', async () => {
    const sel = selection({ payload: basePayload({ estimate: { id: 'e', code: 'EP/01 *raro', name: 'x', status: 'active' } }) });
    const apuName = buildApuExportFileName(sel, 'apu', 'xlsx');
    const pkgName = buildApuExportFileName(sel, 'package', 'pdf');
    expect(apuName).toMatch(/^apu_vinculados_[a-z0-9_]+_v01\.xlsx$/);
    expect(pkgName).toMatch(/^paquete_presupuesto_apu_[a-z0-9_]+_v01\.pdf$/);
    expect(apuName).not.toMatch(/[/\\.][/\\]/);
    // presupuesto existente conserva su patrón.
    expect(buildEstimateExportFileName(sel.payload, 'xlsx')).toMatch(/\.xlsx$/);
  });
});
