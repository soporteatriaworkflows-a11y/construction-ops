/**
 * db-repository.test.ts — `DbEstimatesWriteRepository` con cliente Supabase + RPC
 * simulados (sin DB). Verifica: validación de visibilidad del alcance, llamada a
 * la RPC atómica SIN parámetro de autor, anti-colisión de code, y mapeo de
 * lecturas. La atomicidad/derivación de autor reales se prueban en el RLS runtime.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DbEstimatesWriteRepository } from '@/server/estimates/db-repository';
import {
  EstimateNotFoundError,
  EstimateValidationError,
  ScopeNotFoundError,
} from '@/server/estimates/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const VIEWER: AuthenticatedViewer = {
  userId: 'u-1',
  profileId: 'p-1',
  organizationId: 'org-1',
  role: 'management',
  email: 'a@b.test',
};
const READER: ViewerContext = { organizationId: 'org-1', role: 'management' };

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

const ESTIMATE_ROW = {
  id: 'est-1',
  code: 'presupuesto-base',
  name: 'Presupuesto Base',
  status: 'active',
  created_at: '2026-06-04T10:00:00-05:00',
  project_scope_id: 'scope-1',
  description: 'desc',
  project_scopes: { name: 'Primer Piso', projects: { id: 'proj-1', name: 'Entre Patios' } },
};
const VERSION_ROW = { id: 'ver-1', version_number: 1, status: 'draft' };

function makeClient(cfg: {
  scopeVisible?: boolean;
  rpcCalls?: RpcCall[];
  takenCodes?: Set<string>;
  estimateRow?: Record<string, unknown> | null;
  versionRow?: Record<string, unknown> | null;
  listRows?: Record<string, unknown>[];
}): () => Promise<SupabaseClient> {
  const rpcCalls = cfg.rpcCalls ?? [];
  const taken = cfg.takenCodes ?? new Set<string>();

  function builder(table: string) {
    const state: Record<string, unknown> = { table, count: false };
    const b: Record<string, unknown> = {
      select(_c: string, o?: { count?: string; head?: boolean }) {
        if (o?.count) state.count = true;
        return b;
      },
      eq(col: string, val: unknown) {
        state[col] = val;
        return b;
      },
      order() {
        return b;
      },
      limit() {
        return b;
      },
      maybeSingle() {
        return Promise.resolve(resolve());
      },
      single() {
        return Promise.resolve(resolve());
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onF, onR);
      },
    };
    function resolve() {
      if (table === 'project_scopes') {
        return { data: cfg.scopeVisible ? { id: 'scope-1' } : null, error: null };
      }
      if (table === 'estimates') {
        if (state['id'] !== undefined) {
          return { data: cfg.estimateRow ?? null, error: null };
        }
        return { data: cfg.listRows ?? [], error: null };
      }
      if (table === 'estimate_versions') {
        return { data: cfg.versionRow ?? null, error: null };
      }
      if (table === 'chapters') return { count: 0, error: null, data: [] };
      if (table === 'boq_items') return { count: 0, error: null, data: [] };
      return { data: null, error: null };
    }
    return b;
  }

  const client = {
    from: (t: string) => builder(t),
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      const code = String(args.p_code);
      if (taken.has(code)) return Promise.resolve({ data: null, error: { code: '23505' } });
      return Promise.resolve({ data: { id: `est-${code}` }, error: null });
    },
  } as unknown as SupabaseClient;
  return async () => client;
}

describe('DbEstimatesWriteRepository.insertEstimateWithInitialVersion', () => {
  it('valida alcance visible y llama la RPC SIN p_created_by', async () => {
    const rpcCalls: RpcCall[] = [];
    const repo = new DbEstimatesWriteRepository(
      makeClient({
        scopeVisible: true,
        rpcCalls,
        estimateRow: ESTIMATE_ROW,
        versionRow: VERSION_ROW,
      }),
    );
    const out = await repo.insertEstimateWithInitialVersion(VIEWER, 'scope-1', {
      name: 'Presupuesto Base',
      description: 'desc',
    });

    expect(rpcCalls[0]!.name).toBe('create_estimate_with_initial_version');
    expect(rpcCalls[0]!.args.p_scope_id).toBe('scope-1');
    expect(rpcCalls[0]!.args.p_name).toBe('Presupuesto Base');
    expect(rpcCalls[0]!.args.p_code).toBe('presupuesto-base');
    // SEGURIDAD: la RPC NO recibe el autor desde el cliente.
    expect('p_created_by' in rpcCalls[0]!.args).toBe(false);
    expect(out.activeVersion?.versionNumber).toBe(1);
    expect(out.projectId).toBe('proj-1');
  });

  it('alcance NO visible ⇒ ScopeNotFoundError sin invocar la RPC', async () => {
    const rpcCalls: RpcCall[] = [];
    const repo = new DbEstimatesWriteRepository(
      makeClient({ scopeVisible: false, rpcCalls }),
    );
    await expect(
      repo.insertEstimateWithInitialVersion(VIEWER, 'scope-x', { name: 'X' }),
    ).rejects.toBeInstanceOf(ScopeNotFoundError);
    expect(rpcCalls).toHaveLength(0);
  });

  it('anti-colisión: reintenta base-2 ante 23505 de la RPC', async () => {
    const rpcCalls: RpcCall[] = [];
    const repo = new DbEstimatesWriteRepository(
      makeClient({
        scopeVisible: true,
        rpcCalls,
        takenCodes: new Set(['presupuesto-base']),
        estimateRow: ESTIMATE_ROW,
        versionRow: VERSION_ROW,
      }),
    );
    await repo.insertEstimateWithInitialVersion(VIEWER, 'scope-1', { name: 'Presupuesto Base' });
    expect(rpcCalls.map((c) => c.args.p_code)).toEqual([
      'presupuesto-base',
      'presupuesto-base-2',
    ]);
  });

  it('validación inválida (sin nombre) ⇒ EstimateValidationError sin DB', async () => {
    const rpcCalls: RpcCall[] = [];
    const repo = new DbEstimatesWriteRepository(
      makeClient({ scopeVisible: true, rpcCalls }),
    );
    await expect(
      repo.insertEstimateWithInitialVersion(VIEWER, 'scope-1', { name: '   ' }),
    ).rejects.toBeInstanceOf(EstimateValidationError);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('DbEstimatesWriteRepository lecturas', () => {
  it('getEstimateById ausente ⇒ EstimateNotFoundError', async () => {
    const repo = new DbEstimatesWriteRepository(makeClient({ estimateRow: null }));
    await expect(repo.getEstimateById(READER, 'est-x')).rejects.toBeInstanceOf(
      EstimateNotFoundError,
    );
  });

  it('getEstimateActiveVersion mapea versión + conteos (0/0 en V01)', async () => {
    const repo = new DbEstimatesWriteRepository(makeClient({ versionRow: VERSION_ROW }));
    const v = await repo.getEstimateActiveVersion(READER, 'est-1');
    expect(v).toEqual({ id: 'ver-1', versionNumber: 1, status: 'draft', chapterCount: 0, itemCount: 0 });
  });

  it('getEstimateActiveVersion sin versiones ⇒ null', async () => {
    const repo = new DbEstimatesWriteRepository(makeClient({ versionRow: null }));
    expect(await repo.getEstimateActiveVersion(READER, 'est-1')).toBeNull();
  });

  it('listEstimatesByScope mapea filas con contexto de scope/project', async () => {
    const repo = new DbEstimatesWriteRepository(makeClient({ listRows: [ESTIMATE_ROW] }));
    const out = await repo.listEstimatesByScope(READER, 'scope-1');
    expect(out).toHaveLength(1);
    expect(out[0]!.projectName).toBe('Entre Patios');
    expect(out[0]!.scopeName).toBe('Primer Piso');
  });
});
