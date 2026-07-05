import ExcelJS from 'exceljs';
import {
  findDefaultRebarSpec,
  toDecimal,
  type SteelAlert,
  type SteelCutPlan,
  type SteelOffcut,
} from '@/modules/steel';
import { computeOffcutSavings, specDisplayLabel } from './domain-bridge';
import { MOCK_STEEL_SETTINGS, MOCK_STEEL_SPECS } from './mock-data';
import {
  buildManualCutPlan,
  buildManualOrderDraft,
  DEFAULT_COMMERCIAL_LENGTHS_M,
  effectiveCommercialLengths,
  type ManualComputedLine,
  type ManualCutPlanResult,
  type ManualOrderDraft,
  type ManualTakeoffRecord,
} from './manual-takeoff';

export const STEEL_MANUAL_EXCEL_SHEETS = [
  '00_RESUMEN',
  '01_CANTIDADES',
  'CONTROL_LECTURA',
  'EVIDENCIAS',
  '02_ALERTAS',
  '03_PLAN_CORTE',
  '04_SOBRANTES',
  '05_PEDIDO_PROVEEDOR',
  '06_CONFIGURACION',
] as const;

const NUM_FMT = '#,##0.00';
const KG_FMT = '#,##0.000';
const COP_FMT = '"$"#,##0';

// Paleta ICONIC (identidad visual de la plataforma; F7.1):
// navy #020148 · blue #005DD6 · cyan #00B8FF · dark #1B1F3E + neutros.
const ICONIC_NAVY = 'FF020148';
const ICONIC_BLUE = 'FF005DD6';
const ICONIC_CYAN = 'FF00B8FF';
const ICONIC_DARK = 'FF1B1F3E';
const HEADER_FILL = ICONIC_NAVY;
const BAND_FILL = 'FFF0F6FF'; // azul muy suave para zebra
const BORDER = 'FFC9D8F0';
// Acentos suaves para estados/confianza (legibles, no chillones).
const SOFT_GREEN = 'FFE2F5E9';
const SOFT_AMBER = 'FFFFF3D6';
const SOFT_RED = 'FFFBE2E2';

type CellValue = string | number | null | undefined | ExcelJS.CellValue;

export type ManualExcelEvidenceReadingMethod = 'manual' | 'native_text' | 'ocr' | 'unknown';

export interface ManualExcelLineEvidence {
  sourceFileName?: string;
  pageNumber?: string | number;
  sourceType?: string;
  readingMethod?: ManualExcelEvidenceReadingMethod | string;
  confidence?: string | number;
  originalFragment?: string;
  observation?: string;
  reviewStatus?: string;
}

export interface ManualExcelExportInput {
  takeoff: ManualTakeoffRecord;
  lines: readonly ManualComputedLine[];
  planResult?: ManualCutPlanResult | null;
  order?: ManualOrderDraft | null;
  generatedAt?: Date;
}

