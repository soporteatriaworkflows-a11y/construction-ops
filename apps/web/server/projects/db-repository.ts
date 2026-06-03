/**
 * db-repository.ts — Implementación DB de `ProjectsWriteRepository` (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §6`.
 *
 * Reglas NO negociables:
 *  - Usa el cliente server RLS-bound (`@/lib/supabase/server` `createClient()`),
 *    que porta el JWT del usuario. NUNCA service-role.
 *  - `organization_id` = viewer.organizationId; `created_by` = viewer.profileId
 *    (ambos server-side, jamás del navegador). RLS `WITH CHECK` exige que
 *    `organization_id = app.current_org()`: un mismatch ⇒ inserción rechazada.
 *  - `code` autogenerado (slug + anti-colisión 23505). `status` validado.
 *  - `getProjectById`: RLS limita a la org del viewer ⇒ id de otra org ⇒ 0 filas
 *    ⇒ `ProjectNotFoundError` (no se filtra existencia cross-org).
 *  - Errores → tipos de dominio; nunca se propaga SQL/stack hacia arriba.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  CreateProjectInput,
  ProjectDetailView,
  ProjectsWriteRepository,
  Uuid,
  ViewerContext,
} from './types';
import {
  ProjectCodeGenerationError,
  ProjectNotFoundError,
} from './errors';
import {
  buildCodeCandidate,
  CODE_MAX_ATTEMPTS,
  slugifyProjectCode,
  validateCreateProjectInput,
} from './validation';

/** Columnas leídas para construir `ProjectDetailView`. */
const DETAIL_COLUMNS = 'id, name, location, description, status, created_at';

/** Forma cruda de una fila de `projects` (subconjunto consumido). */
interface ProjectRow {
  id: string;
  name: string;
  location: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

/** Código de error de violación de UNIQUE en PostgreSQL. */
const UNIQUE_VIOLATION = '23505';

function toDetailView(row: ProjectRow): ProjectDetailView {
  return {
    id: row.id,
    name: row.name,
    city: row.location ?? null,
    description: row.description ?? null,
    status: row.status as ProjectDetailView['status'],
    createdAt: row.created_at,
  };
}

/**
 * `ProjectsWriteRepository` sobre Supabase con RLS. El cliente se crea por
 * petición (ligado a las cookies/JWT del usuario), por lo que el aislamiento por
 * organización lo garantiza RLS, no este código.
 */
export class DbProjectsWriteRepository implements ProjectsWriteRepository {
  readonly source = 'db' as const;

  /** Permite inyectar un cliente en tests; por defecto el RLS-bound real. */
  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  async createProject(
    viewer: AuthenticatedViewer,
    input: CreateProjectInput,
  ): Promise<ProjectDetailView> {
    const normalized = validateCreateProjectInput(input);
    const base = slugifyProjectCode(normalized.name);
    const supabase = await this.clientFactory();

    // Anti-colisión: probar base, base-2, base-3… capturando UNIQUE (23505).
    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
      const code = buildCodeCandidate(base, attempt);
      const { data, error } = await supabase
        .from('projects')
        .insert({
          organization_id: viewer.organizationId,
          created_by: viewer.profileId,
          code,
          name: normalized.name,
          location: normalized.location,
          description: normalized.description,
          status: normalized.status,
        })
        .select(DETAIL_COLUMNS)
        .single();

      if (!error && data) {
        return toDetailView(data as ProjectRow);
      }

      // Colisión de code en (organization_id, code): reintentar con sufijo.
      if (error && error.code === UNIQUE_VIOLATION) {
        continue;
      }

      // Cualquier otro error (incluye rechazo por RLS WITH CHECK) ⇒ dominio.
      if (error) {
        throw new Error(`project_create_failed: ${error.code ?? 'unknown'}`);
      }
    }

    throw new ProjectCodeGenerationError();
  }

  async getProjectById(
    _viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('projects')
      .select(DETAIL_COLUMNS)
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      throw new Error(`project_read_failed: ${error.code ?? 'unknown'}`);
    }
    // RLS ya filtró a la org del viewer: ausencia ⇒ inexistente o cross-org.
    if (!data) {
      throw new ProjectNotFoundError(projectId);
    }
    return toDetailView(data as ProjectRow);
  }
}
