/**
 * selector.test.ts — `getProjectsWriteRepository` elige la implementación por
 * `READ_MODEL_SOURCE` y NO hace fallback silencioso db→fixture. Incluye el
 * comportamiento del repositorio fixture (escritura no aplica; getById demo).
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  getProjectsWriteRepository,
  DbProjectsWriteRepository,
  FixtureProjectsWriteRepository,
  ProjectWriteNotSupportedError,
  ProjectNotFoundError,
} from '@/server/projects';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const messages: string[] = [];
const logger = { info: (m: string) => messages.push(m) };

describe('getProjectsWriteRepository', () => {
  it('default (sin variable) ⇒ fixture', () => {
    const repo = getProjectsWriteRepository({ env: {}, logger });
    expect(repo).toBeInstanceOf(FixtureProjectsWriteRepository);
  });

  it('fixture ⇒ FixtureProjectsWriteRepository y loguea el modo', () => {
    const repo = getProjectsWriteRepository({ env: { READ_MODEL_SOURCE: 'fixture' }, logger });
    expect(repo).toBeInstanceOf(FixtureProjectsWriteRepository);
    expect(messages.some((m) => m.includes('fixture'))).toBe(true);
  });

  it('db SIN DATABASE_URL ⇒ ReadModelSourceNotConfiguredError (sin fallback)', () => {
    expect(() =>
      getProjectsWriteRepository({ env: { READ_MODEL_SOURCE: 'db' }, logger }),
    ).toThrow(ReadModelSourceNotConfiguredError);
  });

  it('db CON DATABASE_URL ⇒ DbProjectsWriteRepository', () => {
    const repo = getProjectsWriteRepository({
      env: {
        READ_MODEL_SOURCE: 'db',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      },
      logger,
    });
    expect(repo).toBeInstanceOf(DbProjectsWriteRepository);
  });

  it('valor inválido ⇒ ReadModelSourceNotConfiguredError', () => {
    expect(() =>
      getProjectsWriteRepository({ env: { READ_MODEL_SOURCE: 'postgres' }, logger }),
    ).toThrow(ReadModelSourceNotConfiguredError);
  });
});

describe('FixtureProjectsWriteRepository', () => {
  const viewer: AuthenticatedViewer = {
    userId: 'u',
    profileId: 'p',
    organizationId: DEMO_ORGANIZATION_ID,
    role: 'management',
  };
  const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };

  it('createProject ⇒ ProjectWriteNotSupportedError', async () => {
    const repo = new FixtureProjectsWriteRepository();
    await expect(
      repo.createProject(viewer, { name: 'X', city: 'Y' }),
    ).rejects.toBeInstanceOf(ProjectWriteNotSupportedError);
  });

  it('getProjectById demo ⇒ ProjectDetailView del fixture', async () => {
    const repo = new FixtureProjectsWriteRepository();
    const out = await repo.getProjectById(reader, '00000000-0000-4000-8000-000000000010');
    expect(out.name).toBe('Proyecto Entre Patios');
    expect(out.city).toBe('Ciudad Demo');
    expect(out.status).toBe('active');
  });

  it('getProjectById de otra org ⇒ ProjectNotFoundError', async () => {
    const repo = new FixtureProjectsWriteRepository();
    await expect(
      repo.getProjectById(
        { organizationId: 'otra-org', role: 'management' },
        '00000000-0000-4000-8000-000000000010',
      ),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('getProjectById id desconocido ⇒ ProjectNotFoundError', async () => {
    const repo = new FixtureProjectsWriteRepository();
    await expect(repo.getProjectById(reader, 'desconocido')).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });
});