export function sanitizeExcelCellText(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

export function buildSteelManualExcelFileName(takeoff: Pick<ManualTakeoffRecord, 'id' | 'name'>): string {
  const slug = takeoff.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `steel-takeoff-${slug || takeoff.id}.xlsx`;
}

export function buildSteelManualExcelWorkbook(input: ManualExcelExportInput): ExcelJS.Workbook {
  const planResult =
    input.planResult ??
    buildManualCutPlan(input.lines, { commercialLengthsM: effectiveCommercialLengths(input.takeoff) });
  const order = input.order ?? buildManualOrderDraft(input.takeoff.name, planResult.plan);
  const generatedAt = input.generatedAt ?? new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Ops Steel Ops Preview';
  wb.created = generatedAt;
  wb.modified = generatedAt;

  addResumenSheet(wb, input.takeoff, input.lines, planResult.plan, order, generatedAt);
  addCantidadesSheet(wb, input.takeoff, input.lines);
  addControlLecturaSheet(wb, input.takeoff, input.lines, generatedAt);
  addEvidenciasSheet(wb, input.takeoff, input.lines);
  addAlertasSheet(wb, input.lines);
  addPlanCorteSheet(wb, input.lines, planResult.plan);
  addSobrantesSheet(wb, planResult.plan);
  addPedidoSheet(wb, order);
  addConfiguracionSheet(wb, input.takeoff);

  // Identidad ICONIC en las pestañas (navy para resumen, blue para datos).
  wb.worksheets.forEach((ws, index) => {
    ws.properties.tabColor = { argb: index === 0 ? ICONIC_NAVY : ICONIC_BLUE };
  });

  return wb;
}

export async function buildSteelManualExcelBuffer(input: ManualExcelExportInput): Promise<Uint8Array> {
  const wb = buildSteelManualExcelWorkbook(input);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function text(value: string | undefined | null): string {
  return sanitizeExcelCellText(value ?? '');
}

function cellText(value: string | number | undefined | null): string {
  return text(value == null ? '' : String(value));
}

function num(value: string | number | undefined | null, decimals = 2): number {
  try {
    return toDecimal(String(value ?? 0)).toDecimalPlaces(decimals).toNumber();
  } catch {
    return 0;
  }
}

function formula(formulaText: string, result: number): ExcelJS.CellValue {
  return { formula: formulaText, result };
}

type EvidenceCarrier = Partial<ManualExcelLineEvidence> & {
  evidence?: Partial<ManualExcelLineEvidence>;
  sourceFile?: string;
  page?: string | number;
  method?: string;
  fragment?: string;
  notes?: string;
};

function lineEvidence(line: ManualComputedLine): ManualExcelLineEvidence {
  const record = line.record as EvidenceCarrier;
  const direct = line as EvidenceCarrier;
  const nested = record.evidence ?? direct.evidence ?? {};
  return {
    sourceFileName: nested.sourceFileName ?? record.sourceFileName ?? direct.sourceFileName ?? record.sourceFile ?? direct.sourceFile,
    pageNumber: nested.pageNumber ?? record.pageNumber ?? direct.pageNumber ?? record.page ?? direct.page,
    sourceType: nested.sourceType ?? record.sourceType ?? direct.sourceType,
    readingMethod: nested.readingMethod ?? record.readingMethod ?? direct.readingMethod ?? record.method ?? direct.method,
    confidence: nested.confidence ?? record.confidence ?? direct.confidence,
    originalFragment: nested.originalFragment ?? record.originalFragment ?? direct.originalFragment ?? record.fragment ?? direct.fragment,
    observation: nested.observation ?? record.observation ?? direct.observation ?? record.notes ?? direct.notes,
    reviewStatus: nested.reviewStatus ?? record.reviewStatus ?? direct.reviewStatus,
  };
}

function hasEvidence(evidence: ManualExcelLineEvidence): boolean {
  return Object.values(evidence).some((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function isLowConfidence(evidence: ManualExcelLineEvidence): boolean {
  if (evidence.confidence === undefined || evidence.confidence === null || String(evidence.confidence).trim() === '') return false;
  const value = Number(String(evidence.confidence).replace(',', '.'));
  return Number.isFinite(value) && value < 0.7;
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      ...thinBorder(),
      // Acento cyan ICONIC bajo el encabezado (línea de marca).
      bottom: { style: 'medium', color: { argb: ICONIC_CYAN } },
    };
  });
  row.height = 24;
}

/** Relleno suave para celdas de estado/confianza (verde/ámbar/rojo). */
function softFill(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Colorea la celda de confianza según el valor (≥0.85 / ≥0.6 / menor). */
function styleConfidenceCell(cell: ExcelJS.Cell, confidence: string | number | undefined): void {
  if (confidence === undefined || confidence === null || String(confidence).trim() === '') return;
  const value = Number(String(confidence).replace(',', '.'));
  if (!Number.isFinite(value)) return;
  softFill(cell, value >= 0.85 ? SOFT_GREEN : value >= 0.6 ? SOFT_AMBER : SOFT_RED);
}

/** Colorea severidad/estado con acentos suaves ICONIC. */
function styleStatusCell(cell: ExcelJS.Cell, status: string | undefined): void {
  if (!status) return;
  const normalized = status.toLowerCase();
  if (/critical|conflicto|error|rechaz/.test(normalized)) softFill(cell, SOFT_RED);
  else if (/warning|needs_review|pendiente|revision|unreviewed/.test(normalized)) softFill(cell, SOFT_AMBER);
  else if (/ok|verified|aprobado|available|info/.test(normalized)) softFill(cell, SOFT_GREEN);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: BORDER } };
  return { top: side, left: side, bottom: side, right: side };
}

function finishTable(ws: ExcelJS.Worksheet, widths: readonly number[], headerRow = 1): void {
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: widths.length },
  };
  styleHeader(ws.getRow(headerRow));
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'top', wrapText: true };
      // El zebra NO pisa los acentos de confianza/estado ya aplicados.
      const alreadyFilled = Boolean((cell.fill as ExcelJS.FillPattern | undefined)?.fgColor);
      if (rowNumber % 2 === 0 && !alreadyFilled) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
      }
    });
  });
}

