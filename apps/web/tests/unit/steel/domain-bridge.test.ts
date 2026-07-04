import { describe, it, expect } from 'vitest';
import {
  buildAllWorkspaceLines,
  buildCutPlans,
  buildReviewItems,
  computeDashboardKpis,
  computeOffcutSavings,
  groupBarsBySpec,
} from '@/lib/steel/domain-bridge';
import { isExpired } from '@/lib/steel/format';

describe('domain-bridge (puente UIX -> @/modules/steel real)', () => {
  it('calcula las 10 líneas mock (6 refuerzo parseadas + 4 perfiles) sin lanzar', () => {
    const lines = buildAllWorkspaceLines();
    expect(lines).toHaveLength(10);
    for (const line of lines) {
      expect(Number(line.totalMl)).toBeGreaterThanOrEqual(0);
      expect(Number(line.totalKg)).toBeGreaterThanOrEqual(0);
    }
  });

  it('las líneas de refuerzo vienen del parser real (fromParser=true) y las de perfil no', () => {
    const lines = buildAllWorkspaceLines();
    const rebarLines = lines.filter((l) => l.family === 'rebar');
    const profileLines = lines.filter((l) => l.family === 'structural_steel');
    expect(rebarLines).toHaveLength(6);
    expect(profileLines).toHaveLength(4);
    expect(rebarLines.every((l) => l.fromParser)).toBe(true);
    expect(profileLines.every((l) => !l.fromParser)).toBe(true);
  });

  it('produce al menos una severidad de desperdicio ok, warning y critical (cobertura D5)', () => {
    const severities = new Set(buildAllWorkspaceLines().map((l) => l.wasteSeverity));
    expect(severities.has('ok')).toBe(true);
    expect(severities.has('warning')).toBe(true);
    expect(severities.has('critical')).toBe(true);
  });

  it('el plan de corte FFD real asigna barras y no lanza para refuerzo ni perfiles', () => {
    const { rebar, profiles } = buildCutPlans();
    expect(rebar.bars.length).toBeGreaterThan(0);
    expect(profiles.bars.length).toBeGreaterThan(0);
    expect(Number(rebar.totalWasteM)).toBeGreaterThanOrEqual(0);
    expect(Number(profiles.totalWasteM)).toBeGreaterThanOrEqual(0);
  });

  it('el centro de revisión expone confianza y explicación por cada descripción cruda', () => {
    const items = buildReviewItems();
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.confidenceScore).toBeDefined();
      expect(item.explanation.length).toBeGreaterThan(0);
    }
  });

  it('los KPIs del dashboard son números válidos y no negativos', () => {
    const kpis = computeDashboardKpis();
    expect(Number(kpis.totalKg)).toBeGreaterThan(0);
    expect(Number(kpis.totalMl)).toBeGreaterThan(0);
    expect(Number(kpis.estimatedSavingsCop)).toBeGreaterThanOrEqual(0);
    expect(kpis.criticalAlertsCount).toBeGreaterThanOrEqual(0);
    expect(kpis.warningAlertsCount).toBeGreaterThanOrEqual(0);
    expect(kpis.linesPendingReviewCount).toBeGreaterThanOrEqual(0);
    expect(kpis.draftOrdersCount).toBeGreaterThanOrEqual(0);
    expect(kpis.pendingOrExpiredPricesCount).toBeGreaterThanOrEqual(0);
  });

  it('cada ítem de revisión tiene veredicto y separa lo leído de lo calculado', () => {
    const items = buildReviewItems();
    const verdicts = new Set(items.map((i) => i.verdict));
    expect(verdicts.has('revisar')).toBe(true); // el caso @ separación siempre exige revisión
    for (const item of items) {
      expect(['ok', 'revisar', 'critico']).toContain(item.verdict);
      expect(item.sourceLabel.length).toBeGreaterThan(0);
      expect(Number(item.computedTotalMl)).toBeGreaterThanOrEqual(0);
      expect(Number(item.computedTotalKg)).toBeGreaterThanOrEqual(0);
    }
  });

  it('el ahorro por sobrantes es dimensionalmente consistente (ml suma longitudes; kg = ml × peso > 0)', () => {
    const { rebar, profiles } = buildCutPlans();
    const savings = computeOffcutSavings([rebar, profiles]);
    const expectedMl = [...rebar.offcuts, ...profiles.offcuts].reduce((acc, o) => acc + Number(o.lengthM), 0);
    expect(Number(savings.totalMl)).toBeCloseTo(expectedMl, 2);
    if (expectedMl > 0) {
      expect(Number(savings.totalKg)).toBeGreaterThan(0);
      expect(Number(savings.totalCop)).toBeGreaterThan(0);
    }
  });

  it('groupBarsBySpec particiona todas las barras del plan sin perder ninguna', () => {
    const { rebar } = buildCutPlans();
    const groups = groupBarsBySpec(rebar);
    const regrouped = groups.flatMap((g) => g.bars);
    expect(regrouped).toHaveLength(rebar.bars.length);
    for (const group of groups) {
      expect(group.specLabel.length).toBeGreaterThan(0);
      expect(group.bars.every((b) => b.steelSpecId === group.specId)).toBe(true);
    }
  });

  it('isExpired compara vigencias ISO correctamente', () => {
    expect(isExpired('2026-06-01', '2026-07-03')).toBe(true);
    expect(isExpired('2026-08-15', '2026-07-03')).toBe(false);
    expect(isExpired(undefined, '2026-07-03')).toBe(false);
  });
});
