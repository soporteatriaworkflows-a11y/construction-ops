/**
 * repository-roles.test.ts — Roles, validación y modo fixture (Fase 4A).
 * Mandato: tests 17 (cadencia), 18 (rol read-only no habilita), 44 (sin mutación
 * client/site) + fixture read-only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

describe('V5.4.3 - detalles de corridas', () => {
  const repo = new FixtureMonitorRepository();
  const viewer: AuthenticatedViewer = {
    userId: 'demo',
    profileId: 'demo',
    organizationId: 'org-demo',
    role: 'internal',
  };

  it('fixture cubre run exitoso, run con error, pending/changed y run sin resultados', async () => {
    const runs = await repo.listRecentRuns(viewer, 5);
    expect(runs).toHaveLength(4);
    expect(runs.some((r) => r.status === 'completed')).toBe(true);
    expect(runs.some((r) => r.status === 'failed' && r.errorSummary)).toBe(true);

    const partial = runs.find((r) => r.status === 'partial');
    expect(partial).toBeTruthy();
    const changedResults = await repo.listRunResults(viewer, partial!.id, 10);
    expect(changedResults.map((r) => r.status).sort()).toEqual(['changed', 'pending_created']);
    expect(changedResults[0]).toEqual(
      expect.objectContaining({
        runId: partial!.id,
        targetId: expect.any(String),
        resourceCode: expect.any(String),
        resourceName: expect.any(String),
        supplierName: expect.anything(),
        detectedPrice: expect.any(String),
        checkedAt: expect.any(String),
      }),
    );

    const emptyRun = runs.find((r) => r.counters.checked === 0);
    expect(emptyRun).toBeTruthy();
    await expect(repo.listRunResults(viewer, emptyRun!.id, 10)).resolves.toEqual([]);
  });

  it('respeta limite solicitado sin fabricar filas', async () => {
    const runs = await repo.listRecentRuns(viewer, 5);
    const partial = runs.find((r) => r.status === 'partial')!;
    await expect(repo.listRunResults(viewer, partial.id, 1)).resolves.toHaveLength(1);
    await expect(repo.listRunResults(viewer, 'run-inexistente', 10)).resolves.toEqual([]);
  });

  it('db repository filtra por organization_id y run_id al listar resultados', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../../server/pricing/monitor/db-repository.ts', import.meta.url)), 'utf8');
    const method = src.slice(src.indexOf('async listRunResults'), src.indexOf('async getMonitoringSummary'));
    expect(method).toContain(".from('price_monitor_results')");
    expect(method).toContain(".eq('organization_id', viewer.organizationId)");
    expect(method).toContain(".eq('run_id', runId)");
    expect(method).toContain('price_monitor_targets');
    expect(method).toContain('resources ( code, name )');
    expect(method).toContain('suppliers ( name )');
  });
});