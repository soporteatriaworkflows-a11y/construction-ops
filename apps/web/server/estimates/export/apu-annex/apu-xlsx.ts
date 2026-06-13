/**
 * apu-xlsx.ts — Generador Excel del anexo de APU vinculados (APU_EXPORTS_V1).
 *
 * ExcelJS, en memoria. Hoja 1 «ÍNDICE APU» + una hoja por APU vinculado. Branding
 * ICONIC. Texto SIEMPRE saneado contra formula injection (`safeCell`). No
 * recalcula finanzas: usa el cálculo actual del APU (read-model) y los snapshots
 * del presupuesto. Contrato §3, §5, §7.
 */
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type {
  BudgetApuExportSelection,
  LinkedApuView,
} from '@/lib/estimates/apu-export-types';
import type { ApuComponentView } from '@/lib/contracts/read-model';
import { BRAND, BRAND_ARGB, getLogoDataUri } from '../branding';
import { addBudgetSheets } from '../xlsx';
import { safeCell, cleanText } from './sanitize';

const MONEY_FMT = '"$"#,##0';
const QTY_FMT = '#,##0.0000';
const PCT_FMT = '0.00%';

function n(value: string): number {
  try { return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(); } catch { return 0; }
}
function nq(value: string): number {
  try { return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber(); } catch { return 0; }
}
function frac(value: string): number {
  try { return new Decimal(value).toNumber(); } catch { return 0; }
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function thinBorder(argb: string): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb } };
  return { top: side, left: side, bottom: side, right: side };
}
function styleTableHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: BRAND_ARGB.white }, size: 10 };
    cell.fill = fill(BRAND_ARGB.primary);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder(BRAND_ARGB.border);
  });
  row.height = 18;
}

const TYPE_LABEL: Record<string, string> = {
  material: 'Material',
  labor: 'Mano de obra',
  equipment: 'Equipo',
  tool: 'Herramienta',
  subcontract: 'Subcontrato',
  other: 'Otro',
};

function apuStatus(apu: LinkedApuView): string {
  if (apu.archived) return 'Archivado';
  if (apu.incomplete) return 'Incompleto';
  return 'Activo';
}

/** Nombre de hoja seguro y único: `APU NN` (≤ 31 chars, sin caracteres ilegales). */
function sheetName(index: number): string {
  return `APU ${String(index + 1).padStart(2, '0')}`;
}

function componentResource(c: ApuComponentView): string {
  return (
    c.resourceName ??
    c.laborRoleName ??
    c.resourceCode ??
    c.laborRoleCode ??
    TYPE_LABEL[c.componentType] ??
    '—'
  );
}

/** Banda de marca ICONIC (logo + título) en una hoja. */
function brandBand(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, subtitle: string): void {
  for (let r = 1; r <= 3; r++) ws.getRow(r).height = 20;
  const logo = getLogoDataUri('full');
  if (logo) {
    const imageId = wb.addImage({ base64: logo, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0.1, row: 0.2 }, ext: { width: 150, height: 64 }, editAs: 'oneCell' });
  } else {
    const m = ws.getCell('A1');
    m.value = BRAND.monogram;
    m.font = { bold: true, size: 22, color: { argb: BRAND_ARGB.primary } };
  }
  const t = ws.getCell('B1');
  t.value = 'ANEXO · ANÁLISIS DE PRECIOS UNITARIOS';
  t.font = { bold: true, size: 13, color: { argb: BRAND_ARGB.deepNavy } };
  const s = ws.getCell('B2');
  s.value = safeCell(subtitle);
  s.font = { size: 9, color: { argb: BRAND_ARGB.primary } };
  ws.getRow(4).height = 3;
  ws.mergeCells('A4:I4');
  ws.getCell('A4').fill = fill(BRAND_ARGB.accent);
}

/**
 * Añade la hoja ÍNDICE APU y una hoja por APU vinculado al workbook recibido.
 * Reutilizable por el anexo independiente y por el paquete completo.
 */