function addResumenSheet(
  wb: ExcelJS.Workbook,
  takeoff: ManualTakeoffRecord,
  lines: readonly ManualComputedLine[],
  plan: SteelCutPlan,
  order: ManualOrderDraft,
  generatedAt: Date,
): void {
  const ws = wb.addWorksheet('00_RESUMEN', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 26 }, { width: 30 }];
  // Banner ICONIC: navy con texto blanco y acento cyan (fila 2 vacía existente).
  ws.mergeCells('A1:C1');
  const banner = ws.getCell('A1');
  banner.value = 'ICONIC · Steel Ops — Takeoff de acero (export tecnico)';
  banner.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ICONIC_NAVY } };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const totalCritical = lines.flatMap((l) => l.alerts).filter((a) => a.severity === 'critical').length;
  const savings = computeOffcutSavings([plan]);
  const rows: [string, CellValue, string?][] = [
    ['Proyecto', text(takeoff.projectName)],
    ['Takeoff', text(takeoff.name)],
    ['Alcance', text(takeoff.scopeLabel)],
    ['Fecha export', generatedAt.toISOString().slice(0, 10)],
    ['Estado', text(takeoff.status)],
    ['Total ml', formula(totalFormula(lines.length, 'K'), sumLineValues(lines, (line) => line.calculated.totalMl)), 'm'],
    ['Total kg', formula(totalFormula(lines.length, 'L'), sumLineValues(lines, (line) => line.calculated.totalKg)), 'kg'],
    [
      'Unidades comerciales',
      formula(totalFormula(lines.length, 'M'), sumLineValues(lines, (line) => line.calculated.commercialUnitsRequired)),
      'un',
    ],
    ['Desperdicio estimado', totalWasteMl(lines), 'm'],
    ['Desperdicio optimizado', num(plan.totalWasteM), 'm'],
    ['Ahorro estimado', num(savings.totalCop, 0), 'COP mock'],
    ['Alertas criticas', totalCritical, 'conteo'],
    ['Pedido proveedor mock', text(order.name)],
  ];

  ws.addRow([]);
  ws.addRow(['Campo', 'Valor', 'Unidad/nota']);
  styleHeader(ws.getRow(3));
  rows.forEach((row) => ws.addRow(row));
  ws.getColumn(2).numFmt = NUM_FMT;
  ws.getCell('B10').numFmt = KG_FMT;
  ws.getCell('B14').numFmt = COP_FMT;
  ws.getCell('A18').value = 'Nota';
  ws.getCell('B18').value = 'Borrador para revision interna/proveedor; no reemplaza aprobacion tecnica.';
  ws.mergeCells('B18:C18');

  // Franja de acento cyan ICONIC bajo el banner (al final: las filas ya están
  // fijas y tocar A2 antes de los addRow desplazaría B10/B14/A18).
  ['A2', 'B2', 'C2'].forEach((address) => {
    ws.getCell(address).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ICONIC_CYAN } };
  });
  ws.getRow(2).height = 4;
  // Etiquetas de campo en dark ICONIC para jerarquía visual.
  for (let rowNumber = 4; rowNumber <= 16; rowNumber += 1) {
    ws.getCell(`A${rowNumber}`).font = { bold: true, color: { argb: ICONIC_DARK } };
  }
}

