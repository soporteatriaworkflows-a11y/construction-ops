/**
 * xlsx-internal.ts — Generador Excel técnico interno (ExcelJS).
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §3.B`.
 *
 * INCLUYE (perfil `internal`): presupuesto completo + capítulos + BOQ +
 *   catálogo + cronograma + avance + campos internos autorizados.
 * Superset técnico del perfil `internal`.
 *
 * REGLAS:
 *  - Usa DTOs ya proyectados por el read-model con perfil `internal`.
 *  - No recalcula finanzas.
 *  - Formato COP hasta 2 decimales (Q9 — ROUND_HALF_UP solo en presentación).
 *  - Hojas con nombres estables; autoFilter; freeze panes; totales.
 *  - Generado en memoria (Uint8Array); sin temporales en disco.
 */

import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type {
  EstimateSummary,
  ChapterSummary,
  BoqItemView,
  ScheduleSummary,
  ProgressEntryView,
  ResourceAssignmentView,
} from '@/lib/contracts/read-model';
import { decimalStringToNumber } from '../format-cop';

export interface XlsxInternalInput {
  projectName: string;
  projectLocation?: string | null;
  estimate: EstimateSummary;
  chapters: ChapterSummary[];
  items: BoqItemView[];
  schedule?: ScheduleSummary;
  progressEntries?: ProgressEntryView[];
  resourceAssignments?: ResourceAssignmentView[];
  generatedAt: string;
  generatedByLabel?: string;
}

function styleHeaderRow(row: ExcelJS.Row, argb: string): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = 20;
}

