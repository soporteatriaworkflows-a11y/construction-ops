/**
 * xlsx.ts — Generador Excel del presupuesto real con branding ICONIC (4E.1/4E.1B).
 *
 * ExcelJS, en memoria. Hojas: RESUMEN, PRESUPUESTO, TRAZABILIDAD (contrato §3).
 * No recalcula finanzas (usa el payload server-derived). El branding (logo +
 * paleta corporativa) es puramente visual; no altera el contenido estructural.
 */
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import { BRAND, BRAND_ARGB, loadBrandLogo } from './branding';

const MONEY_FMT = '"$"#,##0';
const QTY_FMT = '#,##0.00';

function n(value: string): number {
  try { return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(); } catch { return 0; }
}
function n2(value: string): number {
  try { return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(); } catch { return 0; }
}
function pctCell(human: string): number {
  try { return new Decimal(human).div(100).toNumber(); } catch { return 0; }
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function thinBorder(argb: string): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb } };
  return { top: side, left: side, bottom: side, right: side };
}

/** Encabezado de tabla con estilo corporativo. */
function styleTableHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: BRAND_ARGB.white }, size: 10 };
    cell.fill = fill(BRAND_ARGB.primarySoft);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder(BRAND_ARGB.border);
  });
  row.height = 18;
}

/** Inserta la banda de marca (logo o monograma) en las filas 1–4. */
function brandHeader(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, lastCol: string): void {
  ws.mergeCells(`A1:${lastCol}3`);
  const band = ws.getCell('A1');
  band.value = {
    richText: [
      { text: `${BRAND.name}\n`, font: { bold: true, size: 20, color: { argb: BRAND_ARGB.white } } },
      { text: `${BRAND.tagline}   ·   ${BRAND.documentTitle}`, font: { size: 10, color: { argb: 'FFC9D4E0' } } },
    ],
  };
  band.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).height = 22;
    ws.getRow(r).eachCell?.({ includeEmpty: true }, (c) => { c.fill = fill(BRAND_ARGB.primary); });
  }
  ws.getCell('A1').fill = fill(BRAND_ARGB.primary);
  // Línea de acento dorada (fila 4).
  ws.mergeCells(`A4:${lastCol}4`);
  ws.getRow(4).height = 4;
  ws.getCell('A4').fill = fill(BRAND_ARGB.accent);

  // Logo opcional, flotando a la derecha de la banda.
  const logo = loadBrandLogo();
  if (logo) {
    const imageId = wb.addImage({ base64: logo.dataUri, extension: logo.extension });
    ws.addImage(imageId, {
      tl: { col: lastCol === 'C' ? 2.55 : 4.55, row: 0.25 },
      ext: { width: 58, height: 58 },
      editAs: 'oneCell',
    });
  }
}

