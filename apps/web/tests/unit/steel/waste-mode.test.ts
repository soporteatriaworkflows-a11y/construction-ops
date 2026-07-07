/**
 * waste-mode.test.ts — F8D-E: desperdicio calculado vs factor manual.
 * `calculated` = el optimizador FFD reporta el desperdicio real del plan;
 * `manual` = factor comercial editable (0–30%) aplicado a las líneas.
 * El Excel refleja la fuente. Valores inválidos se rechazan.
 */
import { describe, expect, it } from 'vitest';
import {
  buildManualCutPlan,
  computeManualLine,
  computeManualLines,
  effectiveWasteConfig,
  MAX_MANUAL_WASTE_PCT,
  TAKEOFF_WASTE_MODE_LABEL,
  validateManualWastePercentInput,
  type ManualLineRecord,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';
import { buildSteelManualExcelWorkbook } from '@/lib/steel/manual-excel-export';

function record(description: string): ManualLineRecord {
  return { id: `line-${description}`, originalDescription: description, assumedWastePct: '5' };
}

function takeoff(overrides: Partial<ManualTakeoffRecord> = {}): ManualTakeoffRecord {
  return {
    id: 'mtk-waste',
    name: 'Takeoff desperdicio',
    projectName: 'Proyecto',
    scopeLabel: 'Torre A',
    status: 'draft',
    createdAt: '2026-07-06',
    lines: [record('6#6330')],
    ...overrides,
  };
}

describe('F8D-E — validateManualWastePercentInput', () => {
  it('acepta valores razonables 0–30', () => {
    expect(validateManualWastePercentInput('0')).toMatchObject({ ok: true, pct: '0' });
    expect(validateManualWastePercentInput('7,5')).toMatchObject({ ok: true, pct: '7.5' });
    expect(validateManualWastePercentInput(String(MAX_MANUAL_WASTE_PCT))).toMatchObject({ ok: true });
  });

  it('rechaza vacío, no numérico, negativo y fuera de rango', () => {
    expect(validateManualWastePercentInput('').ok).toBe(false);
    expect(validateManualWastePercentInput('abc').ok).toBe(false);
    expect(validateManualWastePercentInput('-1').ok).toBe(false);
    expect(validateManualWastePercentInput('31').ok).toBe(false);
  });
});

describe('F8D-E — effectiveWasteConfig', () => {
  it('default: calculado por optimización', () => {
    expect(effectiveWasteConfig(takeoff())).toEqual({ mode: 'calculated' });
    expect(effectiveWasteConfig(undefined)).toEqual({ mode: 'calculated' });
  });

  it('manual válido ⇒ manual con su %', () => {
    const config = effectiveWasteConfig(takeoff({ wasteMode: 'manual', manualWastePercent: '8' }));
    expect(config).toEqual({ mode: 'manual', manualWastePercent: '8' });
  });

  it('manual con % inválido ⇒ cae a calculated (no se aplica en silencio)', () => {
    expect(effectiveWasteConfig(takeoff({ wasteMode: 'manual', manualWastePercent: '99' }))).toEqual({
      mode: 'calculated',
    });
    expect(effectiveWasteConfig(takeoff({ wasteMode: 'manual' }))).toEqual({ mode: 'calculated' });
  });
});

describe('F8D-E — factor manual aplicado a las líneas', () => {
  it('sin factor: la línea usa su % asumido y lo declara', () => {
    const line = computeManualLine(record('6#6330'));
    expect(line.wasteSource).toBe('assumed');
    expect(Number(line.wastePct)).toBeCloseTo(5, 6);
  });

  it('con factor manual: el % del takeoff reemplaza al asumido', () => {
    const line = computeManualLine(record('6#6330'), { manualWastePct: '10' });
    expect(line.wasteSource).toBe('manual');
    expect(Number(line.wastePct)).toBeCloseTo(10, 6);
  });

  it('computeManualLines propaga el factor a todas las líneas', () => {
    const lines = computeManualLines([record('6#6330'), record('4#5250')], { manualWastePct: '12' });
    expect(lines.every((line) => line.wasteSource === 'manual')).toBe(true);
    expect(lines.every((line) => Number(line.wastePct) === 12)).toBe(true);
  });
});

describe('F8D-E — calculated muestra el valor del optimizador', () => {
  it('el plan FFD reporta totalWasteM (desperdicio real del plan)', () => {
    const lines = computeManualLines([record('6#6330')]);
    const result = buildManualCutPlan(lines);
    expect(result.plan.totalWasteM).toBeDefined();
    expect(Number(result.plan.totalWasteM)).toBeGreaterThanOrEqual(0);
  });
});

describe('F8D-E — el Excel refleja la fuente del desperdicio', () => {
  it('modo calculated en 06_CONFIGURACION y notas del resumen', () => {
    const record6 = takeoff();
    const wb = buildSteelManualExcelWorkbook({
      takeoff: record6,
      lines: computeManualLines(record6.lines),
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    });
    const config = wb.getWorksheet('06_CONFIGURACION')!;
    expect(config.getCell('A3').value).toBe('fuente del desperdicio');
    expect(config.getCell('B3').value).toBe(TAKEOFF_WASTE_MODE_LABEL.calculated);
    expect(config.getCell('B4').value).toBe('no aplica');

    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(String(resumen.getCell('C12').value)).toContain('asumido por linea');
    expect(String(resumen.getCell('C13').value)).toContain('calculado por optimización');
  });

  it('modo manual indica el factor y su %', () => {
    const manualTakeoff = takeoff({ wasteMode: 'manual', manualWastePercent: '8' });
    const wb = buildSteelManualExcelWorkbook({
      takeoff: manualTakeoff,
      lines: computeManualLines(manualTakeoff.lines, { manualWastePct: '8' }),
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    });
    const config = wb.getWorksheet('06_CONFIGURACION')!;
    expect(config.getCell('B3').value).toBe(TAKEOFF_WASTE_MODE_LABEL.manual);
    expect(config.getCell('B4').value).toBe(8);

    const resumen = wb.getWorksheet('00_RESUMEN')!;
    expect(String(resumen.getCell('C12').value)).toContain('factor manual 8%');
  });
});