function totalFormula(rowCount: number, column: string): string {
  return rowCount > 0 ? `SUM('01_CANTIDADES'!${column}2:${column}${rowCount + 1})` : '0';
}

function sumLineValues(
  lines: readonly ManualComputedLine[],
  getValue: (line: ManualComputedLine) => string | number | undefined | null,
): number {
  return lines.reduce((acc, line) => acc + num(getValue(line), 6), 0);
}

function totalWasteMl(lines: readonly ManualComputedLine[]): number {
  return lines.reduce((acc, line) => acc + num(line.calculated.estimatedWasteMl), 0);
}

function addControlLecturaSheet(
  wb: ExcelJS.Workbook,
  takeoff: ManualTakeoffRecord,
  lines: readonly ManualComputedLine[],
  generatedAt: Date,
): void {
  const ws = wb.addWorksheet('CONTROL_LECTURA');
  ws.addRow(['campo', 'valor', 'nota']);
  const evidences = lines.map(lineEvidence);
  const totalWithEvidence = evidences.filter(hasEvidence).length;
  const totalLowConfidence = evidences.filter(isLowConfidence).length;
  const rows: [string, CellValue, string?][] = [
    ['Takeoff', text(takeoff.name)],
    ['Fecha export', generatedAt.toISOString().slice(0, 10)],
    ['Estado', text(takeoff.status)],
    ['Advertencia', 'Borrador para revision tecnica', 'No usar como aprobacion automatica.'],
    ['Total lineas', lines.length],
    ['Total lineas con evidencia', totalWithEvidence],
    ['Total lineas sin evidencia', lines.length - totalWithEvidence],
    ['Total lineas de baja confianza', totalLowConfidence, 'Confianza de evidencia menor a 0.70.'],
    ['Nota', 'No reemplaza aprobacion tecnica.'],
  ];
  rows.forEach((row) => ws.addRow(row));
  finishTable(ws, [34, 28, 58]);
}

function addEvidenciasSheet(wb: ExcelJS.Workbook, takeoff: ManualTakeoffRecord, lines: readonly ManualComputedLine[]): void {
  const ws = wb.addWorksheet('EVIDENCIAS');
  ws.addRow([
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
  ]);

  lines.forEach((line) => {
    const evidence = lineEvidence(line);
    const row = ws.addRow([
      text(line.record.id),
      text(takeoff.scopeLabel),
      text(line.record.originalDescription),
      cellText(evidence.sourceFileName || 'fuente no disponible'),
      cellText(evidence.pageNumber),
      cellText(evidence.sourceType),
      cellText(evidence.readingMethod ?? 'unknown'),
      cellText(evidence.confidence),
      cellText(evidence.originalFragment),
      cellText(evidence.observation),
      cellText(evidence.reviewStatus ?? line.calculated.verificationStatus ?? 'unreviewed'),
    ]);
    styleConfidenceCell(row.getCell(8), evidence.confidence);
    styleStatusCell(row.getCell(11), String(evidence.reviewStatus ?? line.calculated.verificationStatus ?? 'unreviewed'));
  });
  finishTable(ws, [18, 22, 30, 28, 10, 16, 16, 12, 46, 42, 18]);
}