export async function generateEstimateExcel(payload: EstimateExportPayload): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date(payload.generatedAt);

  // ----------------------------------------------------------------- RESUMEN
  const resumen = wb.addWorksheet('RESUMEN', { views: [{ showGridLines: false }] });
  resumen.getColumn('A').width = 34;
  resumen.getColumn('B').width = 24;
  resumen.getColumn('C').width = 18;
  brandHeader(wb, resumen, 'C');

  const f = payload.financial;
  let ri = 6;
  const fechaExport = new Date(payload.generatedAt).toLocaleDateString('es-CO');

  // Sub-encabezado: nombre del presupuesto.
  resumen.mergeCells(`A${ri}:C${ri}`);
  const nameCell = resumen.getCell(`A${ri}`);
  nameCell.value = payload.estimate.name;
  nameCell.font = { bold: true, size: 13, color: { argb: BRAND_ARGB.primary } };
  ri += 2;

  const put = (label: string, value: string | number): void => {
    const l = resumen.getCell(`A${ri}`);
    l.value = label;
    l.font = { bold: true, color: { argb: BRAND_ARGB.primarySoft } };
    resumen.mergeCells(`B${ri}:C${ri}`);
    resumen.getCell(`B${ri}`).value = value;
    if (ri % 2 === 0) {
      (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).fill = fill(BRAND_ARGB.bandLight); });
    }
    ri++;
  };
  put('Organización', payload.organizationName);
  put('Proyecto', payload.project.name);
  put('Ciudad', payload.project.city ?? '—');
  put('Alcance', payload.scope.name ?? '—');
  put('Versión', payload.version.label);
  put('Estado', payload.version.status);
  put('Fecha de exportación', fechaExport);
  put('Cantidad de capítulos', payload.counts.chapters);
  put('Cantidad de ítems', payload.counts.items);

  ri++;
  resumen.mergeCells(`A${ri}:C${ri}`);
  const finTitle = resumen.getCell(`A${ri}`);
  finTitle.value = 'RESUMEN FINANCIERO';
  finTitle.font = { bold: true, size: 11, color: { argb: BRAND_ARGB.white } };
  finTitle.fill = fill(BRAND_ARGB.primary);
  finTitle.alignment = { vertical: 'middle', indent: 1 };
  resumen.getRow(ri).height = 18;
  ri++;

  // Cabecera de la tabla financiera.
  resumen.getCell(`A${ri}`).value = 'Concepto';
  resumen.getCell(`B${ri}`).value = '%';
  resumen.getCell(`C${ri}`).value = 'Valor';
  styleTableHeader(resumen.getRow(ri));
  ri++;

  const finRow = (label: string, pctHuman: string | null, amount: string, kind: 'item' | 'subtotal' | 'total'): void => {
    const a = resumen.getCell(`A${ri}`);
    const b = resumen.getCell(`B${ri}`);
    const c = resumen.getCell(`C${ri}`);
    a.value = label;
    if (pctHuman !== null) { b.value = pctCell(pctHuman); b.numFmt = '0.00%'; b.alignment = { horizontal: 'right' }; }
    c.value = n(amount); c.numFmt = MONEY_FMT;
    (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).border = thinBorder(BRAND_ARGB.border); });
    if (kind === 'subtotal') {
      a.font = { bold: true, color: { argb: BRAND_ARGB.primary } };
      c.font = { bold: true };
      (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).fill = fill(BRAND_ARGB.bandLight); });
    } else if (kind === 'total') {
      resumen.getRow(ri).height = 20;
      a.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      c.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).fill = fill(BRAND_ARGB.primary); });
      a.border = { ...thinBorder(BRAND_ARGB.accent), left: { style: 'medium', color: { argb: BRAND_ARGB.accent } } };
    }
    ri++;
  };
  finRow('Costos directos', null, f.directTotal, 'subtotal');
  finRow('Administración', payload.aiu.administrationRate, f.administrationAmount, 'item');
  finRow('Imprevistos', payload.aiu.contingencyRate, f.contingencyAmount, 'item');
  finRow('Utilidad', payload.aiu.utilityRate, f.utilityAmount, 'item');
  finRow('IVA sobre utilidad', payload.aiu.utilityVatRate, f.utilityVatAmount, 'item');
  finRow('Costos indirectos (AIU)', null, f.indirectTotal, 'subtotal');
  finRow('TOTAL GENERAL', null, f.grandTotal, 'total');

  // ------------------------------------------------------------- PRESUPUESTO
  const ws = wb.addWorksheet('PRESUPUESTO', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  const headers = ['Capítulo', 'Nombre de capítulo', 'Código ítem', 'Descripción', 'Unidad', 'Cantidad', 'Valor unitario', 'Subtotal'];
  ws.addRow(headers);
  styleTableHeader(ws.getRow(1));
  ws.autoFilter = { from: 'A1', to: 'H1' };

  let rowIdx = 2;
  for (const ch of payload.chapters) {
    ws.addRow([ch.code, ch.name.toUpperCase(), '', '', '', '', '', '']);
    const chRow = ws.getRow(rowIdx);
    chRow.font = { bold: true, color: { argb: BRAND_ARGB.primary } };
    chRow.eachCell({ includeEmpty: true }, (c) => { c.fill = fill(BRAND_ARGB.bandLight); });
    rowIdx++;

    let alt = false;
    for (const it of ch.items) {
      ws.addRow([ch.code, ch.name, it.code, it.description, it.unit, n2(it.quantity), n2(it.unitPrice), n(it.subtotal)]);
      const r = ws.getRow(rowIdx);
      r.getCell(6).numFmt = QTY_FMT;
      r.getCell(7).numFmt = MONEY_FMT;
      r.getCell(8).numFmt = MONEY_FMT;
      if (alt) r.eachCell((c) => { c.fill = fill('FFFAFBFD'); });
      alt = !alt;
      rowIdx++;
    }

    ws.addRow(['', `Subtotal ${ch.name}`, '', '', '', '', '', n(ch.subtotal)]);
    const stRow = ws.getRow(rowIdx);
    stRow.font = { bold: true, italic: true, color: { argb: BRAND_ARGB.primarySoft } };
    stRow.getCell(8).numFmt = MONEY_FMT;
    rowIdx++;
  }

  // Pie: directos, indirectos, total general.
  rowIdx++;
  const footRow = (label: string, value: string, total = false): void => {
    ws.addRow(['', label, '', '', '', '', '', n(value)]);
    const r = ws.getRow(rowIdx);
    r.getCell(8).numFmt = MONEY_FMT;
    if (total) {
      r.height = 20;
      r.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      for (let cI = 1; cI <= 8; cI++) r.getCell(cI).fill = fill(BRAND_ARGB.primary);
      r.getCell(2).border = { left: { style: 'medium', color: { argb: BRAND_ARGB.accent } } };
    } else {
      r.font = { bold: true, color: { argb: BRAND_ARGB.primary } };
      for (let cI = 1; cI <= 8; cI++) r.getCell(cI).fill = fill(BRAND_ARGB.bandLight);
    }
    rowIdx++;
  };
  footRow('COSTOS DIRECTOS', f.directTotal);
  footRow('COSTOS INDIRECTOS (AIU)', f.indirectTotal);
  footRow('TOTAL GENERAL', f.grandTotal, true);

  [12, 38, 12, 52, 9, 13, 17, 17].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ------------------------------------------------------------ TRAZABILIDAD
  const traza = wb.addWorksheet('TRAZABILIDAD', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  traza.addRow(['Tipo', 'Código canónico', 'Código original', 'Fila original', 'Normalizado']);
  styleTableHeader(traza.getRow(1));

  let tIdx = 2;
  let tAlt = false;
  for (const ch of payload.chapters) {
    traza.addRow(['Capítulo', ch.code, ch.sourceCode ?? '', ch.sourceRow ?? '', ch.sourceCode && ch.sourceCode !== ch.code ? 'Sí' : 'No']);
    traza.getRow(tIdx).font = { bold: true, color: { argb: BRAND_ARGB.primarySoft } };
    tIdx++;
    for (const it of ch.items) {
      traza.addRow(['Ítem', it.code, it.sourceCode ?? '', it.sourceRow ?? '', it.sourceCode && it.sourceCode !== it.code ? 'Sí' : 'No']);
      if (tAlt) traza.getRow(tIdx).eachCell((c) => { c.fill = fill('FFFAFBFD'); });
      tAlt = !tAlt;
      tIdx++;
    }
  }
  [12, 18, 18, 14, 14].forEach((w, i) => { traza.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
