/**
 * xlsx-client.ts — Generador Excel presupuesto para cliente (ExcelJS).
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §3.A`.
 *
 * INCLUYE: proyecto, capítulos, ítems, cantidades, precio de venta,
 *          subtotales, AIU agregado, IVA, total.
 * EXCLUYE: todos los campos internos (🔒): precios de compra, descuentos,
 *          ahorros, márgenes, APU detallado, desglose AIU, proveedor, SKU.
 *
 * REGLAS:
 *  - Usa DTOs ya proyectados por el read-model con perfil `client`.
 *  - No recalcula finanzas.
 *  - Formato COP sin decimales para totales (Q9 — ROUND_HALF_UP en presentación).
 *  - Hojas con nombres estables; autoFilter; freeze panes; totales.
 *  - Generado en memoria (Uint8Array); sin temporales en disco.
 */

import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { EstimateSummary, ChapterSummary, BoqItemView } from '@/lib/contracts/read-model';
import { decimalStringToNumber } from '../format-cop';

export interface XlsxClientInput {
  projectName: string;
  projectLocation?: string | null;
  estimate: EstimateSummary;
  chapters: ChapterSummary[];
  items: BoqItemView[];
  generatedAt: string;
  /** Etiqueta del generador para encabezado (sin ID interno). */
  generatedByLabel?: string;
}

/** Formatea el % de un valor sobre costos directos para presentación. */
function pctLabel(partial: string, total: string): string {
  try {
    const p = new Decimal(partial).div(new Decimal(total)).mul(100);
    return `${p.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)}%`;
  } catch {
    return '';
  }
}

/** Aplica estilo de encabezado de sección a una fila. */
function styleHeaderRow(row: ExcelJS.Row, argb: string): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = 20;
}

