/**
 * types.ts — FUENTE ÚNICA de tipos de la capa de ESCRITURA de proyectos (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §5,§6`
 * (CONGELADO v1). La UI (agent-frontend-boq) importa estos tipos; NO los duplica.
 *
 * Notas de mapeo (contrato §3): el input rotula "Ciudad" (`city`) y se persiste
 * en la columna existente `projects.location`. No se crea una columna `city`.
 */
import type {
  AuthenticatedViewer,
} from '@/server/auth/types';
import type {
  IsoDateTime,
  ProjectStatus,
  Uuid,
  ViewerContext,
} from '@/lib/contracts/read-model';

/**
 * Entrada PERMITIDA desde el navegador (lo único que el cliente puede enviar).
 * `organization_id`, `created_by`, `code`, `id` y `role` se resuelven/generan
 * server-side y se ignoran si llegan desde el cliente (contrato §7,§8).
 */
export interface CreateProjectInput {
  /** Obligatorio, 1..160 chars tras trim. */
  name: string;
  /** Obligatorio, 1..120 chars tras trim. Persiste en `projects.location`. */
  city: string;
  /** Opcional, ≤ 2000 chars. */
  description?: string;
  /** Opcional; ÚNICO valor permitido al crear en 4B.1; default 'active'. */
  initialStatus?: 'active';
}

/** Detalle básico de un proyecto (4B.1; sin presupuesto). */
export interface ProjectDetailView {
  id: Uuid;
  name: string;
  /** = projects.location */
  city: string | null;
  description: string | null;
  status: ProjectStatus;
  createdAt: IsoDateTime;
}

/**
 * Capa de escritura de proyectos (contrato §6). Dos implementaciones
 * (`db` / `fixture`) seleccionadas por `READ_MODEL_SOURCE` sin fallback silencioso.
 */
export interface ProjectsWriteRepository {
  /**
   * Crea un proyecto en la organización del viewer autenticado. `organization_id`
   * y `created_by` se derivan server-side; `code` se autogenera (slug + anti
   * colisión). RLS es la barrera real de aislamiento.
   */
  createProject(
    viewer: AuthenticatedViewer,
    input: CreateProjectInput,
  ): Promise<ProjectDetailView>;

  /**
   * Devuelve el detalle de un proyecto visible para la organización del viewer.
   * RLS limita a la org ⇒ un id de otra org devuelve 0 filas ⇒
   * `ProjectNotFoundError` (no se filtra existencia cross-org).
   */
  getProjectById(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectDetailView>;
}

export type { AuthenticatedViewer } from '@/server/auth/types';
export type { ViewerContext, Uuid, ProjectStatus } from '@/lib/contracts/read-model';
