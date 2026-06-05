/**
 * db-repository.test.ts — `DbScopesWriteRepository` con un cliente Supabase
 * simulado (sin DB). Verifica: validación de visibilidad del proyecto, derivación
 * server-side de created_by, generación/anti-colisión de `code`, status forzado,
 * y traducción de ausencia a errores de dominio.
 *
 * El aislamiento REAL por organización (RLS) se prueba en el RLS runtime
 * (`scripts/rls-runtime/run.ts`), no con mocks.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DbScopesWriteRepository } from '@/server/scopes/db-repository';
import {
  ProjectNotFoundError,
  ScopeNotFoundError,
  ScopeValidationError,
} from '@/server/scopes/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const VIEWER: AuthenticatedViewer = {
  userId: 'u-1',
  profileId: 'p-1',
  organizationId: 'org-1',
  role: 'management',
  email: 'admin@example.test',
};
const READER: ViewerContext = { organizationId: 'org-1', role: 'management' };

interface InsertCall {
  payload: Record<string, unknown>;
  code: string;
}

/** Fake flexible: maneja projects (visibilidad) y project_scopes (insert/list/get). */
function fakeClient(opts: {
  projectVisible?: boolean;
  taken?: Set<string>;
  insertCalls?: InsertCall[];
  listRows?: Record<string, unknown>[];
  scopeRow?: Record<string, unknown> | null;
}): () => Promise<SupabaseClient> {
  const taken = opts.taken ?? new Set<string>();
  const insertCalls = opts.insertCalls ?? [];
  const client = {
    from(table: string) {
      if (table === 'projects') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return opts.projectVisible
                      ? { data: { id: 'proj-1' }, error: null }
                      : { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      // project_scopes
      return {
        insert(payload: Record<string, unknown>) {
          const code = String(payload.code);
          insertCalls.push({ payload, code });
          return {
            select() {
              return {
                async single() {
                  if (taken.has(code)) return { data: null, error: { code: '23505' } };
                  return {
                    data: {
                      id: `id-${code}`,
                      project_id: payload.project_id,
                      code,
                      name: payload.name,
                      scope_type: payload.scope_type,
                      status: payload.status,
                      description: payload.description,
                      created_at: '2026-06-04T10:00:00-05:00',
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                // listScopesByProject usa .order(); getScopeById usa .maybeSingle()
                async order() {
                  return { data: opts.listRows ?? [], error: null };
                },
                async maybeSingle() {
                  return { data: opts.scopeRow ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return async () => client;
}

describe('DbScopesWriteRepository.insertScope', () => {
  it('valida proyecto visible, deriva created_by y fuerza status server-side', async () => {
    const insertCalls: InsertCall[] = [];
    const repo = new DbScopesWriteRepository(
      fakeClient({ projectVisible: true, insertCalls }),
    );
    const out = await repo.insertScope(VIEWER, 'proj-1', {
      name: 'Primer Piso',
      scopeType: 'floor',
      description: 'desc',
    });

    expect(insertCalls[0]!.payload.project_id).toBe('proj-1');
    expect(insertCalls[0]!.payload.created_by).toBe('p-1');
    expect(insertCalls[0]!.payload.scope_type).toBe('floor');
    expect(insertCalls[0]!.payload.status).toBe('active');
    expect(insertCalls[0]!.code).toBe('primer-piso');
    expect(out.scopeType).toBe('floor');
    expect(out.description).toBe('desc');
  });

  it('ignora campos espurios del input (created_by/code/status/project_id)', async () => {
    const insertCalls: InsertCall[] = [];
    const repo = new DbScopesWriteRepository(
      fakeClient({ projectVisible: true, insertCalls }),
    );
    await repo.insertScope(VIEWER, 'proj-1', {
      name: 'X',
      scopeType: 'other',
      created_by: 'p-EVIL',
      code: 'HACK',
      status: 'archived',
      project_id: 'proj-EVIL',
    } as never);
    expect(insertCalls[0]!.payload.created_by).toBe('p-1');
    expect(insertCalls[0]!.payload.status).toBe('active');
    expect(insertCalls[0]!.payload.project_id).toBe('proj-1');
    expect(insertCalls[0]!.code).toBe('x');
  });

  it('proyecto NO visible (cross-org/inexistente) ⇒ ProjectNotFoundError, sin INSERT', async () => {
    const insertCalls: InsertCall[] = [];
    const repo = new DbScopesWriteRepository(
      fakeClient({ projectVisible: false, insertCalls }),
    );
    await expect(
      repo.insertScope(VIEWER, 'proj-x', { name: 'Y', scopeType: 'floor' }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(insertCalls).toHaveLength(0);
  });

  it('anti-colisión: reintenta base-2, base-3 ante 23505', async () => {
    const insertCalls: InsertCall[] = [];
    const taken = new Set(['primer-piso', 'primer-piso-2']);
    const repo = new DbScopesWriteRepository(
      fakeClient({ projectVisible: true, taken, insertCalls }),
    );
    const out = await repo.insertScope(VIEWER, 'proj-1', {
      name: 'Primer Piso',
      scopeType: 'floor',
    });
    expect(insertCalls.map((c) => c.code)).toEqual([
      'primer-piso',
      'primer-piso-2',
      'primer-piso-3',
    ]);
    expect(out.id).toBe('id-primer-piso-3');
  });

  it('validación inválida (sin nombre / tipo inválido) ⇒ ScopeValidationError sin DB', async () => {
    const insertCalls: InsertCall[] = [];
    const repo = new DbScopesWriteRepository(
      fakeClient({ projectVisible: true, insertCalls }),
    );
    await expect(
      repo.insertScope(VIEWER, 'proj-1', { name: '', scopeType: 'nope' as never }),
    ).rejects.toBeInstanceOf(ScopeValidationError);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('DbScopesWriteRepository.listScopesByProject', () => {
  it('mapea filas a ScopeListItem', async () => {
    const repo = new DbScopesWriteRepository(
      fakeClient({
        listRows: [
          {
            id: 's-1',
            code: 'P1',
            name: 'Primer Piso',
            scope_type: 'floor',
            status: 'active',
            created_at: '2026-06-04T10:00:00-05:00',
          },
        ],
      }),
    );
    const out = await repo.listScopesByProject(READER, 'proj-1');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: 's-1',
      code: 'P1',
      name: 'Primer Piso',
      scopeType: 'floor',
      status: 'active',
      createdAt: '2026-06-04T10:00:00-05:00',
    });
  });

  it('proyecto sin alcances (o cross-org filtrado por RLS) ⇒ []', async () => {
    const repo = new DbScopesWriteRepository(fakeClient({ listRows: [] }));
    expect(await repo.listScopesByProject(READER, 'proj-1')).toEqual([]);
  });
});

describe('DbScopesWriteRepository.getScopeById', () => {
  it('mapea la fila a ScopeDetailView', async () => {
    const repo = new DbScopesWriteRepository(
      fakeClient({
        scopeRow: {
          id: 's-1',
          project_id: 'proj-1',
          code: 'P1',
          name: 'Primer Piso',
          scope_type: 'floor',
          status: 'active',
          description: 'desc',
          created_at: '2026-06-04T10:00:00-05:00',
        },
      }),
    );
    const out = await repo.getScopeById(READER, 's-1');
    expect(out).toEqual({
      id: 's-1',
      projectId: 'proj-1',
      code: 'P1',
      name: 'Primer Piso',
      scopeType: 'floor',
      status: 'active',
      description: 'desc',
      createdAt: '2026-06-04T10:00:00-05:00',
    });
  });

  it('ausencia (RLS filtró / cross-org / inexistente) ⇒ ScopeNotFoundError', async () => {
    const repo = new DbScopesWriteRepository(fakeClient({ scopeRow: null }));
    await expect(repo.getScopeById(READER, 's-x')).rejects.toBeInstanceOf(
      ScopeNotFoundError,
    );
  });
});