function addCantidadesSheet(wb: ExcelJS.Workbook, takeoff: ManualTakeoffRecord, lines: readonly ManualComputedLine[]): void {
  const ws = wb.addWorksheet('01_CANTIDADES');
  ws.addRow([
    'elemento',
    'ubicacion',
    'descripcion original',
    'interpretacion',
    'varilla/perfil',
    'longitud corte',
    'cantidad',
    'repeticiones',
    'ml unidad',
    'kg unidad',
    'ml total',
    'kg total',
    'unidades comerciales',
    'estado revision',
    'fuente',
    'pagina',
    'tipo fuente',
    'metodo',
    'confianza',
    'observacion',
  ]);

  lines.forEach((line, index) => {
    const rowNumber = index + 2;
    const pieces = num(line.calculated.quantityPerUnit, 0);
    const repetitions = num(line.calculated.repetitions, 0);
    const cutLength = num(line.calculated.cutLengthM);
    const kgUnit = pieces * repetitions > 0 ? num(line.calculated.totalKg, 6) / (pieces * repetitions) : 0;
    const evidence = lineEvidence(line);
    const row = ws.addRow([
      text(line.record.id),
      text(takeoff.scopeLabel),
      text(line.record.originalDescription),
      text(line.parsed.explanation),
      text(line.barLabel),
      cutLength,
      pieces,
      repetitions,
      cutLength,
      kgUnit,
      formula(`F${rowNumber}*G${rowNumber}*H${rowNumber}`, num(line.calculated.totalMl)),
      formula(`J${rowNumber}*G${rowNumber}*H${rowNumber}`, num(line.calculated.totalKg, 6)),
      num(line.calculated.commercialUnitsRequired, 0),
      text(line.calculated.verificationStatus ?? 'unreviewed'),
      cellText(evidence.sourceFileName),
      cellText(evidence.pageNumber),
      cellText(evidence.sourceType),
      cellText(evidence.readingMethod),
      cellText(evidence.confidence),
      cellText(evidence.observation),
    ]);
    styleStatusCell(row.getCell(14), String(line.calculated.verificationStatus ?? 'unreviewed'));
    styleConfidenceCell(row.getCell(19), evidence.confidence);
  });
  [6, 9, 10, 11, 12].forEach((col) => {
    ws.getColumn(col).numFmt = col === 10 || col === 12 ? KG_FMT : NUM_FMT;
  });
  finishTable(ws, [16, 24, 28, 46, 14, 14, 10, 12, 12, 12, 12, 12, 18, 18, 26, 10, 14, 14, 12, 34]);
}

function addAlertasSheet(wb: ExcelJS.Workbook, lines: readonly ManualComputedLine[]): void {
  const ws = wb.addWorksheet('02_ALERTAS');
  ws.addRow(['linea', 'severidad', 'codigo', 'mensaje', 'explicacion', 'accion sugerida']);
  lines.flatMap((line) => line.alerts.map((alert) => ({ line, alert }))).forEach(({ line, alert }) => {
    const row = ws.addRow([
      text(line.record.originalDescription),
      text(alert.severity),
      text(alert.code),
      text(alert.message),
      text(alertExplanation(alert)),
      text(alertAction(alert)),
    ]);
    styleStatusCell(row.getCell(2), alert.severity);
  });
  finishTable(ws, [28, 14, 12, 48, 52, 46]);
}

function alertExplanation(alert: SteelAlert): string {
  const explanations: Partial<Record<SteelAlert['code'], string>> = {
    A1: 'La descripcion no permite una interpretacion automatica confiable.',
    A3: 'Falta referencia tecnica para calcular o agrupar el material.',
    A4: 'La linea requiere revision humana por ambiguedad o patron especial.',
    A6: 'No hay proveedor asociado en el preview local.',
    A9: 'El precio no esta aprobado para uso operativo.',
    A10: 'La cantidad o longitud calculada no es util para pedido.',
    A13: 'El desperdicio asumido supera el umbral critico configurado.',
    A17: 'La linea puede requerir ajuste de unidad o familia de acero.',
    A18: 'La linea queda fuera del flujo automatico hasta revisarla.',
  };
  return explanations[alert.code] ?? 'Alerta generada por el dominio Steel Ops F1.';
}

