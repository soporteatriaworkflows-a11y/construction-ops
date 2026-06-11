/**
 * repository-roles.test.ts — Roles, validación y modo fixture (Fase 4A).
 * Mandato: tests 17 (cadencia), 18 (rol read-only no habilita), 44 (sin mutación
 * client/site) + fixture read-only.
 */
import { describe, it, expect } from 'vitest';
import { DbMonitorRepository } from '@/server/pricing/monitor/db-repository';
import { FixtureMonitorRepository } from '@/server/pricing/monitor/fixture-repository';
import { validateCreateTargetInput, isValidCadence } from '@/server/pricing/monitor/validation';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { PriceIntelligenceWriteNotSupportedError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';

const VIEWER_SITE: AuthenticatedViewer = {
  userId: 'u-site',
  profileId: 'u-site',
  organizationId: 'org-a',
  role: 'site',
};
const VIEWER_CLIENT: AuthenticatedViewer = { ...VIEWER_SITE, role: 'client' };

/** Factory que explota: prueba que el guard de rol corre ANTES de tocar DB. */
const explodingFactory = () => {
  throw new Error('NO debe tocar la base de datos');
};

const VALID_INPUT = {
  resourceId: 'res-1',
  sourceUrl: 'https://shop.example.com/p1',
  cadenceDays: 7,
};

describe('roles — mutaciones solo management/internal (mandato 18, 44)', () => {
  it('T18: rol site NO puede habilitar monitoreo', async () => {
    const repo = new DbMonitorRepository(explodingFactory as never);
    await expect(repo.createTarget(VIEWER_SITE, VALID_INPUT)).rejects.toBeInstanceOf(
      InsufficientRoleError,
    );
  });

  it('T44: rol client NO puede pausar ni cambiar cadencia', async () => {
    const repo = new DbMonitorRepository(explodingFactory as never);
    await expect(repo.setTargetEnabled(VIEWER_CLIENT, 't1', false)).rejects.toBeInstanceOf(
      InsufficientRoleError,
    );
    await expect(repo.updateTargetCadence(VIEWER_CLIENT, 't1', 7)).rejects.toBeInstanceOf(
      InsufficientRoleError,
    );
  });
});

describe('validación de targets (mandato 14, 17)', () => {
  it('T17: cadencias válidas = {1,7,15,30}', () => {
    expect(isValidCadence(1)).toBe(true);
    expect(isValidCadence(7)).toBe(true);
    expect(isValidCadence(15)).toBe(true);
    expect(isValidCadence(30)).toBe(true);
    expect(isValidCadence(3)).toBe(false);
    expect(isValidCadence(0)).toBe(false);
    expect(isValidCadence(365)).toBe(false);
  });

  it('cadencia inválida produce issue', () => {
    const issues = validateCreateTargetInput({ ...VALID_INPUT, cadenceDays: 3 });
    expect(issues.some((i) => i.field === 'cadenceDays')).toBe(true);
  });

  it('T14: URL es obligatoria y debe ser http(s)', () => {
    expect(
      validateCreateTargetInput({ ...VALID_INPUT, sourceUrl: '' }).some((i) => i.field === 'sourceUrl'),
    ).toBe(true);
    expect(
      validateCreateTargetInput({ ...VALID_INPUT, sourceUrl: 'ftp://x.com/a' }).some(
        (i) => i.field === 'sourceUrl',
      ),
    ).toBe(true);
    expect(
      validateCreateTargetInput({ ...VALID_INPUT, sourceUrl: 'no-es-url' }).some(
        (i) => i.field === 'sourceUrl',
      ),
    ).toBe(true);
    expect(validateCreateTargetInput(VALID_INPUT)).toEqual([]);
  });
});

describe('modo fixture — lectura demo, sin mutaciones', () => {
  const repo = new FixtureMonitorRepository();
  const viewer: AuthenticatedViewer = {
    userId: 'demo',
    profileId: 'demo',
    organizationId: 'org-demo',
    role: 'internal',
  };

  it('lista targets demo y resumen sin error', async () => {
    const targets = await repo.listTargets(viewer);
    expect(targets.length).toBeGreaterThan(0);
    const summary = await repo.getMonitoringSummary();
    expect(summary.monitoredCount).toBe(targets.length);
  });

  it('mutaciones bloqueadas en fixture (write-not-supported)', async () => {
    await expect(
      repo.createTarget(viewer, VALID_INPUT),
    ).rejects.toBeInstanceOf(PriceIntelligenceWriteNotSupportedError);
    await expect(repo.setTargetEnabled()).rejects.toBeInstanceOf(
      PriceIntelligenceWriteNotSupportedError,
    );
  });
});
