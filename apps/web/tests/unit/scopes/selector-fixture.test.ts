/**
 * selector-fixture.test.ts — Selector por `READ_MODEL_SOURCE` (sin fallback
 * silencioso) y comportamiento del repositorio fixture de alcances (4B.2).
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  getScopesWriteRepository,
  DbScopesWriteRepository,
  FixtureScopesWriteRepository,
  ScopeWriteNotSupportedError,
  ScopeNotFoundError,
} from '@/server/scopes';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const messages: string[] = [];
const logger = { info: (m: string) => messages.push(m) };

const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000010';
const DEMO_SCOPE_ID = '00000000-0000-4000-8000-000000000020';

describe('getScopesWriteRepository', () => {
  it('default (sin variable) ⇒ fixture', () => {
    expect(getScopesWriteRepository({ env: {}, logger })).toBeInstanceOf(
      FixtureScopesWriteRepository,
    );
  });

  it('db SIN DATABASE_URL ⇒ ReadModelSourceNotConfiguredError (sin fallback)', () => {
    expect(() =>
      getScopesWriteRepository({ env: { READ_MODEL_SOURCE: 'db' }, logger }),
    ).toThrow(ReadModelSourceNotConfiguredError);
  });

  it('db CON DATABASE_URL ⇒ DbScopesWriteRepository', () => {
    const repo = getScopesWriteRepository({
      env: {
        READ_MODEL_SOURCE: 'db',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      },
      logger,
    });
    expect(repo).toBeInstanceOf(DbScopesWriteRepository);
  });

  it('valor inválido ⇒ ReadModelSourceNotConfiguredError', () => {
    expect(() =>
      getScopesWriteRepository({ env: { READ_MODEL_SOURCE: 'postgres' }, logger }),
    ).toThrow(ReadModelSourceNotConfiguredError);
  });
});

describe('FixtureScopesWriteRepository', () => {
  const writer: AuthenticatedViewer = {
    userId: 'u',
    profileId: 'p',
    organizationId: DEMO_ORGANIZATION_ID,
    role: 'management',
  };
  const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
  const otherOrg: ViewerContext = { organizationId: 'otra-org', role: 'management' };

  it('insertScope ⇒ ScopeWriteNotSupportedError (solo lectura)', async () => {
    const repo = new FixtureScopesWriteRepository();
    await expect(
      repo.insertScope(writer, DEMO_PROJECT_ID, { name: 'X', scopeType: 'floor' }),
    ).rejects.toBeInstanceOf(ScopeWriteNotSupportedError);
  });

  it('listScopesByProject demo ⇒ alcances del fixture', async () => {
    const repo = new FixtureScopesWriteRepository();
    const out = await repo.listScopesByProject(reader, DEMO_PROJECT_ID);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((s) => s.id === DEMO_SCOPE_ID)).toBe(true);
  });

  it('listScopesByProject de otra org ⇒ [] (aislamiento)', async () => {
    const repo = new FixtureScopesWriteRepository();
    expect(await repo.listScopesByProject(otherOrg, DEMO_PROJECT_ID)).toEqual([]);
  });

  it('getScopeById demo ⇒ detalle', async () => {
    const repo = new FixtureScopesWriteRepository();
    const out = await repo.getScopeById(reader, DEMO_SCOPE_ID);
    expect(out.id).toBe(DEMO_SCOPE_ID);
    expect(out.projectId).toBe(DEMO_PROJECT_ID);
  });

  it('getScopeById de otra org ⇒ ScopeNotFoundError', async () => {
    const repo = new FixtureScopesWriteRepository();
    await expect(repo.getScopeById(otherOrg, DEMO_SCOPE_ID)).rejects.toBeInstanceOf(
      ScopeNotFoundError,
    );
  });

  it('getScopeById id desconocido ⇒ ScopeNotFoundError', async () => {
    const repo = new FixtureScopesWriteRepository();
    await expect(repo.getScopeById(reader, 'desconocido')).rejects.toBeInstanceOf(
      ScopeNotFoundError,
    );
  });
});