function alertAction(alert: SteelAlert): string {
  if (alert.severity === 'critical') return 'Corregir o confirmar antes de aprobar/pedir.';
  if (alert.severity === 'warning') return 'Revisar antes de enviar a proveedor.';
  return 'Mantener como nota de control.';
}

function addPlanCorteSheet(wb: ExcelJS.Workbook, lines: readonly ManualComputedLine[], plan: SteelCutPlan): void {
  const ws = wb.addWorksheet('03_PLAN_CORTE');
  const byCutId = new Map<string, ManualComputedLine>();
  for (const line of lines) byCutId.set(line.record.id, line);
  ws.addRow(['grupo compatible', 'material', 'longitud comercial', 'cortes asignados', 'elementos destino', 'sobrante', 'estado sobrante']);
  plan.bars.forEach((bar) => {
    const destination = [
      ...new Set(bar.assignments.map((a) => a.cutId.split('#')[0] ?? a.cutId).map((id) => byCutId.get(id)?.record.id ?? id)),
    ];
    ws.addRow([
      text(bar.steelSpecId),
      text(specDisplayLabel(bar.steelSpecId)),
      num(bar.commercialLengthM),
      text(bar.assignments.map((a) => `${a.cutId}:${a.lengthM}m`).join(' | ')),
      text(destination.join(', ')),
      num(bar.remainingLengthM),
      text(bar.offcutStatus),
    ]);
  });
  [3, 6].forEach((col) => { ws.getColumn(col).numFmt = NUM_FMT; });
  finishTable(ws, [22, 22, 18, 60, 34, 14, 18]);
}

function addSobrantesSheet(wb: ExcelJS.Workbook, plan: SteelCutPlan): void {
  const ws = wb.addWorksheet('04_SOBRANTES');
  ws.addRow(['material', 'longitud sobrante', 'peso sobrante', 'origen', 'posible destino', 'estado', 'ahorro ml', 'ahorro kg', 'ahorro COP mock']);
  plan.offcuts.forEach((offcut) => {
    const weight = offcutWeightKg(offcut);
    const price = mockPriceCopPerKg(offcut.steelSpecId);
    ws.addRow([
      text(specDisplayLabel(offcut.steelSpecId)),
      num(offcut.lengthM),
      weight,
      text(offcut.sourceCutPlanBarId),
      'Banco de sobrantes Steel Ops preview',
      text(offcut.status),
      num(offcut.lengthM),
      weight,
      formula(`H${ws.rowCount + 1}*${price}`, Math.round(weight * price)),
    ]);
  });
  [2, 3, 7, 8].forEach((col) => { ws.getColumn(col).numFmt = col === 3 || col === 8 ? KG_FMT : NUM_FMT; });
  ws.getColumn(9).numFmt = COP_FMT;
  finishTable(ws, [24, 18, 16, 18, 34, 14, 12, 12, 18]);
}

function offcutWeightKg(offcut: SteelOffcut): number {
  return num(offcut.lengthM, 6) * unitWeightKgM(offcut.steelSpecId);
}

function unitWeightKgM(steelSpecId: string): number {
  const rebar = steelSpecId.match(/^spec-rebar-(\d+)$/);
  if (rebar) return num(findDefaultRebarSpec(Number(rebar[1]))?.unitWeightKgM, 6);
  return 0;
}

