/**
 * validation-selector.test.ts — Validación pura, selector sin fallback y
 * repositorio fixture de presupuestos (4B.3). Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCreateEstimateInput,
  slugifyEstimateCode,
  buildEstimateCodeCandidate,
  NAME_MAX,
  DESCRIPTION_MAX,
} from '@/server/estimates/validation';
import {
  getEstimatesWriteRepository,
  DbEstimatesWriteRepository,
  FixtureEstimatesWriteRepository,
  EstimateValidationError,
  EstimateWriteNotSupportedError,
  EstimateNotFoundError,
} from '@/server/estimates';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const logger = { info: () => {} };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const DEMO_SCOPE_ID = '00000000-0000-4000-8000-000000000021';

describe('validateCreateEstimateInput', () => {
  it('normaliza (trim + description null si vacía)', () => {
    expect(validateCreateEstimateInput({ name: '  Base ' })).toEqual({
      name: 'Base',
      description: null,
    });
  });
  it('nombre vacío ⇒ error', () => {
    expect(() => validateCreateEstimateInput({ name: '  ' })).toThrow(EstimateValidationError);
  });
  it('nombre/descr demasiado largos ⇒ error', () => {
    expect(() => validateCreateEstimateInput({ name: 'a'.repeat(NAME_MAX + 1) })).toThrow(
      EstimateValidationError,
    );
    expect(() =>
      validateCreateEstimateInput({ name: 'X', description: 'a'.repeat(DESCRIPTION_MAX + 1) }),
    ).toThrow(EstimateValidationError);
  });
  it('slug + candidatos', () => {
    expect(slugifyEstimateCode('Presupuesto Báse')).toBe('presupuesto-base');
    expect(slugifyEstimateCode('  --  ')).toBe('presupuesto');
    expect(buildEstimateCodeCandidate('b', 0)).toBe('b');
    expect(buildEstimateCodeCandidate('b', 1)).toBe('b-2');
  });
});

describe('getEstimatesWriteRepository', () => {
  it('default ⇒ fixture', () => {
    expect(getEstimatesWriteRepository({ env: {}, logger })).toBeInstanceOf(
      FixtureEstimatesWriteRepository,
    );
  });
  it('db SIN DATABASE_URL ⇒ error (sin fallback)', () => {
    expect(() => getEstimatesWriteRepository({ env: { READ_MODEL_SOURCE: 'db' }, logger })).toThrow(
      ReadModelSourceNotConfiguredError,
    );
  });
  it('db CON DATABASE_URL ⇒ DbEstimatesWriteRepository', () => {
    expect(
      getEstimatesWriteRepository({
        env: { READ_MODEL_SOURCE: 'db', DATABASE_URL: 'postgresql://x' },
        logger,
      }),
    ).toBeInstanceOf(DbEstimatesWriteRepository);
  });
});

describe('FixtureEstimatesWriteRepository', () => {
  const writer: AuthenticatedViewer = {
    userId: 'u',
    profileId: 'p',
    organizationId: DEMO_ORGANIZATION_ID,
    role: 'management',
  };
  const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
  const otherOrg: ViewerContext = { organizationId: 'otra', role: 'management' };

  it('insert ⇒ EstimateWriteNotSupportedError (solo lectura)', async () => {
    const repo = new FixtureEstimatesWriteRepository();
    await expect(
      repo.insertEstimateWithInitialVersion(writer, DEMO_SCOPE_ID, { name: 'X' }),
    ).rejects.toBeInstanceOf(EstimateWriteNotSupportedError);
  });

  it('listVisibleEstimates demo ⇒ el presupuesto del golden master', async () => {
    const repo = new FixtureEstimatesWriteRepository();
    const out = await repo.listVisibleEstimates(reader);
    expect(out.some((e) => e.id === DEMO_ESTIMATE_ID)).toBe(true);
  });

  it('listVisibleEstimates de otra org ⇒ [] (aislamiento)', async () => {
    const repo = new FixtureEstimatesWriteRepository();
    expect(await repo.listVisibleEstimates(otherOrg)).toEqual([]);
  });

  it('getEstimateById demo ⇒ V01 activa con conteos del golden master', async () => {
    const repo = new FixtureEstimatesWriteRepository();
    const out = await repo.getEstimateById(reader, DEMO_ESTIMATE_ID);
    expect(out.activeVersion?.versionNumber).toBe(1);
    expect(out.activeVersion!.chapterCount).toBeGreaterThan(0);
    expect(out.activeVersion!.itemCount).toBeGreaterThan(0);
  });

  it('getEstimateById cross-org ⇒ EstimateNotFoundError', async () => {
    const repo = new FixtureEstimatesWriteRepository();
    await expect(repo.getEstimateById(otherOrg, DEMO_ESTIMATE_ID)).rejects.toBeInstanceOf(
      EstimateNotFoundError,
    );
  });
});
