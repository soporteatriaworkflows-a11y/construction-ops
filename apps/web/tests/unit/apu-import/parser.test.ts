/**
 * parser.test.ts — PARSER del importador APU (mandato 4B.2, pruebas 1–10).
 * Hojas 100% sintéticas; el workbook real jamás entra al repositorio.
 */
import { describe, expect, it } from 'vitest';
import { parseApuWorkbook } from '@/server/apu-import/parse-workbook';
import { parseApuSheet } from '@/server/apu-import/parse-apu-sheet';
import { ApuSheetNotFoundError } from '@/server/apu-import/errors';
import { buildApuImportPreview } from '@/server/apu-import/preview';
import { deriveSalaryRole } from '@/server/apu-import/salary';
import {
  activitiesHeaderCells,
  gridFromCells,
  salaryBlockCells,
  standardActivityCells,
  syntheticSheet,
  workbookFile,
  type CellSpec,
} from './helpers';

async function fileToSheet(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseApuWorkbook(buffer, file.name);
}

describe('apu-import parser (1–10)', () => {
  // (1) detecta hoja APU.
  it('1. detecta la hoja APU por nombre (normalizado) e ignora otras hojas', async () => {
    const file = workbookFile([
      { name: 'RESUMEN', cells: [[1, 'A', 'otro contenido']] },
      { name: 'APU', cells: [...activitiesHeaderCells(1), ...standardActivityCells(2)] },
    ]);
    const sheet = await fileToSheet(file);
    expect(sheet.sheetName).toBe('APU');
    expect(sheet.digest).toMatch(/^[0-9a-f]{64}$/);

    const sinApu = workbookFile([{ name: 'RESUMEN', cells: [[1, 'A', 'x']] }]);
    const buffer = Buffer.from(await sinApu.arrayBuffer());
    expect(() => parseApuWorkbook(buffer, sinApu.name)).toThrow(ApuSheetNotFoundError);
  });

  // (2) detecta actividad.
  it('2. detecta el bloque de actividad (código visible, descripción, unidad)', () => {
    const { grid, lastRow } = syntheticSheet();
    const parsed = parseApuSheet(grid, lastRow);
    expect(parsed.errors).toEqual([]);
    expect(parsed.activities).toHaveLength(1);
    const activity = parsed.activities[0]!;
    expect(activity.visibleCode).toBe('P-01');
    expect(activity.description).toBe('Demolición de muro sintético');
    expect(activity.rawUnit).toBe('M2');
    expect(activity.excelTotal).toBe('12478.47');
  });

  // (3) detecta componentes (tipos material/labor; herramienta derivada aparte).
  it('3. detecta filas de componentes con tipo, cantidad, desperdicio y precio', () => {
    const { grid, lastRow } = syntheticSheet();
    const activity = parseApuSheet(grid, lastRow).activities[0]!;
    expect(activity.components).toHaveLength(2); // la herramienta derivada NO es fila
    const [material, labor] = activity.components;
    expect(material!.kind).toBe('material');
    expect(material!.quantity).toBe('0.1');
    expect(material!.wastePct).toBe('0.1');
    expect(material!.unitPrice).toBe('31827');
    expect(labor!.kind).toBe('labor');
    expect(labor!.crew).toEqual([
      { role: 'ayudante', count: 2 },
      { role: 'oficial', count: 1 },
    ]);
  });

  // (4) preserva source row.
  it('4. preserva la fila de origen de actividad y componentes', () => {
    const { grid, lastRow } = syntheticSheet();
    const activity = parseApuSheet(grid, lastRow).activities[0]!;
    expect(activity.sourceRow).toBe(26);
    expect(activity.components.map((c) => c.sourceRow)).toEqual([27, 28]);
  });

  // (5) preserva raw unit (y raw code).
  it('5. preserva la unidad raw y el código raw del componente', () => {
    const { grid, lastRow } = syntheticSheet();
    const activity = parseApuSheet(grid, lastRow).activities[0]!;
    const material = activity.components[0]!;
    expect(material.rawUnit).toBe('Un');
    expect(material.rawCode).toBe('Insumo');
    expect(activity.rawUnit).toBe('M2');
  });

  // (6) no ejecuta macros / no evalúa fórmulas.
  it('6. usa el valor CACHEADO y nunca evalúa la fórmula del workbook', async () => {
    // Celda con fórmula cuyo resultado real sería 999999, pero caché = 31827:
    // si algo "ejecutara" la fórmula, el valor cambiaría.
    const cells: CellSpec[] = [
      ...activitiesHeaderCells(1),
      ...standardActivityCells(2),
    ];
    const file = workbookFile([{ name: 'APU', cells }]);
    const sheet = await fileToSheet(file);
    const parsed = parseApuSheet(sheet.grid, sheet.lastRow);
    const material = parsed.activities[0]!.components[0]!;
    expect(material.unitPrice).toBe('31827'); // caché, no '999999' ni evaluación
    // La fórmula queda como metadato estructural y NO aparece en valores.
    expect(material.description).not.toContain('LISTADO');
  });

  // (7) no confía en subtotal Excel.
  it('7. el subtotal del Excel es evidencia: una diferencia produce advertencia y el recálculo manda', () => {
    // G del material manipulado a 9999 (≠ 3500.97 recalculado).
    const cells = [...salaryBlockCells(), ...activitiesHeaderCells(25), ...standardActivityCells(26)];
    const tampered = cells.map((c) =>
      c[0] === 27 && c[1] === 'G' ? ([27, 'G', 9999] as CellSpec) : c,
    );
    const { grid, lastRow } = gridFromCells(tampered);
    const { preview } = buildApuImportPreview({
      fileName: 'x.xlsx',
      sheetName: 'APU',
      digest: 'd'.repeat(64),
      parsed: parseApuSheet(grid, lastRow),
      identifiers: [],
      existingLaborRoles: [],
      existingApuCodes: new Set(),
      baselinePrices: new Map(),
      linkVersionId: null,
      boqCandidates: null,
    });
    const component = preview.activities[0]!.components[0]!;
    expect(component.excelSubtotal).toBe('9999');
    expect(component.recalculatedSubtotal).toBe('3500.97');
    expect(component.warnings.some((w) => w.includes('difiere del Excel'))).toBe(true);
  });

  // (8) recalcula con Decimal.
  it('8. recalcula subtotales y total con Decimal (sin float)', () => {
    const { grid, lastRow } = syntheticSheet();
    const { preview } = buildApuImportPreview({
      fileName: 'x.xlsx',
      sheetName: 'APU',
      digest: 'd'.repeat(64),
      parsed: parseApuSheet(grid, lastRow),
      identifiers: [],
      existingLaborRoles: [],
      existingApuCodes: new Set(),
      baselinePrices: new Map(),
      linkVersionId: null,
      boqCandidates: null,
    });
    const activity = preview.activities[0]!;
    // 0.1×1.1×31827 = 3500.97 EXACTO (en float sería 3500.9700000000003).
    expect(activity.components[0]!.recalculatedSubtotal).toBe('3500.97');
    // Total = 3500.97 + 6650 + 35%×6650 = 12478.47 EXACTO.
    expect(activity.recalculatedTotal).toBe('12478.47');
    expect(activity.costDelta).toBe('0');
  });

  // (9) canonicaliza unidades.
  it('9. canonicaliza unidades reutilizando canonicalizeUnit (M2 ≡ m²) y preserva el raw', () => {
    const { grid, lastRow } = syntheticSheet();
    const { preview } = buildApuImportPreview({
      fileName: 'x.xlsx',
      sheetName: 'APU',
      digest: 'd'.repeat(64),
      parsed: parseApuSheet(grid, lastRow),
      identifiers: [],
      existingLaborRoles: [],
      existingApuCodes: new Set(),
      baselinePrices: new Map(),
      linkVersionId: null,
      boqCandidates: null,
    });
    const activity = preview.activities[0]!;
    expect(activity.rawUnit).toBe('M2');
    expect(activity.unitCanonical).toBe('m²');
  });

  // (10) código visible repetido recibe occurrence index.
  it('10. códigos visibles repetidos reciben occurrence index e identidad interna estable', () => {
    const { grid, lastRow } = syntheticSheet([
      ...standardActivityCells(40, { code: 'P-01', description: 'Otra actividad distinta' }),
      ...standardActivityCells(50, { code: 'P-02', description: 'Tercera actividad' }),
    ]);
    const parsed = parseApuSheet(grid, lastRow);
    expect(parsed.activities.map((a) => `${a.visibleCode}#${a.occurrenceIndex}`)).toEqual([
      'P-01#1',
      'P-01#2',
      'P-02#1',
    ]);
  });

  it('bloque salarial: deriva factores y reproduce el costo hora del Excel', () => {
    const { grid, lastRow } = syntheticSheet();
    const parsed = parseApuSheet(grid, lastRow);
    const ayudante = parsed.salaryRoles.find((b) => b.role === 'ayudante')!;
    const oficial = parsed.salaryRoles.find((b) => b.role === 'oficial')!;
    expect(ayudante.derived.hourlyRecalculated).toBe('10250');
    expect(oficial.derived.hourlyRecalculated).toBe('12750');
    expect(ayudante.derived.warnings).toEqual([]);
  });

  it('bloque salarial incompleto: reporta y NO deriva factores', () => {
    const derived = deriveSalaryRole({
      smlv: 1000000,
      factor: 1.5,
      transport: null,
      benefitsPct: 0.2,
      socialSecurityPct: 0.1,
      payrollTaxPct: 0.05,
      uniformCost: 300000,
      uniformPeriodInverse: 1 / 3,
      workingDaysMonth: 25,
      workingHoursDay: 8,
      hourlyExcel: 10250,
    });
    expect(derived.factors).toBeNull();
    expect(derived.warnings[0]).toContain('Bloque salarial incompleto');
  });

  it('actividad sin TOTAL COSTO ACTIVIDAD queda en error (no importable)', () => {
    const cells: CellSpec[] = [
      ...activitiesHeaderCells(1),
      [2, 'A', 'P-09'], [2, 'B', 'Sin total'], [2, 'C', 'M2'],
      [3, 'A', 'Insumo'], [3, 'B', 'Material X'], [3, 'C', 'Un'], [3, 'D', 1], [3, 'E', 0], [3, 'F', 100],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const parsed = parseApuSheet(grid, lastRow);
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0]!.errors.some((e) => e.includes('TOTAL COSTO ACTIVIDAD'))).toBe(true);
  });
});
