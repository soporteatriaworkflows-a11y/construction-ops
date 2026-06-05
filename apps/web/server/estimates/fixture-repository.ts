/**
 * fixture-repository.ts — Implementación fixture/demo de `EstimatesWriteRepository`.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6`.
 *
 * - `insertEstimateWithInitialVersion`: NO aplica en fixture (solo lectura) ⇒
 *   `EstimateWriteNotSupportedError`.
 * - Lecturas: resuelven sobre el golden master (un presupuesto, su V01 y conteos
 *   reales). Cross-org / id desconocido ⇒ vacío / `EstimateNotFoundError`.
 */
import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
import type {
  AuthenticatedViewer,
  CreateEstimateInput,
  EstimateActiveVersionView,
  EstimateDetailView,
  EstimateListItem,
  EstimatesWriteRepository,
  EstimateVersionStatus,
  Uuid,
  ViewerContext,
} from './types';
import { EstimateNotFoundError, EstimateWriteNotSupportedError } from './errors';

interface FixtureShape {
  organization: { id: Uuid };
  project: { id: Uuid; name: string };
  projectScopes: { id: Uuid; name: string }[];
  estimate: {
    id: Uuid;
    projectScopeId: Uuid;
    code: string;
    name: string;
    status: 'draft' | 'active' | 'archived';
    createdAt: string;
  };
  estimateVersion: { id: Uuid; versionNumber: number; status: EstimateVersionStatus };
  chapters: unknown[];
  boqItems: unknown[];
}

const fixture = fixtureJson as unknown as FixtureShape;

function sameOrg(viewer: ViewerContext): boolean {
  return viewer.organizationId === fixture.organization.id;
}

function activeVersion(): EstimateActiveVersionView {
  return {
    id: fixture.estimateVersion.id,
    versionNumber: fixture.estimateVersion.versionNumber,
    status: fixture.estimateVersion.status,
    chapterCount: fixture.chapters.length,
    itemCount: fixture.boqItems.length,
  };
}

function toListItem(): EstimateListItem {
  const scope = fixture.projectScopes.find((s) => s.id === fixture.estimate.projectScopeId);
  return {
    id: fixture.estimate.id,
    code: fixture.estimate.code,
    name: fixture.estimate.name,
    status: fixture.estimate.status,
    createdAt: fixture.estimate.createdAt,
    projectScopeId: fixture.estimate.projectScopeId,
    scopeName: scope?.name ?? null,
    projectId: fixture.project.id,
    projectName: fixture.project.name,
  };
}

export class FixtureEstimatesWriteRepository implements EstimatesWriteRepository {
  readonly source = 'fixture' as const;

  async insertEstimateWithInitialVersion(
    _viewer: AuthenticatedViewer,
    _scopeId: Uuid,
    _input: CreateEstimateInput,
  ): Promise<EstimateDetailView> {
    throw new EstimateWriteNotSupportedError();
  }

  async listEstimatesByScope(
    viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<EstimateListItem[]> {
    if (!sameOrg(viewer) || scopeId !== fixture.estimate.projectScopeId) return [];
    return [toListItem()];
  }

  async listVisibleEstimates(viewer: ViewerContext): Promise<EstimateListItem[]> {
    if (!sameOrg(viewer)) return [];
    return [toListItem()];
  }

  async getEstimateById(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateDetailView> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) {
      throw new EstimateNotFoundError(estimateId);
    }
    return { ...toListItem(), description: null, activeVersion: activeVersion() };
  }

  async getEstimateActiveVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView | null> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) return null;
    return activeVersion();
  }
}