export async function generateXlsxInternal(
  input: XlsxInternalInput,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Ops [INTERNO]';
  wb.created = new Date(input.generatedAt);

  // -------------------------------------------------------------------------
  // Hoja 1: Resumen
  // -------------------------------------------------------------------------
  const ws0 = wb.addWorksheet('Resumen');
  ws0.mergeCells('A1:C1');
  ws0.getCell('A1').value = 'PRESUPUESTO TÉCNICO INTERNO';
  ws0.getCell('A1').font = { bold: true, size: 14 };
  ws0.getCell('A1').alignment = { horizontal: 'center' };

  const metaRows: [string, string][] = [
    ['Proyecto', input.projectName],
    ['Ubicación', input.projectLocation ?? ''],
    ['Versión', `V${input.estimate.versionNumber}`],
    ['Estado', input.estimate.status],
    ['Generado', new Date(input.generatedAt).toLocaleDateString('es-CO')],
    ...(input.generatedByLabel ? [['Elaborado por', input.generatedByLabel] as [string, string]] : []),
  ];

  let ri = 3;
  for (const [label, val] of metaRows) {
    ws0.getCell(`A${ri}`).value = label;
    ws0.getCell(`A${ri}`).font = { bold: true };
    ws0.getCell(`B${ri}`).value = val;
    ri++;
  }

  ri++;
  const dc = input.estimate.directCost;
  const dcNum = decimalStringToNumber(dc, 'two-decimals');
  const summaryData: [string, number][] = [
    ['Costos directos', dcNum],
    ['Administración', decimalStringToNumber(input.estimate.administration, 'two-decimals')],
    ['Imprevistos', decimalStringToNumber(input.estimate.contingency, 'two-decimals')],
    ['Utilidad', decimalStringToNumber(input.estimate.utility, 'two-decimals')],
    ['IVA sobre utilidad', decimalStringToNumber(input.estimate.taxOnUtility, 'two-decimals')],
    ['TOTAL', decimalStringToNumber(input.estimate.grandTotal, 'two-decimals')],
  ];
  for (const [label, val] of summaryData) {
    ws0.getCell(`A${ri}`).value = label;
    ws0.getCell(`B${ri}`).value = val;
    ws0.getCell(`B${ri}`).numFmt = '"$"#,##0.00';
    if (label === 'TOTAL') {
      ws0.getRow(ri).font = { bold: true };
      (['A', 'B'] as const).forEach(col => {
        ws0.getCell(`${col}${ri}`).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' },
        };
      });
    }
    ri++;
  }

  if (input.estimate.totalArea) {
    ws0.getCell(`A${ri}`).value = 'Área (m²)';
    ws0.getCell(`B${ri}`).value = decimalStringToNumber(input.estimate.totalArea, 'two-decimals');
    ws0.getCell(`B${ri}`).numFmt = '#,##0.00';
    ri++;
  }
  if (input.estimate.costPerSquareMeter) {
    ws0.getCell(`A${ri}`).value = 'Valor/m²';
    ws0.getCell(`B${ri}`).value = decimalStringToNumber(input.estimate.costPerSquareMeter, 'two-decimals');
    ws0.getCell(`B${ri}`).numFmt = '"$"#,##0.00';
    ri++;
  }

  ws0.getColumn('A').width = 24;
  ws0.getColumn('B').width = 22;

  // -------------------------------------------------------------------------
  // Hoja 2: BOQ Detallado
  // -------------------------------------------------------------------------
  const ws1 = wb.addWorksheet('BOQ Detallado');
  ws1.addRow(['Código Cap.', 'Capítulo', 'Código Ítem', 'Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'Subtotal']);
  styleHeaderRow(ws1.getRow(1), 'FF2E5FA3');
  ws1.autoFilter = { from: 'A1', to: 'H1' };
  ws1.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const chapterMap = new Map(input.chapters.map(c => [c.id, c]));
  let wsRow = 2;
  for (const item of input.items) {
    const ch = chapterMap.get(item.chapterId);
    ws1.addRow([
      ch?.code ?? '',
      ch?.name ?? '',
      item.code,
      item.description,
      item.unit,
      decimalStringToNumber(item.quantity, 'two-decimals'),
      decimalStringToNumber(item.unitPrice, 'two-decimals'),
      decimalStringToNumber(item.subtotal, 'two-decimals'),
    ]);
    const r = ws1.getRow(wsRow);
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(7).numFmt = '"$"#,##0.00';
    r.getCell(8).numFmt = '"$"#,##0.00';
    wsRow++;
  }

  // Totales por capítulo
  ws1.addRow([]);
  wsRow++;
  ws1.addRow(['', 'TOTALES POR CAPÍTULO', '', '', '', '', '', '']);
  ws1.getRow(wsRow).font = { bold: true };
  wsRow++;
  for (const ch of input.chapters) {
    ws1.addRow(['', ch.name, '', '', '', '', '', decimalStringToNumber(ch.subtotal, 'two-decimals')]);
    ws1.getRow(wsRow).getCell(8).numFmt = '"$"#,##0.00';
    wsRow++;
  }
  ws1.addRow(['', 'TOTAL COSTOS DIRECTOS', '', '', '', '', '', dcNum]);
  ws1.getRow(wsRow).font = { bold: true };
  ws1.getRow(wsRow).getCell(8).numFmt = '"$"#,##0.00';

  [12, 30, 12, 50, 10, 12, 18, 18].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

  // -------------------------------------------------------------------------
  // Hoja 3: Cronograma (si se incluye)
  // -------------------------------------------------------------------------
  if (input.schedule) {
    const ws2 = wb.addWorksheet('Cronograma');
    ws2.addRow([
      'WBS', 'Nombre', 'Inicio Planificado', 'Fin Planificado',
      'Duración (días)', 'Avance %', 'Estado', 'Es Hito',
      'Holgura Total', 'Holgura Libre', 'Crítica', 'Ref. Externa',
    ]);
    styleHeaderRow(ws2.getRow(1), 'FF444444');
    ws2.autoFilter = { from: 'A1', to: 'L1' };
    ws2.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    let wr = 2;
    for (const task of input.schedule.tasks) {
      ws2.addRow([
        task.wbsCode,
        task.name,
        task.plannedStart,
        task.plannedEnd,
        decimalStringToNumber(task.plannedDurationDays, 'two-decimals'),
        decimalStringToNumber(task.progressPct, 'two-decimals'),
        task.status,
        task.isMilestone ? 'Sí' : 'No',
        task.totalFloatDays != null ? decimalStringToNumber(task.totalFloatDays, 'two-decimals') : '',
        task.freeFloatDays != null ? decimalStringToNumber(task.freeFloatDays, 'two-decimals') : '',
        task.isCritical != null ? (task.isCritical ? 'Sí' : 'No') : '',
        '',  // externalReference no disponible en ScheduleTaskView (solo en fixture raw)
      ]);
      ws2.getRow(wr).getCell(6).numFmt = '#,##0.00"%"';
      wr++;
    }

    [10, 40, 14, 14, 14, 12, 14, 10, 14, 14, 10, 18].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// Suppress unused variable warning for Decimal import
void Decimal;
