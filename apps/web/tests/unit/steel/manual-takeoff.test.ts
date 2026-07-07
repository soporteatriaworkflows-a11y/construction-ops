import { describe, it, expect } from 'vitest';
import {
  buildManualCutPlan,
  buildManualExportCsv,
  buildManualOrderDraft,
  canEditManualLines,
  canTransitionManualTakeoff,
  computeManualLine,
  computeManualLines,
  computeManualTotals,
  isManualTakeoffId,
  MANUAL_TAKEOFF_STATUS_TRANSITIONS,
  newManualTakeoffId,
  sanitizeCsvCell,
  type ManualLineRecord,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';

function line(overrides: Partial<ManualLineRecord> & Pick<ManualLineRecord, 'id' | 'originalDescription'>): ManualLineRecord {
  return { assumedWastePct: '5', ...overrides };
}

describe('manual-takeoff (motor puro F3 sobre dominio F1)', () => {
  it('interpreta y calcula los 6 casos de notación pedidos con el parser/calculadora reales', () => {
    const l1 = computeManualLine(line({ id: 'l1', originalDescription: '5#5600' }));
    expect(l1.barNumber).toBe(5);
    expect(Number(l1.calculated.cutLengthM)).toBeCloseTo(6, 6);
    expect(Number(l1.totalPieces)).toBe(5);
    expect(Number(l1.calculated.totalMl)).toBeCloseTo(30, 6);
    expect(Number(l1.calculated.totalKg)).toBeCloseTo(30 * 1.552, 4);
    expect(l1.cutPlanEligible).toBe(true);

    const l2 = computeManualLine(line({ id: 'l2', originalDescription: '74E#3200' }));
    expect(l2.barNumber).toBe(3);
    expect(l2.parsed.steelShape).toBe('stirrup');
    expect(Number(l2.calculated.totalMl)).toBeCloseTo(148, 6);

    const l3 = computeManualLine(line({ id: 'l3', originalDescription: '2X65E#3182' }));
    expect(Number(l3.totalPieces)).toBe(130);
    expect(Number(l3.calculated.cutLengthM)).toBeCloseTo(1.82, 6);
    expect(Number(l3.calculated.totalMl)).toBeCloseTo(236.6, 4);

    const l4 = computeManualLine(line({ id: 'l4', originalDescription: '10#7205 @ 15CM' }));
    expect(l4.barNumber).toBe(7);
    expect(l4.parsed.needsReview).toBe(true);
    expect(l4.parsed.spacingCm).toBe('15');
    expect(l4.calculated.verificationStatus).toBe('needs_review');
    expect(l4.alerts.some((a) => a.code === 'A4')).toBe(true);

    const l5 = computeManualLine(line({ id: 'l5', originalDescription: '#4 L=0.62' }));
    expect(l5.barNumber).toBe(4);
    expect(Number(l5.calculated.cutLengthM)).toBeCloseTo(0.62, 6);
    expect(l5.parsed.needsReview).toBe(false);

    const l6 = computeManualLine(line({ id: 'l6', originalDescription: '15 + 35 + 15' }));
    expect(Number(l6.calculated.cutLengthM)).toBeCloseTo(0.65, 6);
    expect(l6.barNumber).toBeUndefined();
    expect(l6.cutPlanEligible).toBe(false);
    expect(l6.cutPlanExclusionReason).toContain('varilla');
  });

  it('el doblez segmentado con varilla asignada a mano calcula peso y es elegible', () => {
    const l = computeManualLine(line({ id: 'l6b', originalDescription: '15 + 35 + 15', manualBarNumber: 3 }));
    expect(l.barNumber).toBe(3);
    expect(Number(l.calculated.totalKg)).toBeCloseTo(0.65 * 0.56, 4);
    expect(l.cutPlanEligible).toBe(true);
  });

  it('una descripción no reconocida queda como crítica: sin cálculo y fuera del plan', () => {
    const l = computeManualLine(line({ id: 'lx', originalDescription: 'texto libre sin notación' }));
    expect(l.parsed.steelFamily).toBe('other');
    expect(l.parsed.confidenceScore).toBe('0');
    expect(Number(l.calculated.totalMl)).toBe(0);
    expect(l.cutPlanEligible).toBe(false);
    expect(l.cutPlanExclusionReason).toContain('parser');
  });

  it('el desperdicio asumido se refleja en wastePct y clasifica severidad D5', () => {
    const ok = computeManualLine(line({ id: 'w1', originalDescription: '5#5600', assumedWastePct: '5' }));
    const warning = computeManualLine(line({ id: 'w2', originalDescription: '5#5600', assumedWastePct: '9' }));
    const critical = computeManualLine(line({ id: 'w3', originalDescription: '5#5600', assumedWastePct: '13' }));
    expect(Number(ok.wastePct)).toBeCloseTo(5, 6);
    expect(ok.wasteSeverity).toBe('ok');
    expect(warning.wasteSeverity).toBe('warning');
    expect(critical.wasteSeverity).toBe('critical');
    expect(critical.alerts.some((a) => a.code === 'A13' && a.severity === 'critical')).toBe(true);
  });

  it('computeManualTotals agrega ml/kg/unidades/desperdicio/alertas de todas las líneas', () => {
    const lines = computeManualLines([
      line({ id: 't1', originalDescription: '5#5600', assumedWastePct: '10' }),
      line({ id: 't2', originalDescription: '74E#3200', assumedWastePct: '0' }),
      line({ id: 't3', originalDescription: '10#7205 @ 15CM' }),
    ]);
    const totals = computeManualTotals(lines);
    expect(Number(totals.totalMl)).toBeCloseTo(30 + 148 + 20.5, 4);
    expect(Number(totals.totalKg)).toBeGreaterThan(0);
    expect(Number(totals.totalCommercialUnits)).toBeGreaterThan(0);
    expect(Number(totals.estimatedWasteMl)).toBeCloseTo(3 + 0 + 20.5 * 0.05, 4);
    expect(totals.linesNeedingReview).toBe(1);
    expect(totals.warningAlerts).toBeGreaterThan(0);
  });

  it('las transiciones de estado siguen draft → in_review → approved → locked (locked terminal)', () => {
    expect(canTransitionManualTakeoff('draft', 'in_review')).toBe(true);
    expect(canTransitionManualTakeoff('draft', 'approved')).toBe(false);
    expect(canTransitionManualTakeoff('draft', 'locked')).toBe(false);
    expect(canTransitionManualTakeoff('in_review', 'approved')).toBe(true);
    expect(canTransitionManualTakeoff('in_review', 'draft')).toBe(true);
    expect(canTransitionManualTakeoff('approved', 'locked')).toBe(true);
    expect(canTransitionManualTakeoff('approved', 'in_review')).toBe(true);
    expect(MANUAL_TAKEOFF_STATUS_TRANSITIONS.locked).toHaveLength(0);

    expect(canEditManualLines('draft')).toBe(true);
    expect(canEditManualLines('in_review')).toBe(true);
    expect(canEditManualLines('approved')).toBe(false);
    expect(canEditManualLines('locked')).toBe(false);
  });

  it('buildManualCutPlan separa elegibles de excluidas con razón y corre el FFD real', () => {
    const lines = computeManualLines([
      line({ id: 'c1', originalDescription: '5#5600' }),
      line({ id: 'c2', originalDescription: '74E#3200' }),
      line({ id: 'c3', originalDescription: '15 + 35 + 15' }), // sin varilla → excluida
      line({ id: 'c4', originalDescription: 'texto libre' }), // parser falla → excluida
    ]);
    const result = buildManualCutPlan(lines);
    expect(result.includedLineIds).toEqual(['c1', 'c2']);
    expect(result.excluded).toHaveLength(2);
    expect(result.excluded.every((e) => e.reason.length > 0)).toBe(true);
    expect(result.plan.bars.length).toBeGreaterThan(0);
    expect(result.plan.rejectedCuts).toHaveLength(0);
    // Todas las asignaciones pertenecen a specs sintéticas por varilla.
    expect(result.plan.bars.every((b) => b.steelSpecId.startsWith('spec-rebar-'))).toBe(true);
  });

  it('buildManualOrderDraft agrupa por varilla × longitud comercial con kg/ml/unidades/precio mock', () => {
    const lines = computeManualLines([
      line({ id: 'o1', originalDescription: '5#5600' }), // 5 cortes de 6 m → 5 barras #5 de 6 m
      line({ id: 'o2', originalDescription: '74E#3200' }), // 74 cortes de 2 m → 25 barras #3 de 6 m
    ]);
    const { plan } = buildManualCutPlan(lines);
    const order = buildManualOrderDraft('Prueba', plan);

    expect(order.status).toBe('draft');
    expect(order.lines).toHaveLength(2);
    const rebar3 = order.lines[0]!;
    const rebar5 = order.lines[1]!;
    expect(rebar3.specLabel).toContain('#3');
    expect(Number(rebar3.commercialUnits)).toBe(25);
    expect(Number(rebar3.totalMl)).toBeCloseTo(150, 4);
    expect(Number(rebar3.totalKg)).toBeCloseTo(150 * 0.56, 1);
    expect(rebar3.priceStatus).toBe('aprobado');
    expect(rebar3.subtotalCop).toBeDefined();

    expect(rebar5.specLabel).toContain('#5');
    expect(Number(rebar5.commercialUnits)).toBe(5);
    expect(rebar5.priceStatus).toBe('vencido');

    expect(Number(order.totalUnits)).toBe(30);
    expect(Number(order.totalMl)).toBeCloseTo(180, 4);
    expect(order.linesWithoutApprovedPrice).toBe(1);
    expect(Number(order.totalEstimatedCop)).toBeGreaterThan(0);
  });

  it('sanitizeCsvCell neutraliza formula injection y escapa comas/comillas', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeCsvCell('+57')).toBe("'+57");
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCsvCell('a,b')).toBe('"a,b"');
    expect(sanitizeCsvCell('di"jo')).toBe('"di""jo"');
    expect(sanitizeCsvCell('5#5600')).toBe('5#5600');
  });

  it('buildManualExportCsv incluye resumen, líneas y pedido, con celdas sanitizadas', () => {
    const takeoff: ManualTakeoffRecord = {
      id: 'mtk-test',
      name: 'Takeoff CSV',
      projectName: 'Proyecto Alfa',
      scopeLabel: 'Torre A',
      status: 'draft',
      createdAt: '2026-07-03',
      lines: [],
    };
    const lines = computeManualLines([
      line({ id: 'e1', originalDescription: '5#5600' }),
      line({ id: 'e2', originalDescription: '=2+2' }), // no parseable + intento de fórmula
    ]);
    const { plan } = buildManualCutPlan(lines);
    const order = buildManualOrderDraft(takeoff.name, plan);
    const csv = buildManualExportCsv(takeoff, lines, order);

    expect(csv).toContain('Takeoff,Takeoff CSV');
    expect(csv).toContain('Descripción original');
    expect(csv).toContain('5#5600');
    expect(csv).toContain("'=2+2"); // fórmula neutralizada
    expect(csv).toContain('Pedido acero (referencia) — Takeoff CSV');
    expect(csv).toContain('Long. comercial (m)');
  });

  it('los ids manuales llevan prefijo mtk- y se reconocen', () => {
    const id = newManualTakeoffId(() => 1234567, () => 0.5);
    expect(isManualTakeoffId(id)).toBe(true);
    expect(isManualTakeoffId('to-1')).toBe(false);
  });
});
