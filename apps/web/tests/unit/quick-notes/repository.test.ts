/**
 * repository.test.ts — DbQuickNotesRepository + FixtureQuickNotesRepository (V5.4.2b).
 *
 * El DB repo usa un fake del cliente Supabase (chainable) que captura llamadas y
 * devuelve un resultado configurado. El aislamiento cross-org REAL lo garantiza RLS
 * (verificado en Cloud 31/31); aquí se comprueba que el repo SIEMPRE acota por
 * `organization_id` del viewer y por `status='active'`, y que el guard corre ANTES de
 * tocar la DB.
 */
import { describe, it, expect } from 'vitest';
import { DbQuickNotesRepository } from '@/server/quick-notes/db-repository';
import { FixtureQuickNotesRepository } from '@/server/quick-notes/fixture-repository';
import {
  QuickNoteInsufficientRoleError,
  QuickNoteNotFoundError,
  QuickNoteValidationError,
  QuickNoteWriteNotSupportedError,
} from '@/server/quick-notes';
import type { AuthenticatedViewer } from '@/server/auth/types';

const VIEWER_INTERNAL: AuthenticatedViewer = {
  userId: 'u1',
  profileId: 'p1',
  organizationId: 'org-a',
  role: 'internal',
};
const VIEWER_MGMT: AuthenticatedViewer = { ...VIEWER_INTERNAL, role: 'management' };
const VIEWER_SITE: AuthenticatedViewer = { ...VIEWER_INTERNAL, role: 'site' };
const VIEWER_CLIENT: AuthenticatedViewer = { ...VIEWER_INTERNAL, role: 'client' };

interface Call {
  method: string;
  args: unknown[];
}

/** Builder chainable que imita el query builder de supabase-js. */
class FakeQuery {
  readonly calls: Call[] = [];
  constructor(private readonly result: { data: unknown; error: unknown }) {}
  private rec(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...a: unknown[]) { return this.rec('select', a); }
  eq(...a: unknown[]) { return this.rec('eq', a); }
  order(...a: unknown[]) { return this.rec('order', a); }
  limit(...a: unknown[]) { return this.rec('limit', a); }
  insert(...a: unknown[]) { return this.rec('insert', a); }
  update(...a: unknown[]) { return this.rec('update', a); }
  single() { this.rec('single', []); return Promise.resolve(this.result); }
  maybeSingle() { this.rec('maybeSingle', []); return Promise.resolve(this.result); }
  // thenable: para `await query` en listados (sin single/maybeSingle).
  then<T>(onF: (v: { data: unknown; error: unknown }) => T) { return Promise.resolve(this.result).then(onF); }
}

class FakeSupabase {
  lastQuery: FakeQuery | null = null;
  lastTable: string | null = null;
  constructor(private readonly result: { data: unknown; error: unknown }) {}
  from(table: string) {
    this.lastTable = table;
    this.lastQuery = new FakeQuery(this.result);
    return this.lastQuery;
  }
}

function factoryOf(result: { data: unknown; error: unknown }) {
  const fake = new FakeSupabase(result);
  const factory = async () => fake as never;
  return { fake, factory };
}

/** Factory que explota: prueba que el guard corre ANTES de tocar la DB. */
const explodingFactory = async () => {
  throw new Error('NO debe tocar la base de datos');
};

const ROW = {
  id: 'n1',
  body: 'Revisar proveedor',
  status: 'active',
  project_id: null,
  estimate_id: null,
  created_by: 'p1',
  created_at: '2026-06-20T10:00:00.000Z',
};

const argOf = (calls: Call[], method: string): unknown[] | undefined =>
  calls.find((c) => c.method === method)?.args;

describe('DbQuickNotesRepository — list', () => {
  it('lista activas de la org del viewer, recientes primero, con límite', async () => {
    const { fake, factory } = factoryOf({ data: [ROW], error: null });
    const repo = new DbQuickNotesRepository(factory);
    const notes = await repo.listQuickNotes(VIEWER_INTERNAL);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: 'n1', body: 'Revisar proveedor', status: 'active' });

    const calls = fake.lastQuery!.calls;
    expect(fake.lastTable).toBe('quick_notes');
    // acota SIEMPRE por org (no puede pedir otra org) y status active
    expect(argOf(calls, 'eq')).toEqual(['organization_id', 'org-a']);
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['status', 'active']);
    // orden created_at DESC + límite por defecto 5
    expect(calls.find((c) => c.method === 'order')?.args).toEqual(['created_at', { ascending: false }]);
    expect(calls.find((c) => c.method === 'limit')?.args).toEqual([5]);
  });

  it('respeta límite explícito (máximo del dashboard)', async () => {
    const { fake, factory } = factoryOf({ data: [], error: null });
    const repo = new DbQuickNotesRepository(factory);
    await repo.listQuickNotes(VIEWER_INTERNAL, { limit: 5 });
    expect(fake.lastQuery!.calls.find((c) => c.method === 'limit')?.args).toEqual([5]);
  });

  it('client NO ve notas y NO toca la DB', async () => {
    const repo = new DbQuickNotesRepository(explodingFactory);
    await expect(repo.listQuickNotes(VIEWER_CLIENT)).resolves.toEqual([]);
  });
});