function mockPriceCopPerKg(steelSpecId: string): number {
  const rebar = steelSpecId.match(/^spec-rebar-(\d+)$/);
  const reference = rebar ? `REBAR-${rebar[1]}` : steelSpecId;
  return num(MOCK_STEEL_SPECS.find((spec) => spec.reference === reference || spec.id === steelSpecId)?.priceCop ?? '4200', 0);
}

function addPedidoSheet(wb: ExcelJS.Workbook, order: ManualOrderDraft): void {
  const ws = wb.addWorksheet('05_PEDIDO_PROVEEDOR');
  ws.addRow([
    'proveedor mock',
    'material',
    'unidad',
    'cantidad varillas/piezas',
    'ml total',
    'kg total',
    'precio unitario mock',
    'subtotal mock',
    'vigencia precio',
    'estado precio',
  ]);
  order.lines.forEach((line) => {
    const rowNumber = ws.rowCount + 1;
    ws.addRow([
      text(line.supplierName),
      text(line.specLabel),
      'kg',
      num(line.commercialUnits, 0),
      num(line.totalMl),
      num(line.totalKg, 3),
      num(line.unitPriceCopPerKg, 0),
      formula(`F${rowNumber}*G${rowNumber}`, num(line.subtotalCop, 0)),
      text(line.validUntil),
      text(line.priceStatus),
    ]);
  });
  [4, 5].forEach((col) => { ws.getColumn(col).numFmt = NUM_FMT; });
  ws.getColumn(6).numFmt = KG_FMT;
  [7, 8].forEach((col) => { ws.getColumn(col).numFmt = COP_FMT; });
  finishTable(ws, [24, 28, 10, 22, 14, 14, 20, 18, 16, 16]);
}

function addConfiguracionSheet(wb: ExcelJS.Workbook, takeoff: ManualTakeoffRecord): void {
  const ws = wb.addWorksheet('06_CONFIGURACION');
  ws.addRow(['parametro', 'valor', 'nota']);
  // F7.1: las longitudes comerciales exportadas son las del TAKEOFF (editables),
  // con nota explícita de si son configuradas o el default del preview.
  const configuredLengths = effectiveCommercialLengths(takeoff);
  const isDefaultLengths =
    configuredLengths.length === DEFAULT_COMMERCIAL_LENGTHS_M.length &&
    configuredLengths.every((length, index) => length === DEFAULT_COMMERCIAL_LENGTHS_M[index]);
  const rows: [string, CellValue, string][] = [
    [
      'longitudes comerciales',
      configuredLengths.join(' / '),
      isDefaultLengths ? 'm (default del preview)' : 'm (configuradas en este takeoff)',
    ],
    ['kerf refuerzo', num(MOCK_STEEL_SETTINGS.kerfRebarM), 'm'],
    ['kerf perfiles', num(MOCK_STEEL_SETTINGS.kerfProfilesM, 3), 'm'],
    ['desperdicio warning refuerzo', num(MOCK_STEEL_SETTINGS.wasteWarningPctRebar), '%'],
    ['desperdicio critical refuerzo', num(MOCK_STEEL_SETTINGS.wasteCriticalPctRebar), '%'],
    ['desperdicio warning perfiles', num(MOCK_STEEL_SETTINGS.wasteWarningPctProfiles), '%'],
    ['desperdicio critical perfiles', num(MOCK_STEEL_SETTINGS.wasteCriticalPctProfiles), '%'],
    ['minimo sobrante util refuerzo', num(MOCK_STEEL_SETTINGS.minimumUsefulOffcutRebarM), 'm'],
    ['minimo sobrante util perfiles', num(MOCK_STEEL_SETTINGS.minimumUsefulOffcutProfilesM), 'm'],
    ['precios', 'mock V1', 'Precios de referencia mock; no reemplazan cotizacion aprobada.'],
  ];
  rows.forEach((row) => ws.addRow(row.map((cell) => (typeof cell === 'string' ? text(cell) : cell))));
  finishTable(ws, [34, 24, 58]);
}
