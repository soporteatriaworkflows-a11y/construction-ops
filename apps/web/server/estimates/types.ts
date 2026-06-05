/**
 * types.ts — FUENTE ÚNICA de tipos de la capa de ESCRITURA/LECTURA RLS-bound de
 * presupuestos (Oleada 4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §5,§6`.
 * La UI (agent-frontend-boq) importa estos tipos; NO los duplica.
 *
 * Mapeo: `estimates` (mig. 20260530090700 + authorship 20260604130000) y
 * `estimate_versions`. Aislamiento transitivo vía `project_scopes → projects`.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type {
  EstimateVersionStatus,
  IsoDateTime,
  Uuid,
  ViewerContext,
} from '@/lib/contracts/read-model';

export type { EstimateVersionStatus } from '@/lib/contracts/read-model';

/** Estado del presupuesto (columna `estimates.status`). */
export type EstimateStatus = 'draft' | 'active' | 'archived';

/**
 * Entrada PERMITIDA desde el navegador. `id`, `code`, `project_scope_id`,
 * `created_by`, `status` y la versión inicial se generan/derivan server-side.
 */
export interface CreateEstimateInput {
  /** Obligatorio, 1..160 chars tras trim. */
  name: string;
  /** Opcional, ≤ 2000 chars. */
  description?: string;
}

/** Ítem de lista de presupuestos (por alcance o visibles para la org). */
export interface EstimateListItem {
  id: Uuid;
  code: string;
  name: string;
  status: EstimateStatus;
  createdAt: IsoDateTime;
  projectScopeId: Uuid;
  /** Contexto (cuando se resuelve por join). */
  scopeName?: string | null;
  projectId?: Uuid | null;
  projectName?: string | null;
}

/** Versión activa (la de mayor `version_number`; V01 al crear). */
export interface EstimateActiveVersionView {
  id: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  /** Conteos de la versión (0/0 en V01 recién creada). */
  chapterCount: number;
  itemCount: number;
}

/** Detalle básico de un presupuesto (4B.3; sin capítulos/BOQ). */
export interface EstimateDetailView extends EstimateListItem {
  description: string | null;
  activeVersion: EstimateActiveVersionView | null;
}

/**
 * Capa de escritura/lectura RLS-bound de presupuestos (contrato §6). Dos
 * implementaciones (`db` / `fixture`) seleccionadas por `READ_MODEL_SOURCE` sin
 * fallback silencioso.
 */
export interface EstimatesWriteRepository {
  /**
   * Crea un presupuesto + versión inicial V01 de forma ATÓMICA (RPC server-side).
   * El alcance se valida (visible para el viewer); `created_by` lo deriva la RPC
   * de la identidad autenticada (jamás del navegador). `code` autogenerado.
   */
  insertEstimateWithInitialVersion(
    viewer: AuthenticatedViewer,
    scopeId: Uuid,
    input: CreateEstimateInput,
  ): Promise<EstimateDetailView>;

  /** Presupuestos de un alcance visible para la org (RLS ⇒ cross-org `[]`). */
  listEstimatesByScope(viewer: ViewerContext, scopeId: Uuid): Promise<EstimateListItem[]>;

  /** Todos los presupuestos visibles para la organización del viewer. */
  listVisibleEstimates(viewer: ViewerContext): Promise<EstimateListItem[]>;

  /** Detalle de un presupuesto (RLS ⇒ cross-org/inexistente `EstimateNotFoundError`). */
  getEstimateById(viewer: ViewerContext, estimateId: Uuid): Promise<EstimateDetailView>;

  /** Versión activa (mayor `version_number`) de un presupuesto visible. */
  getEstimateActiveVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView | null>;
}

export type { AuthenticatedViewer } from '@/server/auth/types';
export type { ViewerContext, Uuid } from '@/lib/contracts/read-model';