describe('DbQuickNotesRepository — create', () => {
  it('roles internos crean; created_by/organization server-side; body trimeado', async () => {
    for (const viewer of [VIEWER_INTERNAL, VIEWER_MGMT, VIEWER_SITE]) {
      const { fake, factory } = factoryOf({ data: ROW, error: null });
      const repo = new DbQuickNotesRepository(factory);
      const note = await repo.createQuickNote(viewer, { body: '  Revisar proveedor  ' });
      expect(note.id).toBe('n1');
      const insertArg = argOf(fake.lastQuery!.calls, 'insert')?.[0] as Record<string, unknown>;
      expect(insertArg.organization_id).toBe('org-a');
      expect(insertArg.created_by).toBe('p1');
      expect(insertArg.body).toBe('Revisar proveedor'); // trim
      expect(insertArg.project_id).toBeNull();
      expect(insertArg.estimate_id).toBeNull();
    }
  });

  it('consulta/client NO crea (guard antes de tocar DB)', async () => {
    const repo = new DbQuickNotesRepository(explodingFactory);
    await expect(repo.createQuickNote(VIEWER_CLIENT, { body: 'x' })).rejects.toBeInstanceOf(
      QuickNoteInsufficientRoleError,
    );
  });

  it('body vacío o >1000 → QuickNoteValidationError (sin tocar DB)', async () => {
    const repo = new DbQuickNotesRepository(explodingFactory);
    await expect(repo.createQuickNote(VIEWER_INTERNAL, { body: '   ' })).rejects.toBeInstanceOf(
      QuickNoteValidationError,
    );
    await expect(
      repo.createQuickNote(VIEWER_INTERNAL, { body: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(QuickNoteValidationError);
  });

  it('RLS niega el INSERT (42501) → QuickNoteInsufficientRoleError (sin tecnicismo)', async () => {
    const { factory } = factoryOf({ data: null, error: { code: '42501' } });
    const repo = new DbQuickNotesRepository(factory);
    await expect(repo.createQuickNote(VIEWER_INTERNAL, { body: 'ok' })).rejects.toBeInstanceOf(
      QuickNoteInsufficientRoleError,
    );
  });
});

describe('DbQuickNotesRepository — archive (archive-only, nunca body)', () => {
  const now = () => new Date('2026-06-21T08:00:00.000Z');

  it('archiva: muta status/archived_at/archived_by y NUNCA body', async () => {
    const { fake, factory } = factoryOf({ data: { ...ROW, status: 'archived' }, error: null });
    const repo = new DbQuickNotesRepository(factory, now);
    const note = await repo.archiveQuickNote(VIEWER_MGMT, 'n1');
    expect(note.status).toBe('archived');

    const updateArg = argOf(fake.lastQuery!.calls, 'update')?.[0] as Record<string, unknown>;
    expect(updateArg.status).toBe('archived');
    expect(updateArg.archived_at).toBe('2026-06-21T08:00:00.000Z');
    expect(updateArg.archived_by).toBe('p1');
    // INVARIANTE: el payload de archive NUNCA incluye body ni campos de identidad/scope.
    expect(updateArg).not.toHaveProperty('body');
    expect(updateArg).not.toHaveProperty('organization_id');
    expect(updateArg).not.toHaveProperty('project_id');
    expect(updateArg).not.toHaveProperty('created_by');
    // acota por org y status active
    const eqs = fake.lastQuery!.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['organization_id', 'org-a']);
    expect(eqs).toContainEqual(['status', 'active']);
  });

  it('archive de nota ajena/inexistente (RLS niega → 0 filas) → QuickNoteNotFoundError', async () => {
    const { factory } = factoryOf({ data: null, error: null });
    const repo = new DbQuickNotesRepository(factory, now);
    await expect(repo.archiveQuickNote(VIEWER_INTERNAL, 'n404')).rejects.toBeInstanceOf(
      QuickNoteNotFoundError,
    );
  });

  it('client NO archiva (guard antes de tocar DB)', async () => {
    const repo = new DbQuickNotesRepository(explodingFactory, now);
    await expect(repo.archiveQuickNote(VIEWER_CLIENT, 'n1')).rejects.toBeInstanceOf(
      QuickNoteInsufficientRoleError,
    );
  });
});

describe('DbQuickNotesRepository — sin edición de body', () => {
  it('el repository NO expone métodos de edición/actualización de body', () => {
    const repo = new DbQuickNotesRepository(explodingFactory);
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(repo));
    expect(proto).not.toContain('updateQuickNote');
    expect(proto).not.toContain('editQuickNote');
    expect(proto).not.toContain('updateBody');
    // solo list/create/archive (+ constructor)
    expect(proto.filter((m) => m !== 'constructor').sort()).toEqual(
      ['archiveQuickNote', 'createQuickNote', 'listQuickNotes'],
    );
  });
});

describe('FixtureQuickNotesRepository — demo solo lectura', () => {
  const repo = new FixtureQuickNotesRepository();

  it('lista notas demo activas para viewer interno', async () => {
    const notes = await repo.listQuickNotes(VIEWER_INTERNAL);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.status === 'active')).toBe(true);
    // orden recientes primero (created_at DESC)
    const dates = notes.map((n) => n.createdAt);
    const sortedDesc = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sortedDesc);
  });

  it('client NO ve notas (guard)', async () => {
    await expect(repo.listQuickNotes(VIEWER_CLIENT)).resolves.toEqual([]);
  });

  it('mutaciones deshabilitadas (write-not-supported)', async () => {
    await expect(repo.createQuickNote(VIEWER_INTERNAL, { body: 'x' })).rejects.toBeInstanceOf(
      QuickNoteWriteNotSupportedError,
    );
    await expect(repo.archiveQuickNote(VIEWER_INTERNAL, 'n1')).rejects.toBeInstanceOf(
      QuickNoteWriteNotSupportedError,
    );
  });
});