export function addApuSheets(wb: ExcelJS.Workbook, selection: BudgetApuExportSelection): void {
  const { payload, linkedApus } = selection;
  const subtitle = `${cleanText(payload.estimate.name)} · ${payload.version.label} · ${payload.version.status}`;

  // ----------------------------------------------------------- ÍNDICE APU
  const idx = wb.addWorksheet('ÍNDICE APU', { views: [{ showGridLines: false }] });
  brandBand(wb, idx, subtitle);

  const headerRowIndex = 6;
  const headers = [
    'Código APU', 'Descripción', 'Unidad', 'Costo unitario', 'Ítem BOQ',
    'Capítulo', 'Componentes', 'Estado', 'Origen',
  ];
  idx.getRow(headerRowIndex).values = headers;
  styleTableHeader(idx.getRow(headerRowIndex));
  idx.autoFilter = { from: { row: headerRowIndex, column: 1 }, to: { row: headerRowIndex, column: 9 } };

  let r = headerRowIndex + 1;
  let alt = false;
  for (const apu of linkedApus) {
    const firstLink = apu.boqLinks[0];
    const itemLabel = firstLink
      ? apu.boqLinks.length > 1
        ? `${firstLink.itemCode} (+${apu.boqLinks.length - 1})`
        : firstLink.itemCode
      : '—';
    const row = idx.getRow(r);
    row.getCell(1).value = safeCell(apu.code);
    row.getCell(2).value = safeCell(apu.name);
    row.getCell(3).value = safeCell(apu.unit);
    row.getCell(4).value = n(apu.unitCostTotal);
    row.getCell(4).numFmt = MONEY_FMT;
    row.getCell(5).value = safeCell(itemLabel);
    row.getCell(6).value = safeCell(apu.primaryChapterName || apu.primaryChapterCode);
    row.getCell(7).value = apu.componentCount;
    row.getCell(8).value = safeCell(apuStatus(apu));
    row.getCell(9).value = safeCell(apu.origin);
    for (let c = 1; c <= 9; c++) row.getCell(c).border = thinBorder(BRAND_ARGB.border);
    if (apu.archived || apu.incomplete) {
      row.getCell(8).font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
    }
    if (alt) row.eachCell((c) => { c.fill = fill(BRAND_ARGB.bandLight); });
    alt = !alt;
    r++;
  }
  if (linkedApus.length === 0) {
    idx.mergeCells(`A${r}:I${r}`);
    idx.getCell(`A${r}`).value = 'Este presupuesto no tiene APU vinculados a sus ítems BOQ.';
    idx.getCell(`A${r}`).font = { italic: true, color: { argb: BRAND_ARGB.graphite } };
  }
  [16, 46, 10, 16, 16, 24, 13, 13, 16].forEach((w, i) => { idx.getColumn(i + 1).width = w; });

  // ------------------------------------------------------- HOJA POR APU
  linkedApus.forEach((apu, i) => {
    const ws = wb.addWorksheet(sheetName(i), { views: [{ showGridLines: false }] });
    [16, 40, 14, 14, 16, 16].forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });

    // Encabezado del APU.
    ws.mergeCells('A1:F1');
    const title = ws.getCell('A1');
    title.value = safeCell(`${apu.code} · ${apu.name}`);
    title.font = { bold: true, size: 13, color: { argb: BRAND_ARGB.deepNavy } };
    ws.getRow(2).height = 3;
    ws.mergeCells('A2:F2');
    ws.getCell('A2').fill = fill(BRAND_ARGB.accent);

    let rr = 4;
    const meta = (label: string, value: string | number, money = false): void => {
      ws.getCell(`A${rr}`).value = label;
      ws.getCell(`A${rr}`).font = { bold: true, color: { argb: BRAND_ARGB.primary } };
      const v = ws.getCell(`B${rr}`);
      v.value = value;
      if (money) v.numFmt = MONEY_FMT;
      v.font = { color: { argb: BRAND_ARGB.graphite } };
      rr++;
    };
    meta('Unidad', safeCell(apu.unit));
    meta('Costo unitario', n(apu.unitCostTotal), true);
    meta('Origen', safeCell(apu.origin));
    meta('Estado', safeCell(apuStatus(apu)));
    if (apu.archived) {
      ws.mergeCells(`A${rr}:F${rr}`);
      ws.getCell(`A${rr}`).value = 'APU archivado: preservado por vínculo histórico a una versión emitida.';
      ws.getCell(`A${rr}`).font = { italic: true, color: { argb: BRAND_ARGB.deepNavy } };
      rr++;
    }
    if (apu.incomplete) {
      ws.mergeCells(`A${rr}:F${rr}`);
      ws.getCell(`A${rr}`).value = 'APU incompleto: costo unitario en cero o componentes sin precio aprobado.';
      ws.getCell(`A${rr}`).font = { italic: true, color: { argb: BRAND_ARGB.deepNavy } };
      rr++;
    }
    rr++;

    // Tabla de componentes.
    const compHeaders = ['Tipo', 'Recurso / Rol', 'Cantidad', 'Desperdicio', 'Precio unit.', 'Subtotal'];
    ws.getRow(rr).values = compHeaders;
    styleTableHeader(ws.getRow(rr));
    rr++;
    let calt = false;
    for (const c of [...apu.components].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const row = ws.getRow(rr);
      row.getCell(1).value = safeCell(TYPE_LABEL[c.componentType] ?? c.componentType);
      row.getCell(2).value = safeCell(componentResource(c));
      row.getCell(3).value = nq(c.quantity); row.getCell(3).numFmt = QTY_FMT;
      row.getCell(4).value = frac(c.wastePct); row.getCell(4).numFmt = PCT_FMT;
      row.getCell(5).value = n(c.unitPriceSnapshot); row.getCell(5).numFmt = MONEY_FMT;
      row.getCell(6).value = n(c.totalComponentCost); row.getCell(6).numFmt = MONEY_FMT;
      for (let cc = 1; cc <= 6; cc++) row.getCell(cc).border = thinBorder(BRAND_ARGB.border);
      if (calt) row.eachCell((cell) => { cell.fill = fill(BRAND_ARGB.bandLight); });
      calt = !calt;
      rr++;
    }
    rr++;

    // Resumen de costos por tipo.
    ws.getCell(`A${rr}`).value = 'RESUMEN DE COSTOS';
    ws.mergeCells(`A${rr}:F${rr}`);
    ws.getCell(`A${rr}`).font = { bold: true, size: 11, color: { argb: BRAND_ARGB.white } };
    ws.getCell(`A${rr}`).fill = fill(BRAND_ARGB.deepNavy);
    ws.getRow(rr).height = 18;
    rr++;
    const sum = (label: string, value: string, total = false): void => {
      ws.getCell(`A${rr}`).value = label;
      ws.mergeCells(`A${rr}:E${rr}`);
      const v = ws.getCell(`F${rr}`);
      v.value = n(value); v.numFmt = MONEY_FMT;
      if (total) {
        ws.getRow(rr).height = 20;
        ws.getCell(`A${rr}`).font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
        v.font = { bold: true, size: 12, color: { argb: BRAND_ARGB.white } };
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) ws.getCell(`${col}${rr}`).fill = fill(BRAND_ARGB.deepNavy);
      } else {
        ws.getCell(`A${rr}`).font = { color: { argb: BRAND_ARGB.graphite } };
      }
      rr++;
    };
    sum('Materiales', apu.unitCostMaterials);
    sum('Mano de obra', apu.unitCostLabor);
    sum('Equipos', apu.unitCostEquipment);
    sum('Herramienta menor (incl. derivada)', apu.unitCostTools);
    sum('Subcontratos', apu.unitCostSubcontract);
    sum('Otros', apu.unitCostOther);
    sum('TOTAL UNITARIO', apu.unitCostTotal, true);
    rr++;

    // Trazabilidad + BOQ vinculado.
    ws.getCell(`A${rr}`).value = 'TRAZABILIDAD Y BOQ VINCULADO';
    ws.mergeCells(`A${rr}:F${rr}`);
    ws.getCell(`A${rr}`).font = { bold: true, color: { argb: BRAND_ARGB.deepNavy } };
    rr++;
    ws.mergeCells(`A${rr}:F${rr}`);
    ws.getCell(`A${rr}`).value =
      'El valor presupuestado del ítem BOQ usa el snapshot de costo del momento del alta; este APU muestra su cálculo actual y puede diferir.';
    ws.getCell(`A${rr}`).font = { italic: true, size: 8, color: { argb: BRAND_ARGB.graphite } };
    ws.getRow(rr).height = 24;
    rr++;
    ws.getRow(rr).values = ['Capítulo', 'Ítem BOQ', 'Descripción del ítem', '', '', ''];
    ws.mergeCells(`C${rr}:F${rr}`);
    styleTableHeader(ws.getRow(rr));
    rr++;
    for (const link of apu.boqLinks) {
      ws.getCell(`A${rr}`).value = safeCell(link.chapterCode);
      ws.getCell(`B${rr}`).value = safeCell(link.itemCode);
      ws.mergeCells(`C${rr}:F${rr}`);
      ws.getCell(`C${rr}`).value = safeCell(link.itemDescription);
      for (const col of ['A', 'B', 'C']) ws.getCell(`${col}${rr}`).border = thinBorder(BRAND_ARGB.border);
      rr++;
    }
  });
}

/** Genera el Excel del anexo de APU vinculados (índice + hojas por APU). */
export async function generateLinkedApuExcel(selection: BudgetApuExportSelection): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date(selection.payload.generatedAt);
  addApuSheets(wb, selection);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/**
 * Genera el Excel del PAQUETE COMPLETO: hojas del presupuesto (RESUMEN,
 * PRESUPUESTO, TRAZABILIDAD) seguidas del ÍNDICE APU y las hojas por APU.
 */
export async function generatePackageExcel(selection: BudgetApuExportSelection): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date(selection.payload.generatedAt);
  addBudgetSheets(wb, selection.payload);
  addApuSheets(wb, selection);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
