/**
 * operational-counts.test.ts — Conteos aditivos del dashboard operativo
 * (Oleada OPERATIONAL BUDGET UX V1): versiones emitidas y observaciones de
 * precio pendientes (implementaciones fixture; aislamiento por org).
 */
import { describe, it, expect } from 'vitest';
import { FixtureEstimatesWriteRepository } from '@/server/estimates/fixture-repository';
import { FixtureObservationRepository } from '@/server/pricing/fixture-repository';
import type { ViewerContext } from '@/lib/contracts/read-model';

const DEMO_ORG = '00000000-0000-0000-0000-0000000000a1';
const OTHER_ORG = '99999999-9999-9999-9999-999999999999';

const demoViewer: ViewerContext = { organizationId: DEMO_ORG, role: 'internal' };
const crossOrgViewer: ViewerContext = { organizationId: OTHER_ORG, role: 'internal' };

const authedDemo = {
  userId: DEMO_ORG,
  profileId: DEMO_ORG,
  organizationId: DEMO_ORG,
  role: 'internal' as const,
};
const authedCross = { ...authedDemo, organizationId: OTHER_ORG };

describe('countIssuedEstimateVersions (fixture)', () => {
  const repo = new FixtureEstimatesWriteRepository();

  it('cuenta versiones issued de la org (fixture V01 draft ⇒ 0)', async () => {
    const count = await repo.countIssuedEstimateVersions(demoViewer);
    expect(count).toBe(0); // el golden master fija V01 en estado no-issued
  });

  it('cross-org ⇒ 0 (aislamiento)', async () => {
    expect(await repo.countIssuedEstimateVersions(crossOrgViewer)).toBe(0);
  });
});

describe('countPendingResourcePriceObservations (fixture)', () => {
  const repo = new FixtureObservationRepository();

  it('cuenta las observaciones pending de la org demo', async () => {
    const count = await repo.countPendingResourcePriceObservations(authedDemo);
    expect(count).toBeGreaterThan(0); // el fixture incluye al menos una pending
  });

  it('cross-org ⇒ 0 (aislamiento)', async () => {
    expect(await repo.countPendingResourcePriceObservations(authedCross)).toBe(0);
  });
});
