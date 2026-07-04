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
  type ManualComputedLine,
  type ManualCutPlanResult,
  type ManualOrderDraft,
  type ManualTakeoffRecord,
} from './manual-takeoff';

export const STEEL_MANUAL_EXCEL_SHEETS = [
  '00_RESUMEN',
  '01_CANTIDADES',
  '02_ALERTAS',
  '03_PLAN_CORTE',
  '04_SOBRANTES',
  '05_PEDIDO_PROVEEDOR',
  '06_CONFIGURACION',
] as const;

const NUM_FMT = '#,##0.00';
const KG_FMT = '#,##0.000';
const COP_FMT = '"$"#,##0';
const HEADER_FILL = 'FF1F4E79';
const BAND_FILL = 'FFEAF2F8';
const BORDER = 'FFB7C9D6';

type CellValue = string | number | null | undefined | ExcelJS.CellValue;

export interface ManualExcelExportInput {
  takeoff: ManualTakeoffRecord;
  lines: readonly ManualComputedLine[];
  planResult?: ManualCutPlanResult | null;
  order?: ManualOrderDraft | null;
  generatedAt?: Date;
}

export function sanitizeExcelCellText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
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
  const planResult = input.planResult ?? buildManualCutPlan(input.lines);
  const order = input.order ?? buildManualOrderDraft(input.takeoff.name, planResult.plan);
  const generatedAt = input.generatedAt ?? new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Ops Steel Ops Preview';
  wb.created = generatedAt;
  wb.modified = generatedAt;

  addResumenSheet(wb, input.takeoff, input.lines, planResult.plan, order, generatedAt);
  addCantidadesSheet(wb, input.takeoff, input.lines);
  addAlertasSheet(wb, input.lines);
  addPlanCorteSheet(wb, input.lines, planResult.plan);
  addSobrantesSheet(wb, planResult.plan);
  addPedidoSheet(wb, order);
  addConfiguracionSheet(wb);

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

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
  row.height = 22;
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
      if (rowNumber % 2 === 0) {
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
  ws.columns = [{ width: 34 }, { width: 24 }, { width: 24 }];
  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = 'Steel Ops - Export Excel manual';
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: HEADER_FILL } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

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
  ]);

  lines.forEach((line, index) => {
    const rowNumber = index + 2;
    const pieces = num(line.calculated.quantityPerUnit, 0);
    const repetitions = num(line.calculated.repetitions, 0);
    const cutLength = num(line.calculated.cutLengthM);
    const kgUnit = pieces * repetitions > 0 ? num(line.calculated.totalKg, 6) / (pieces * repetitions) : 0;
    ws.addRow([
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
    ]);
  });
  [6, 9, 10, 11, 12].forEach((col) => {
    ws.getColumn(col).numFmt = col === 10 || col === 12 ? KG_FMT : NUM_FMT;
  });
  finishTable(ws, [16, 24, 28, 46, 14, 14, 10, 12, 12, 12, 12, 12, 18, 18]);
}

function addAlertasSheet(wb: ExcelJS.Workbook, lines: readonly ManualComputedLine[]): void {
  const ws = wb.addWorksheet('02_ALERTAS');
  ws.addRow(['linea', 'severidad', 'codigo', 'mensaje', 'explicacion', 'accion sugerida']);
  lines.flatMap((line) => line.alerts.map((alert) => ({ line, alert }))).forEach(({ line, alert }) => {
    ws.addRow([
      text(line.record.originalDescription),
      text(alert.severity),
      text(alert.code),
      text(alert.message),
      text(alertExplanation(alert)),
      text(alertAction(alert)),
    ]);
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

function addConfiguracionSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('06_CONFIGURACION');
  ws.addRow(['parametro', 'valor', 'nota']);
  const rows: [string, CellValue, string][] = [
    ['longitudes comerciales', MOCK_STEEL_SETTINGS.commercialLengthsM.join(' / '), 'm'],
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
