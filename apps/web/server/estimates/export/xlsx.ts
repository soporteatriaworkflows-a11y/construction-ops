/**
 * xlsx.ts — Generador Excel del presupuesto real con branding GRUPO ICONIC (4E.1C).
 *
 * ExcelJS, en memoria. Hojas: RESUMEN, PRESUPUESTO, TRAZABILIDAD (contrato §3).
 * No recalcula finanzas (usa el payload server-derived). Branding puramente
 * visual: paleta oficial ICONIC (sin dorado), logo completo en RESUMEN. No
 * altera fórmulas, valores, hojas, conteos, códigos, trazabilidad ni paneles.
 */
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import { BRAND, BRAND_ARGB, getLogoDataUri } from './branding';

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

/** Encabezado de tabla con estilo corporativo (azul ICONIC, texto blanco). */
function styleTableHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: BRAND_ARGB.white }, size: 10 };
    cell.fill = fill(BRAND_ARGB.primary);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder(BRAND_ARGB.border);
  });
  row.height = 18;
}

/** Banda de marca ICONIC en RESUMEN (logo completo sobre fondo blanco). */
function brandHeader(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): void {
  for (let r = 1; r <= 3; r++) ws.getRow(r).height = 20;
  // Logo oficial completo, flotando a la izquierda (texto azul noche legible en blanco).
  const logo = getLogoDataUri('full');
  if (logo) {
    const imageId = wb.addImage({ base64: logo, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0.1, row: 0.2 }, ext: { width: 150, height: 64 }, editAs: 'oneCell' });
  } else {
    const m = ws.getCell('A1');
    m.value = BRAND.monogram;
    m.font = { bold: true, size: 22, color: { argb: BRAND_ARGB.primary } };
    m.alignment = { vertical: 'middle' };
  }
  // Título del documento a la derecha (azul noche), versión en azul ICONIC.
  ws.mergeCells('B1:C2');
  const t = ws.getCell('B1');
  t.value = BRAND.documentTitle;
  t.font = { bold: true, size: 15, color: { argb: BRAND_ARGB.deepNavy } };
  t.alignment = { vertical: 'middle', horizontal: 'right' };
  ws.mergeCells('B3:C3');
  const s = ws.getCell('B3');
  s.value = `${BRAND.name}  ·  ${BRAND.tagline}`;
  s.font = { size: 9, color: { argb: BRAND_ARGB.primary } };
  s.alignment = { horizontal: 'right' };
  // Regla de acento cian (fila 4).
  ws.mergeCells('A4:C4');
  ws.getRow(4).height = 3;
  ws.getCell('A4').fill = fill(BRAND_ARGB.accent);
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
  brandHeader(wb, resumen);

  const f = payload.financial;
  let ri = 6;
  const fechaExport = new Date(payload.generatedAt).toLocaleDateString('es-CO');

  resumen.mergeCells(`A${ri}:C${ri}`);
  const nameCell = resumen.getCell(`A${ri}`);
  nameCell.value = payload.estimate.name;
  nameCell.font = { bold: true, size: 13, color: { argb: BRAND_ARGB.deepNavy } };
  ri += 2;

  const put = (label: string, value: string | number): void => {
    const l = resumen.getCell(`A${ri}`);
    l.value = label;
    l.font = { bold: true, color: { argb: BRAND_ARGB.primary } };
    resumen.mergeCells(`B${ri}:C${ri}`);
    const v = resumen.getCell(`B${ri}`);
    v.value = value;
    v.font = { color: { argb: BRAND_ARGB.graphite } };
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
  finTitle.fill = fill(BRAND_ARGB.deepNavy);
  finTitle.alignment = { vertical: 'middle', indent: 1 };
  resumen.getRow(ri).height = 18;
  ri++;

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
      a.font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
      c.font = { bold: true };
      (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).fill = fill(BRAND_ARGB.bandLight); });
    } else if (kind === 'total') {
      resumen.getRow(ri).height = 20;
      a.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      c.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      (['A', 'B', 'C'] as const).forEach((col) => { resumen.getCell(`${col}${ri}`).fill = fill(BRAND_ARGB.deepNavy); });
      a.border = { ...thinBorder(BRAND_ARGB.border), left: { style: 'medium', color: { argb: BRAND_ARGB.accent } } };
    } else {
      a.font = { color: { argb: BRAND_ARGB.graphite } };
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
    chRow.font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
    chRow.eachCell({ includeEmpty: true }, (c) => { c.fill = fill(BRAND_ARGB.bandLight); });
    rowIdx++;

    let alt = false;
    for (const it of ch.items) {
      ws.addRow([ch.code, ch.name, it.code, it.description, it.unit, n2(it.quantity), n2(it.unitPrice), n(it.subtotal)]);
      const r = ws.getRow(rowIdx);
      r.getCell(6).numFmt = QTY_FMT;
      r.getCell(7).numFmt = MONEY_FMT;
      r.getCell(8).numFmt = MONEY_FMT;
      if (alt) r.eachCell((c) => { c.fill = fill(BRAND_ARGB.bandLight); });
      alt = !alt;
      rowIdx++;
    }

    ws.addRow(['', `Subtotal ${ch.name}`, '', '', '', '', '', n(ch.subtotal)]);
    const stRow = ws.getRow(rowIdx);
    stRow.font = { bold: true, italic: true, color: { argb: BRAND_ARGB.primary } };
    stRow.getCell(8).numFmt = MONEY_FMT;
    rowIdx++;
  }

  rowIdx++;
  const footRow = (label: string, value: string, total = false): void => {
    ws.addRow(['', label, '', '', '', '', '', n(value)]);
    const r = ws.getRow(rowIdx);
    r.getCell(8).numFmt = MONEY_FMT;
    if (total) {
      r.height = 20;
      r.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
      for (let cI = 1; cI <= 8; cI++) r.getCell(cI).fill = fill(BRAND_ARGB.deepNavy);
      r.getCell(2).border = { left: { style: 'medium', color: { argb: BRAND_ARGB.accent } } };
    } else {
      r.font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
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
    traza.getRow(tIdx).font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
    tIdx++;
    for (const it of ch.items) {
      traza.addRow(['Ítem', it.code, it.sourceCode ?? '', it.sourceRow ?? '', it.sourceCode && it.sourceCode !== it.code ? 'Sí' : 'No']);
      traza.getRow(tIdx).font = { color: { argb: BRAND_ARGB.graphite } };
      if (tAlt) traza.getRow(tIdx).eachCell((c) => { c.fill = fill(BRAND_ARGB.bandLight); });
      tAlt = !tAlt;
      tIdx++;
    }
  }
  [12, 18, 18, 14, 14].forEach((w, i) => { traza.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
