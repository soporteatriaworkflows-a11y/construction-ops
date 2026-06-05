/**
 * types.ts — FUENTE ÚNICA de tipos de la capa de ESCRITURA de alcances (4B.2).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §5,§6`.
 * La UI (agent-frontend-boq) importa estos tipos; NO los duplica.
 *
 * Mapeo: `project_scopes` (migración 20260530090200 + authorship 20260604120000).
 * `organization_id` no existe en scopes: el aislamiento es transitivo vía
 * `projects.organization_id` (RLS `project_scopes_all`).
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type {
  IsoDateTime,
  ScopeType,
  Uuid,
  ViewerContext,
} from '@/lib/contracts/read-model';

// Constantes de tipo de alcance: fuente única CLIENT-SAFE en `@/lib/scopes`.
export { SCOPE_TYPES, DEFAULT_SCOPE_TYPE } from '@/lib/scopes/scope-types';
export type { ScopeType } from '@/lib/contracts/read-model';

/**
 * Entrada PERMITIDA desde el navegador. `id`, `code`, `project_id`, `created_by`,
 * `status` y `organization_id` se resuelven/generan/validan server-side y se
 * ignoran si llegan desde el cliente (contrato §7,§8).
 */
export interface CreateScopeInput {
  /** Obligatorio, 1..160 chars tras trim. */
  name: string;
  /** Obligatorio; uno de `SCOPE_TYPES`. */
  scopeType: ScopeType;
  /** Opcional, ≤ 2000 chars. */
  description?: string;
}

/** Ítem de lista de alcances de un proyecto (4B.2). */
export interface ScopeListItem {
  id: Uuid;
  name: string;
  code: string;
  scopeType: ScopeType;
  status: 'active' | 'archived';
  createdAt: IsoDateTime;
}

/** Detalle básico de un alcance (4B.2; sin presupuesto). */
export interface ScopeDetailView extends ScopeListItem {
  projectId: Uuid;
  description: string | null;
}

/**
 * Capa de escritura/lectura RLS-bound de alcances (contrato §6). Dos
 * implementaciones (`db` / `fixture`) seleccionadas por `READ_MODEL_SOURCE` sin
 * fallback silencioso.
 */
export interface ScopesWriteRepository {
  /**
   * Crea un alcance en un proyecto de la organización del viewer. El proyecto se
   * valida server-side (debe ser visible para el viewer); `created_by` se deriva
   * de `viewer.profileId`; `code` se autogenera (slug + anti-colisión). RLS
   * `WITH CHECK` es la barrera real de aislamiento.
   */
  insertScope(
    viewer: AuthenticatedViewer,
    projectId: Uuid,
    input: CreateScopeInput,
  ): Promise<ScopeDetailView>;

  /**
   * Lista los alcances de un proyecto visible para la organización del viewer.
   * RLS filtra por organización ⇒ un proyecto de otra org devuelve `[]`.
   */
  listScopesByProject(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ScopeListItem[]>;

  /**
   * Detalle de un alcance visible para la organización del viewer. RLS limita a
   * la org ⇒ un id de otra org devuelve 0 filas ⇒ `ScopeNotFoundError` (no se
   * filtra existencia cross-org).
   */
  getScopeById(
    viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<ScopeDetailView>;
}

export type { AuthenticatedViewer } from '@/server/auth/types';
export type { ViewerContext, Uuid } from '@/lib/contracts/read-model';
