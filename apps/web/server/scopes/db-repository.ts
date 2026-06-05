/**
 * db-repository.ts — Implementación DB de `ScopesWriteRepository` (4B.2).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §6`.
 *
 * Reglas NO negociables:
 *  - Cliente server RLS-bound (`@/lib/supabase/server`), porta el JWT del usuario.
 *    NUNCA service-role.
 *  - `created_by` = viewer.profileId (server-side). `project_id` se VALIDA server
 *    -side: debe ser un proyecto visible para el viewer (RLS). RLS `WITH CHECK`
 *    (policy `project_scopes_all`) exige que el proyecto padre pertenezca a
 *    `app.current_org()`: un mismatch ⇒ inserción rechazada.
 *  - `code` autogenerado (slug + anti-colisión 23505 sobre (project_id, code)).
 *  - Lecturas: RLS limita a la org del viewer ⇒ ausencia ⇒ Not-Found de dominio
 *    (no se filtra existencia cross-org).
 *  - Errores → tipos de dominio; nunca se propaga SQL/stack.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  CreateScopeInput,
  ScopeDetailView,
  ScopeListItem,
  ScopesWriteRepository,
  Uuid,
  ViewerContext,
} from './types';
import {
  ProjectNotFoundError,
  ScopeCodeGenerationError,
  ScopeNotFoundError,
} from './errors';
import {
  buildScopeCodeCandidate,
  CODE_MAX_ATTEMPTS,
  slugifyScopeCode,
  validateCreateScopeInput,
} from './validation';

const DETAIL_COLUMNS =
  'id, project_id, code, name, scope_type, status, description, created_at';
const LIST_COLUMNS = 'id, code, name, scope_type, status, created_at';

const UNIQUE_VIOLATION = '23505';

interface ScopeRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  scope_type: string;
  status: string;
  description: string | null;
  created_at: string;
}

function toDetailView(row: ScopeRow): ScopeDetailView {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    name: row.name,
    scopeType: row.scope_type as ScopeDetailView['scopeType'],
    status: row.status as ScopeDetailView['status'],
    description: row.description ?? null,
    createdAt: row.created_at,
  };
}

function toListItem(row: Omit<ScopeRow, 'project_id' | 'description'>): ScopeListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    scopeType: row.scope_type as ScopeListItem['scopeType'],
    status: row.status as ScopeListItem['status'],
    createdAt: row.created_at,
  };
}

export class DbScopesWriteRepository implements ScopesWriteRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Verifica (RLS-bound) que el proyecto sea visible para el viewer. */
  private async assertProjectVisible(
    supabase: SupabaseClient,
    projectId: Uuid,
  ): Promise<void> {
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    if (error) {
      throw new Error(`scope_project_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      // Inexistente o de otra organización (RLS lo ocultó): no se filtra cross-org.
      throw new ProjectNotFoundError(projectId);
    }
  }

  async insertScope(
    viewer: AuthenticatedViewer,
    projectId: Uuid,
    input: CreateScopeInput,
  ): Promise<ScopeDetailView> {
    const normalized = validateCreateScopeInput(input);
    const supabase = await this.clientFactory();

    // El proyecto debe ser visible para el viewer (defensa explícita + mensaje
    // limpio); RLS WITH CHECK sigue siendo la barrera real en el INSERT.
    await this.assertProjectVisible(supabase, projectId);

    const base = slugifyScopeCode(normalized.name);

    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
      const code = buildScopeCodeCandidate(base, attempt);
      const { data, error } = await supabase
        .from('project_scopes')
        .insert({
          project_id: projectId,
          code,
          name: normalized.name,
          scope_type: normalized.scopeType,
          description: normalized.description,
          created_by: viewer.profileId,
          status: 'active',
        })
        .select(DETAIL_COLUMNS)
        .single();

      if (!error && data) {
        return toDetailView(data as ScopeRow);
      }

      // Colisión de code en (project_id, code): reintentar con sufijo.
      if (error && error.code === UNIQUE_VIOLATION) {
        continue;
      }

      if (error) {
        throw new Error(`scope_create_failed: ${error.code ?? 'unknown'}`);
      }
    }

    throw new ScopeCodeGenerationError();
  }

  async listScopesByProject(
    _viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ScopeListItem[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('project_scopes')
      .select(LIST_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`scope_list_failed: ${error.code ?? 'unknown'}`);
    }
    // RLS ya filtró a la org del viewer (un proyecto cross-org ⇒ 0 filas).
    return (data ?? []).map((r) => toListItem(r as Omit<ScopeRow, 'project_id' | 'description'>));
  }

  async getScopeById(
    _viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<ScopeDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('project_scopes')
      .select(DETAIL_COLUMNS)
      .eq('id', scopeId)
      .maybeSingle();

    if (error) {
      throw new Error(`scope_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      throw new ScopeNotFoundError(scopeId);
    }
    return toDetailView(data as ScopeRow);
  }
}
