import { describe, it, expect } from 'vitest';
import {
  buildAllWorkspaceLines,
  buildCutPlans,
  buildReviewItems,
  computeDashboardKpis,
} from '@/lib/steel/domain-bridge';

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
    expect(kpis.criticalAlertsCount).toBeGreaterThanOrEqual(0);
    expect(kpis.warningAlertsCount).toBeGreaterThanOrEqual(0);
    expect(kpis.draftOrdersCount).toBeGreaterThanOrEqual(0);
    expect(kpis.pendingOrExpiredPricesCount).toBeGreaterThanOrEqual(0);
  });
});