/** Genera el Excel de presupuesto para cliente en memoria. */
export async function generateXlsxClient(
  input: XlsxClientInput,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Ops';
  wb.created = new Date(input.generatedAt);

  // -------------------------------------------------------------------------
  // Hoja 1: Portada
  // -------------------------------------------------------------------------
  const cover = wb.addWorksheet('Portada');
  cover.mergeCells('A1:C1');
  cover.getCell('A1').value = 'PRESUPUESTO DE OBRA';
  cover.getCell('A1').font = { bold: true, size: 16 };
  cover.getCell('A1').alignment = { horizontal: 'center' };

  const coverRows: [string, string][] = [
    ['Proyecto', input.projectName],
    ['Ubicación', input.projectLocation ?? ''],
    ['Versión', `V${input.estimate.versionNumber}`],
    ['Estado', input.estimate.status],
    ['Fecha de generación', new Date(input.generatedAt).toLocaleDateString('es-CO')],
  ];
  if (input.generatedByLabel) {
    coverRows.push(['Elaborado por', input.generatedByLabel]);
  }

  let ri = 3;
  for (const [label, val] of coverRows) {
    cover.getCell(`A${ri}`).value = label;
    cover.getCell(`A${ri}`).font = { bold: true };
    cover.getCell(`B${ri}`).value = val;
    ri++;
  }

  ri++;
  cover.getCell(`A${ri}`).value = 'RESUMEN FINANCIERO';
  cover.getCell(`A${ri}`).font = { bold: true };
  ri++;

  const dc = input.estimate.directCost;
  const financialRows: [string, string][] = [
    ['Costos directos', new Decimal(dc).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
    [`Administración (${pctLabel(input.estimate.administration, dc)})`, new Decimal(input.estimate.administration).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
    [`Imprevistos (${pctLabel(input.estimate.contingency, dc)})`, new Decimal(input.estimate.contingency).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
    [`Utilidad (${pctLabel(input.estimate.utility, dc)})`, new Decimal(input.estimate.utility).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
    ['IVA sobre utilidad', new Decimal(input.estimate.taxOnUtility).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
    ['TOTAL', new Decimal(input.estimate.grandTotal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)],
  ];

  for (const [label, val] of financialRows) {
    cover.getCell(`A${ri}`).value = label;
    cover.getCell(`B${ri}`).value = Number(val);
    cover.getCell(`B${ri}`).numFmt = '"$"#,##0';
    if (label === 'TOTAL') {
      cover.getCell(`A${ri}`).font = { bold: true };
      cover.getCell(`B${ri}`).font = { bold: true };
      (['A', 'B'] as const).forEach(col => {
        cover.getCell(`${col}${ri}`).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' },
        };
      });
    }
    ri++;
  }

  if (input.estimate.totalArea) {
    cover.getCell(`A${ri}`).value = 'Área construida (m²)';
    cover.getCell(`B${ri}`).value = decimalStringToNumber(input.estimate.totalArea, 'two-decimals');
    cover.getCell(`B${ri}`).numFmt = '#,##0.00';
    ri++;
  }
  if (input.estimate.costPerSquareMeter) {
    cover.getCell(`A${ri}`).value = 'Valor por m²';
    cover.getCell(`B${ri}`).value = decimalStringToNumber(input.estimate.costPerSquareMeter, 'no-decimals');
    cover.getCell(`B${ri}`).numFmt = '"$"#,##0';
    ri++;
  }

  cover.getColumn('A').width = 30;
  cover.getColumn('B').width = 22;

  // -------------------------------------------------------------------------
  // Hoja 2: Presupuesto
  // -------------------------------------------------------------------------
  const ws = wb.addWorksheet('Presupuesto');
  const headers = ['Código', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario', 'Subtotal'];
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1), 'FF2E5FA3');
  ws.autoFilter = { from: 'A1', to: 'F1' };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const itemsByChapter = new Map<string, BoqItemView[]>();
  for (const item of input.items) {
    const arr = itemsByChapter.get(item.chapterId) ?? [];
    arr.push(item);
    itemsByChapter.set(item.chapterId, arr);
  }

  let rowIdx = 2;
  for (const chapter of input.chapters) {
    ws.addRow([chapter.code, chapter.name.toUpperCase(), '', '', '', '']);
    const chRow = ws.getRow(rowIdx);
    chRow.font = { bold: true };
    chRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    rowIdx++;

    const chItems = itemsByChapter.get(chapter.id) ?? [];
    for (const item of chItems) {
      ws.addRow([
        item.code,
        item.description,
        item.unit,
        decimalStringToNumber(item.quantity, 'two-decimals'),
        decimalStringToNumber(item.unitPrice, 'two-decimals'),
        decimalStringToNumber(item.subtotal, 'two-decimals'),
      ]);
      const r = ws.getRow(rowIdx);
      r.getCell(4).numFmt = '#,##0.00';
      r.getCell(5).numFmt = '"$"#,##0.00';
      r.getCell(6).numFmt = '"$"#,##0.00';
      rowIdx++;
    }

    ws.addRow(['', `Subtotal ${chapter.name}`, '', '', '', decimalStringToNumber(chapter.subtotal, 'two-decimals')]);
    const stRow = ws.getRow(rowIdx);
    stRow.font = { bold: true, italic: true };
    stRow.getCell(6).numFmt = '"$"#,##0.00';
    rowIdx++;
  }

  rowIdx++;
  const summaryRows: [string, string][] = [
    ['Costos Directos', input.estimate.directCost],
    [`Administración (${pctLabel(input.estimate.administration, dc)})`, input.estimate.administration],
    [`Imprevistos (${pctLabel(input.estimate.contingency, dc)})`, input.estimate.contingency],
    [`Utilidad (${pctLabel(input.estimate.utility, dc)})`, input.estimate.utility],
    ['IVA sobre Utilidad', input.estimate.taxOnUtility],
    ['TOTAL', input.estimate.grandTotal],
  ];

  for (const [label, val] of summaryRows) {
    ws.addRow(['', label, '', '', '', decimalStringToNumber(val, 'two-decimals')]);
    const tr = ws.getRow(rowIdx);
    tr.getCell(6).numFmt = '"$"#,##0.00';
    if (label === 'TOTAL') {
      tr.font = { bold: true };
      for (let c = 1; c <= 6; c++) {
        tr.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' },
        };
      }
    }
    rowIdx++;
  }

  const colWidths = [12, 50, 10, 12, 18, 18];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
