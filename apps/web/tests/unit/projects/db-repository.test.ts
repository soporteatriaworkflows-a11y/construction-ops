/**
 * db-repository.test.ts — `DbProjectsWriteRepository` con un cliente Supabase
 * simulado (sin DB). Verifica: derivación server-side de organization_id/
 * created_by, generación/anti-colisión de `code`, mapeo city→location y
 * traducción de ausencia a `ProjectNotFoundError`.
 *
 * El aislamiento REAL por organización (RLS) se prueba empíricamente en el RLS
 * runtime (`scripts/rls-runtime/run.ts`), no con mocks.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DbProjectsWriteRepository } from '@/server/projects/db-repository';
import { ProjectNotFoundError, ProjectValidationError } from '@/server/projects/errors';
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

/** Construye un cliente Supabase simulado para INSERT con control de colisiones. */
function fakeInsertClient(options: {
  // Conjunto de `code` que ya existen y deben provocar 23505.
  taken?: Set<string>;
  // Captura de los INSERT intentados.
  calls?: InsertCall[];
  // Forzar un error no-23505 en el primer intento.
  failWith?: string;
}): () => Promise<SupabaseClient> {
  const taken = options.taken ?? new Set<string>();
  const calls = options.calls ?? [];
  const client = {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          const code = String(payload.code);
          calls.push({ payload, code });
          return {
            select() {
              return {
                async single() {
                  if (options.failWith) {
                    return { data: null, error: { code: options.failWith } };
                  }
                  if (taken.has(code)) {
                    return { data: null, error: { code: '23505' } };
                  }
                  return {
                    data: {
                      id: `id-${code}`,
                      name: payload.name,
                      location: payload.location,
                      description: payload.description,
                      status: payload.status,
                      created_at: '2026-06-02T10:00:00-05:00',
                    },
                    error: null,
                  };
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

/** Cliente simulado para getProjectById con una fila opcional. */
function fakeSelectClient(row: Record<string, unknown> | null, error?: string) {
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (error) return { data: null, error: { code: error } };
                  return { data: row, error: null };
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

describe('DbProjectsWriteRepository.createProject', () => {
  it('setea organization_id y created_by server-side; mapea city→location', async () => {
    const calls: InsertCall[] = [];
    const repo = new DbProjectsWriteRepository(fakeInsertClient({ calls }));
    const out = await repo.createProject(VIEWER, { name: 'Torre Norte', city: 'Bogotá' });

    expect(calls[0]!.payload.organization_id).toBe('org-1');
    expect(calls[0]!.payload.created_by).toBe('p-1');
    expect(calls[0]!.payload.location).toBe('Bogotá');
    expect(calls[0]!.payload.status).toBe('active');
    expect(calls[0]!.code).toBe('torre-norte');
    expect(out.city).toBe('Bogotá');
    expect(out.status).toBe('active');
  });

  it('ignora organization_id/created_by enviados en el input (no están en el tipo)', async () => {
    const calls: InsertCall[] = [];
    const repo = new DbProjectsWriteRepository(fakeInsertClient({ calls }));
    await repo.createProject(VIEWER, {
      name: 'X',
      city: 'Y',
      // Campos espurios: el repo nunca los lee.
      organization_id: 'org-EVIL',
      created_by: 'p-EVIL',
      code: 'HACK',
    } as never);
    expect(calls[0]!.payload.organization_id).toBe('org-1');
    expect(calls[0]!.payload.created_by).toBe('p-1');
    expect(calls[0]!.code).toBe('x');
  });

  it('anti-colisión: reintenta base-2, base-3 ante 23505', async () => {
    const calls: InsertCall[] = [];
    const taken = new Set(['torre-norte', 'torre-norte-2']);
    const repo = new DbProjectsWriteRepository(fakeInsertClient({ taken, calls }));
    const out = await repo.createProject(VIEWER, { name: 'Torre Norte', city: 'Bogotá' });
    expect(calls.map((c) => c.code)).toEqual([
      'torre-norte',
      'torre-norte-2',
      'torre-norte-3',
    ]);
    expect(out.id).toBe('id-torre-norte-3');
  });

  it('propaga error de validación sin tocar la DB', async () => {
    const calls: InsertCall[] = [];
    const repo = new DbProjectsWriteRepository(fakeInsertClient({ calls }));
    await expect(repo.createProject(VIEWER, { name: '', city: '' })).rejects.toBeInstanceOf(
      ProjectValidationError,
    );
    expect(calls).toHaveLength(0);
  });

  it('error no-23505 ⇒ error de dominio sanitizado (sin SQL/stack)', async () => {
    const repo = new DbProjectsWriteRepository(fakeInsertClient({ failWith: '23503' }));
    await expect(
      repo.createProject(VIEWER, { name: 'X', city: 'Y' }),
    ).rejects.toThrow(/project_create_failed/);
  });
});

describe('DbProjectsWriteRepository.getProjectById', () => {
  it('mapea la fila a ProjectDetailView (location→city)', async () => {
    const repo = new DbProjectsWriteRepository(
      fakeSelectClient({
        id: 'id-1',
        name: 'Torre',
        location: 'Bogotá',
        description: 'desc',
        status: 'active',
        created_at: '2026-06-02T10:00:00-05:00',
      }),
    );
    const out = await repo.getProjectById(READER, 'id-1');
    expect(out).toEqual({
      id: 'id-1',
      name: 'Torre',
      city: 'Bogotá',
      description: 'desc',
      status: 'active',
      createdAt: '2026-06-02T10:00:00-05:00',
    });
  });

  it('ausencia (RLS filtró / cross-org / inexistente) ⇒ ProjectNotFoundError', async () => {
    const repo = new DbProjectsWriteRepository(fakeSelectClient(null));
    await expect(repo.getProjectById(READER, 'id-x')).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('error de lectura ⇒ error de dominio sanitizado', async () => {
    const repo = new DbProjectsWriteRepository(fakeSelectClient(null, '42501'));
    await expect(repo.getProjectById(READER, 'id-x')).rejects.toThrow(/project_read_failed/);
  });
});
