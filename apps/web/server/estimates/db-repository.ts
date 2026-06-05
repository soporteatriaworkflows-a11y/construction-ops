/**
 * db-repository.ts — Implementación DB de `EstimatesWriteRepository` (4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6`.
 *
 * Reglas NO negociables:
 *  - Cliente server RLS-bound (`@/lib/supabase/server`); NUNCA service-role.
 *  - La creación usa la RPC atómica `create_estimate_with_initial_version` que
 *    deriva `created_by` de la identidad autenticada (sin parámetro de autor) e
 *    inserta estimate + V01 en una transacción. RLS aplica (SECURITY INVOKER).
 *  - El alcance se valida (visible para el viewer) antes de crear; `code`
 *    autogenerado + anti-colisión 23505.
 *  - Lecturas: RLS limita a la org del viewer ⇒ ausencia ⇒ Not-Found de dominio.
 *  - Errores → tipos de dominio; nunca se propaga SQL/stack.
 */
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  CreateEstimateInput,
  EstimateActiveVersionView,
  EstimateDetailView,
  EstimateListItem,
  EstimatesWriteRepository,
  Uuid,
  ViewerContext,
} from './types';
import {
  EstimateCodeGenerationError,
  EstimateNotFoundError,
  ScopeNotFoundError,
} from './errors';
import {
  buildEstimateCodeCandidate,
  CODE_MAX_ATTEMPTS,
  slugifyEstimateCode,
  validateCreateEstimateInput,
} from './validation';

const UNIQUE_VIOLATION = '23505';

interface EstimateRow {
  id: string;
  code: string;
  name: string;
  status: string;
  created_at: string;
  project_scope_id: string;
  description?: string | null;
  project_scopes?: {
    name: string | null;
    projects?: { id: string; name: string | null } | null;
  } | null;
}

function toListItem(row: EstimateRow): EstimateListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status as EstimateListItem['status'],
    createdAt: row.created_at,
    projectScopeId: row.project_scope_id,
    scopeName: row.project_scopes?.name ?? null,
    projectId: row.project_scopes?.projects?.id ?? null,
    projectName: row.project_scopes?.projects?.name ?? null,
  };
}

const LIST_SELECT =
  'id, code, name, status, created_at, project_scope_id, project_scopes(name, projects(id, name))';
const DETAIL_SELECT = `${LIST_SELECT}, description`;

export class DbEstimatesWriteRepository implements EstimatesWriteRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Verifica (RLS-bound) que el alcance sea visible para el viewer. */
  private async assertScopeVisible(supabase: SupabaseClient, scopeId: Uuid): Promise<void> {
    const { data, error } = await supabase
      .from('project_scopes')
      .select('id')
      .eq('id', scopeId)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_scope_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      throw new ScopeNotFoundError(scopeId);
    }
  }

  async insertEstimateWithInitialVersion(
    _viewer: AuthenticatedViewer,
    scopeId: Uuid,
    input: CreateEstimateInput,
  ): Promise<EstimateDetailView> {
    const normalized = validateCreateEstimateInput(input);
    const supabase = await this.clientFactory();

    await this.assertScopeVisible(supabase, scopeId);

    const base = slugifyEstimateCode(normalized.name);
    let estimateId: string | null = null;

    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
      const code = buildEstimateCodeCandidate(base, attempt);
      // RPC atómica: estimate (status 'active') + V01 (draft). created_by derivado
      // server-side por la función (no se envía desde el cliente).
      const { data, error } = await supabase.rpc('create_estimate_with_initial_version', {
        p_scope_id: scopeId,
        p_code: code,
        p_name: normalized.name,
        p_description: normalized.description,
      });

      if (!error && data) {
        const row = (Array.isArray(data) ? data[0] : data) as { id: string };
        estimateId = row.id;
        break;
      }
      if (error && error.code === UNIQUE_VIOLATION) {
        continue;
      }
      if (error) {
        throw new Error(`estimate_create_failed: ${error.code ?? 'unknown'}`);
      }
    }

    if (!estimateId) {
      throw new EstimateCodeGenerationError();
    }
    return this.getEstimateById(_viewer, estimateId);
  }

  async listEstimatesByScope(
    _viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<EstimateListItem[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(LIST_SELECT)
      .eq('project_scope_id', scopeId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`estimate_list_failed: ${error.code ?? 'unknown'}`);
    }
    return (data ?? []).map((r) => toListItem(r as unknown as EstimateRow));
  }

  async listVisibleEstimates(_viewer: ViewerContext): Promise<EstimateListItem[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(LIST_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`estimate_list_failed: ${error.code ?? 'unknown'}`);
    }
    return (data ?? []).map((r) => toListItem(r as unknown as EstimateRow));
  }

  async getEstimateById(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(DETAIL_SELECT)
      .eq('id', estimateId)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      throw new EstimateNotFoundError(estimateId);
    }
    const row = data as unknown as EstimateRow;
    const activeVersion = await this.getEstimateActiveVersion(viewer, estimateId);
    return {
      ...toListItem(row),
      description: row.description ?? null,
      activeVersion,
    };
  }

  async getEstimateActiveVersion(
    _viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView | null> {
    const supabase = await this.clientFactory();
    // Versión vigente = mayor version_number.
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status')
      .eq('estimate_id', estimateId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_version_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) return null;

    const version = data as { id: string; version_number: number; status: string };
    const [{ count: chapterCount }, { count: itemCount }, subsRes] = await Promise.all([
      supabase
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', version.id),
      supabase
        .from('boq_items')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', version.id),
      supabase
        .from('boq_items')
        .select('subtotal')
        .eq('estimate_version_id', version.id),
    ]);

    const subs = (subsRes.data ?? []) as { subtotal: string }[];
    const directTotal = subs
      .reduce((acc, r) => acc.plus(new Decimal(r.subtotal)), new Decimal(0))
      .toFixed();

    return {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status as EstimateActiveVersionView['status'],
      chapterCount: chapterCount ?? 0,
      itemCount: itemCount ?? 0,
      directTotal,
    };
  }
}
