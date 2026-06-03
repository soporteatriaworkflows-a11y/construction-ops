/**
 * fixture-repository.ts — Implementación fixture/demo de `ProjectsWriteRepository`.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §6`.
 *
 * - `createProject`: NO aplica en modo fixture (golden master de solo lectura) ⇒
 *   lanza `ProjectWriteNotSupportedError`.
 * - `getProjectById`: resuelve sobre el fixture para el proyecto demo (preview);
 *   cualquier otro id, o un viewer de otra organización, ⇒ `ProjectNotFoundError`.
 *
 * No toca ninguna base de datos.
 */
import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
import type {
  AuthenticatedViewer,
  CreateProjectInput,
  ProjectDetailView,
  ProjectsWriteRepository,
  Uuid,
  ViewerContext,
} from './types';
import {
  ProjectNotFoundError,
  ProjectWriteNotSupportedError,
} from './errors';

/** Subconjunto del fixture consumido por la escritura demo. */
interface FixtureShape {
  organization: { id: Uuid };
  project: {
    id: Uuid;
    organizationId: Uuid;
    name: string;
    status: 'active' | 'archived' | 'closed';
    location?: string | null;
    description?: string | null;
    createdAt: string;
  };
}

const fixture = fixtureJson as unknown as FixtureShape;

export class FixtureProjectsWriteRepository implements ProjectsWriteRepository {
  readonly source = 'fixture' as const;

  async createProject(
    _viewer: AuthenticatedViewer,
    _input: CreateProjectInput,
  ): Promise<ProjectDetailView> {
    throw new ProjectWriteNotSupportedError();
  }

  async getProjectById(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectDetailView> {
    const sameOrg = viewer.organizationId === fixture.organization.id;
    if (!sameOrg || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    return {
      id: fixture.project.id,
      name: fixture.project.name,
      city: fixture.project.location ?? null,
      description: fixture.project.description ?? null,
      status: fixture.project.status,
      createdAt: fixture.project.createdAt,
    };
  }
}
