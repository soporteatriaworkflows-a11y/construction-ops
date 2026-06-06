/**
 * xlsx.ts — Generador Excel del presupuesto real (4E.1). ExcelJS, en memoria.
 *
 * Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §3`. Hojas: RESUMEN, PRESUPUESTO,
 * TRAZABILIDAD. No recalcula finanzas (usa el payload server-derived). Dinero
 * con `Decimal` para presentación (ROUND_HALF_UP). Sin temporales en disco.
 */
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';

const MONEY_FMT = '"$"#,##0';
const QTY_FMT = '#,##0.00';
const HEADER_ARGB = 'FF2E5FA3';
const CHAPTER_ARGB = 'FFE2EFDA';
const TOTAL_ARGB = 'FFD9E1F2';

function n(value: string): number {
  try {
    return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}
function n2(value: string): number {
  try {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
}
/** Porcentaje humano (`"3.5"`) → número para celda `%` (0.035). */
function pctCell(human: string): number {
  try {
    return new Decimal(human).div(100).toNumber();
  } catch {
    return 0;
  }
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = 18;
}

export async function generateEstimateExcel(payload: EstimateExportPayload): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Ops';
  wb.created = new Date(payload.generatedAt);

  // ----------------------------------------------------------------- RESUMEN
  const resumen = wb.addWorksheet('RESUMEN');
  resumen.getColumn('A').width = 34;
  resumen.getColumn('B').width = 26;
  resumen.getColumn('C').width = 14;

  resumen.mergeCells('A1:C1');
  resumen.getCell('A1').value = 'RESUMEN DEL PRESUPUESTO';
  resumen.getCell('A1').font = { bold: true, size: 14 };
  resumen.getCell('A1').alignment = { horizontal: 'center' };

  const f = payload.financial;
  let ri = 3;
  const put = (label: string, value: string | number, fmt?: string): void => {
    resumen.getCell(`A${ri}`).value = label;
    resumen.getCell(`A${ri}`).font = { bold: true };
    const cell = resumen.getCell(`B${ri}`);
    cell.value = value;
    if (fmt) cell.numFmt = fmt;
    ri++;
  };
  const fechaExport = new Date(payload.generatedAt).toLocaleDateString('es-CO');

  put('Organización', payload.organizationName);
  put('Proyecto', payload.project.name);
  put('Ciudad', payload.project.city ?? '—');
  put('Alcance', payload.scope.name ?? '—');
  put('Presupuesto', payload.estimate.name);
  put('Versión', payload.version.label);
  put('Estado', payload.version.status);
  put('Fecha de exportación', fechaExport);
  put('Cantidad de capítulos', payload.counts.chapters);
  put('Cantidad de ítems', payload.counts.items);

  ri++;
  resumen.getCell(`A${ri}`).value = 'RESUMEN FINANCIERO';
  resumen.getCell(`A${ri}`).font = { bold: true, size: 12 };
  ri++;

  // Encabezado de la tabla financiera (concepto | % | valor)
  resumen.getCell(`A${ri}`).value = 'Concepto';
  resumen.getCell(`B${ri}`).value = '%';
  resumen.getCell(`C${ri}`).value = 'Valor';
  styleHeaderRow(resumen.getRow(ri));
  ri++;

  const finRow = (label: string, pctHuman: string | null, amount: string, bold = false): void => {
    resumen.getCell(`A${ri}`).value = label;
    if (pctHuman !== null) {
      resumen.getCell(`B${ri}`).value = pctCell(pctHuman);
      resumen.getCell(`B${ri}`).numFmt = '0.00%';
    }
    resumen.getCell(`C${ri}`).value = n(amount);
    resumen.getCell(`C${ri}`).numFmt = MONEY_FMT;
    if (bold) {
      resumen.getRow(ri).font = { bold: true };
      (['A', 'B', 'C'] as const).forEach((col) => {
        resumen.getCell(`${col}${ri}`).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_ARGB },
        };
      });
    }
    ri++;
  };

  finRow('Costos directos', null, f.directTotal);
  finRow('Administración', payload.aiu.administrationRate, f.administrationAmount);
  finRow('Imprevistos', payload.aiu.contingencyRate, f.contingencyAmount);
  finRow('Utilidad', payload.aiu.utilityRate, f.utilityAmount);
  finRow('IVA sobre utilidad', payload.aiu.utilityVatRate, f.utilityVatAmount);
  finRow('Costos indirectos', null, f.indirectTotal);
  finRow('TOTAL GENERAL', null, f.grandTotal, true);

  // ------------------------------------------------------------- PRESUPUESTO
  const ws = wb.addWorksheet('PRESUPUESTO');
  const headers = ['Capítulo', 'Nombre de capítulo', 'Código ítem', 'Descripción', 'Unidad', 'Cantidad', 'Valor unitario', 'Subtotal'];
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));
  ws.autoFilter = { from: 'A1', to: 'H1' };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  let rowIdx = 2;
  for (const ch of payload.chapters) {
    ws.addRow([ch.code, ch.name.toUpperCase(), '', '', '', '', '', '']);
    const chRow = ws.getRow(rowIdx);
    chRow.font = { bold: true };
    chRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CHAPTER_ARGB } };
    rowIdx++;

    for (const it of ch.items) {
      ws.addRow([ch.code, ch.name, it.code, it.description, it.unit, n2(it.quantity), n2(it.unitPrice), n(it.subtotal)]);
      const r = ws.getRow(rowIdx);
      r.getCell(6).numFmt = QTY_FMT;
      r.getCell(7).numFmt = MONEY_FMT;
      r.getCell(8).numFmt = MONEY_FMT;
      rowIdx++;
    }

    ws.addRow(['', `Subtotal ${ch.name}`, '', '', '', '', '', n(ch.subtotal)]);
    const stRow = ws.getRow(rowIdx);
    stRow.font = { bold: true, italic: true };
    stRow.getCell(8).numFmt = MONEY_FMT;
    rowIdx++;
  }

  // Total directo + total general al pie
  rowIdx++;
  ws.addRow(['', 'COSTOS DIRECTOS', '', '', '', '', '', n(f.directTotal)]);
  ws.getRow(rowIdx).font = { bold: true };
  ws.getRow(rowIdx).getCell(8).numFmt = MONEY_FMT;
  rowIdx++;
  ws.addRow(['', 'COSTOS INDIRECTOS (AIU)', '', '', '', '', '', n(f.indirectTotal)]);
  ws.getRow(rowIdx).font = { bold: true };
  ws.getRow(rowIdx).getCell(8).numFmt = MONEY_FMT;
  rowIdx++;
  ws.addRow(['', 'TOTAL GENERAL', '', '', '', '', '', n(f.grandTotal)]);
  const totRow = ws.getRow(rowIdx);
  totRow.font = { bold: true };
  totRow.getCell(8).numFmt = MONEY_FMT;
  for (let c = 1; c <= 8; c++) {
    totRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_ARGB } };
  }

  [12, 36, 12, 50, 10, 12, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ------------------------------------------------------------ TRAZABILIDAD
  const traza = wb.addWorksheet('TRAZABILIDAD');
  const trazaHeaders = ['Tipo', 'Código canónico', 'Código original', 'Fila original', 'Normalizado'];
  traza.addRow(trazaHeaders);
  styleHeaderRow(traza.getRow(1));
  traza.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  for (const ch of payload.chapters) {
    traza.addRow([
      'Capítulo', ch.code, ch.sourceCode ?? '', ch.sourceRow ?? '',
      ch.sourceCode && ch.sourceCode !== ch.code ? 'Sí' : 'No',
    ]);
    for (const it of ch.items) {
      traza.addRow([
        'Ítem', it.code, it.sourceCode ?? '', it.sourceRow ?? '',
        it.sourceCode && it.sourceCode !== it.code ? 'Sí' : 'No',
      ]);
    }
  }
  [12, 18, 18, 14, 14].forEach((w, i) => { traza.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
