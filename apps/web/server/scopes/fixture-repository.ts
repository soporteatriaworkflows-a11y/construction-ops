/**
 * fixture-repository.ts — Implementación fixture/demo de `ScopesWriteRepository`.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §6`.
 *
 * - `insertScope`: NO aplica en modo fixture (golden master de solo lectura) ⇒
 *   lanza `ScopeWriteNotSupportedError`.
 * - `listScopesByProject` / `getScopeById`: resuelven sobre el fixture para el
 *   proyecto demo; cualquier otro id, o un viewer de otra organización, ⇒ vacío /
 *   `ScopeNotFoundError`.
 *
 * No toca ninguna base de datos.
 */
import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
import type {
  AuthenticatedViewer,
  CreateScopeInput,
  ScopeDetailView,
  ScopeListItem,
  ScopesWriteRepository,
  ScopeType,
  Uuid,
  ViewerContext,
} from './types';
import { ScopeNotFoundError, ScopeWriteNotSupportedError } from './errors';

interface FixtureScope {
  id: Uuid;
  projectId: Uuid;
  code: string;
  name: string;
  scopeType: ScopeType;
  status: 'active' | 'archived';
  description?: string | null;
  createdAt: string;
}

interface FixtureShape {
  organization: { id: Uuid };
  project: { id: Uuid };
  projectScopes: FixtureScope[];
}

const fixture = fixtureJson as unknown as FixtureShape;

function sameOrg(viewer: ViewerContext): boolean {
  return viewer.organizationId === fixture.organization.id;
}

function toListItem(s: FixtureScope): ScopeListItem {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    scopeType: s.scopeType,
    status: s.status,
    createdAt: s.createdAt,
  };
}

export class FixtureScopesWriteRepository implements ScopesWriteRepository {
  readonly source = 'fixture' as const;

  async insertScope(
    _viewer: AuthenticatedViewer,
    _projectId: Uuid,
    _input: CreateScopeInput,
  ): Promise<ScopeDetailView> {
    throw new ScopeWriteNotSupportedError();
  }

  async listScopesByProject(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ScopeListItem[]> {
    if (!sameOrg(viewer) || projectId !== fixture.project.id) return [];
    return fixture.projectScopes
      .filter((s) => s.projectId === projectId)
      .map(toListItem);
  }

  async getScopeById(
    viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<ScopeDetailView> {
    const scope = fixture.projectScopes.find((s) => s.id === scopeId);
    if (!sameOrg(viewer) || !scope) {
      throw new ScopeNotFoundError(scopeId);
    }
    return {
      id: scope.id,
      projectId: scope.projectId,
      code: scope.code,
      name: scope.name,
      scopeType: scope.scopeType,
      status: scope.status,
      description: scope.description ?? null,
      createdAt: scope.createdAt,
    };
  }
}
