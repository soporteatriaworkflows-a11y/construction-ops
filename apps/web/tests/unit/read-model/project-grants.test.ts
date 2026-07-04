/**
 * project-grants.test.ts — V5.6.4 CLIENT_PROJECT_SCOPE: alcance por proyecto
 * del ViewerRole `client` en el read-model.
 *
 * Cobertura ANTI FAIL-OPEN (contrato §12.8):
 *  1. Helper puro `resolveGrantedProjects`/`isProjectGranted` (deny-by-default).
 *  2. `FixtureReadModelRepository`: TODOS los métodos que derivan proyecto
 *     quedan scoped para un `client` sin grants (0 proyectos / not-found) y se
 *     abren SOLO con el grant explícito. Roles internos: sin cambio.
 *  3. `DrizzleReadModelRepository` (repo simulado): listado intersectado con
 *     grants; entidad no asignada ⇒ MISMO not-found que una inexistente
 *     (anti-fuga de existencia), incluida la cadena versión→…→proyecto.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md §7,§9,§12`.
 */
import { describe, it, expect } from 'vitest';
import {
  filterGrantedProjects,
  isProjectGranted,
  resolveGrantedProjects,
} from '@/server/read-model/project-grants';
import { FixtureReadModelRepository } from '@/server/read-model/fixture-repository';
import { DrizzleReadModelRepository } from '@/server/read-model/drizzle-repository';
import type { DrizzleReadRepository } from '@/server/repositories/read-repository';
import {
  EstimateVersionNotFoundError,
  ProjectNotFoundError,
} from '@/server/read-model/errors';
import type { Uuid, ViewerContext } from '@/lib/contracts/read-model';
import fixture from '../../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

const ORG = fixture.organization.id;
const PROJECT = fixture.project.id;
const VERSION = fixture.estimateVersion.id;

/* ---------------------------------------------------------------------------
 * 1. Helper puro — deny-by-default
 * ------------------------------------------------------------------------- */

describe('project-grants — helper puro (deny-by-default)', () => {
  const base = { organizationId: ORG } as const;

  it('client SIN projectGrants ⇒ conjunto vacío (fail-closed)', () => {
    const viewer: ViewerContext = { ...base, role: 'client' };
    const granted = resolveGrantedProjects(viewer);
    expect(granted).not.toBe('all');
    expect((granted as ReadonlySet<Uuid>).size).toBe(0);
    expect(isProjectGranted(viewer, PROJECT)).toBe(false);
  });

  it('client con lista vacía ⇒ conjunto vacío', () => {
    const viewer: ViewerContext = { ...base, role: 'client', projectGrants: [] };
    expect(isProjectGranted(viewer, PROJECT)).toBe(false);
  });

  it('client con grant ⇒ SOLO ese proyecto', () => {
    const viewer: ViewerContext = { ...base, role: 'client', projectGrants: [PROJECT] };
    expect(isProjectGranted(viewer, PROJECT)).toBe(true);
    expect(isProjectGranted(viewer, '00000000-0000-4000-8000-0000000000aa')).toBe(false);
  });

  it("client con 'all' (demo / interno exportando como client) ⇒ sin restricción", () => {
    const viewer: ViewerContext = { ...base, role: 'client', projectGrants: 'all' };
    expect(resolveGrantedProjects(viewer)).toBe('all');
  });

  it('V5.6.6C: una LISTA de grants restringe a CUALQUIER rol (obra/compras scoped)', () => {
    // El alcance ya no depende del ViewerRole: los roles internos scoped
    // (obra→site, compras→internal) llegan con lista resuelta server-side y
    // quedan restringidos exactamente igual que client.
    for (const role of ['internal', 'management', 'site'] as const) {
      const scoped = resolveGrantedProjects({ ...base, role, projectGrants: [PROJECT] });
      expect(scoped).not.toBe('all');
      expect((scoped as ReadonlySet<Uuid>).has(PROJECT)).toBe(true);
      const empty = resolveGrantedProjects({ ...base, role, projectGrants: [] });
      expect(empty).not.toBe('all');
      expect((empty as ReadonlySet<Uuid>).size).toBe(0);
    }
  });

  it('sin grants resueltos (undefined): fail-closed solo para client; el resto conserva all', () => {
    // Paridad V5.6.4 + literales demo internos (sin concepto de grants):
    // los allow-all (admin/gerencia/presupuestos) llegan con 'all' explícito
    // desde resolve-viewer; undefined solo ocurre en literales demo.
    for (const role of ['internal', 'management', 'site'] as const) {
      expect(resolveGrantedProjects({ ...base, role })).toBe('all');
    }
    const client = resolveGrantedProjects({ ...base, role: 'client' });
    expect(client).not.toBe('all');
    expect((client as ReadonlySet<Uuid>).size).toBe(0);
  });

  it('filterGrantedProjects intersecta por id', () => {
    const projects = [{ id: PROJECT }, { id: '00000000-0000-4000-8000-0000000000aa' as Uuid }];
    const viewer: ViewerContext = { ...base, role: 'client', projectGrants: [PROJECT] };
    expect(filterGrantedProjects(viewer, projects).map((p) => p.id)).toEqual([PROJECT]);
  });
});

/* ---------------------------------------------------------------------------
 * 2. FixtureReadModelRepository — wiring anti fail-open (todos los métodos
 *    que derivan proyecto)
 * ------------------------------------------------------------------------- */

describe('project-grants — FixtureReadModelRepository (wiring anti fail-open)', () => {
  const repo = new FixtureReadModelRepository();
  const clientSinGrants: ViewerContext = { organizationId: ORG, role: 'client' };
  const clientConGrant: ViewerContext = {
    organizationId: ORG,
    role: 'client',
    projectGrants: [PROJECT],
  };
  const interno: ViewerContext = { organizationId: ORG, role: 'internal' };

  it('client sin grants: los listados por proyecto quedan vacíos', async () => {
    expect(await repo.listProjects(clientSinGrants)).toEqual([]);
    expect(await repo.listEstimates(clientSinGrants)).toEqual([]);
    expect(await repo.listQuantities(clientSinGrants)).toEqual([]);
    expect(await repo.listWorkspaceGroups(clientSinGrants)).toEqual([]);
  });

  it('client sin grants: las entidades por id responden not-found (sin fuga de existencia)', async () => {
    await expect(repo.getProjectOverview(clientSinGrants, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(repo.getDashboardSummary(clientSinGrants, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(repo.getSchedule(clientSinGrants, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(repo.listProgressEntries(clientSinGrants, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(repo.listResourceAssignments(clientSinGrants, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    // Cadena versión→proyecto: mismo error que una versión inexistente.
    await expect(repo.getEstimateDetail(clientSinGrants, VERSION)).rejects.toBeInstanceOf(
      EstimateVersionNotFoundError,
    );
  });

  it('client CON grant: ve exactamente su proyecto asignado', async () => {
    const projects = await repo.listProjects(clientConGrant);
    expect(projects.map((p) => p.id)).toEqual([PROJECT]);
    const overview = await repo.getProjectOverview(clientConGrant, PROJECT);
    expect(overview.project.id).toBe(PROJECT);
    const detail = await repo.getEstimateDetail(clientConGrant, VERSION);
    expect(detail.estimate.versionId).toBe(VERSION);
  });

  it('roles internos sin projectGrants: sin cambio de comportamiento', async () => {
    const projects = await repo.listProjects(interno);
    expect(projects.map((p) => p.id)).toEqual([PROJECT]);
    const overview = await repo.getProjectOverview(interno, PROJECT);
    expect(overview.project.id).toBe(PROJECT);
  });
});

/* ---------------------------------------------------------------------------
 * 3. DrizzleReadModelRepository — repo simulado con DOS proyectos de la misma
 *    organización (scoping intra-org) y cadena versión→estimate→scope→proyecto.
 * ------------------------------------------------------------------------- */

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const P_GRANTED = '00000000-0000-0000-0000-0000000000c1';
const P_OTHER = '00000000-0000-0000-0000-0000000000c2';
const SCOPE_OTHER = '00000000-0000-0000-0000-0000000000d2';
const EST_OTHER = '00000000-0000-0000-0000-000000000e02';
const VER_OTHER = '00000000-0000-0000-0000-000000000312';

function makeFakeRepo(): DrizzleReadRepository {
  const projects = [
    { id: P_GRANTED, organizationId: ORG_A, name: 'Asignado', status: 'active', location: null, createdAt: '2026-06-01' },
    { id: P_OTHER, organizationId: ORG_A, name: 'No asignado', status: 'active', location: null, createdAt: '2026-06-01' },
  ];
  const scopes = [
    { id: SCOPE_OTHER, projectId: P_OTHER, code: 'S2', name: 'Alcance 2', scopeType: 'stage' },
  ];
  const estimates = [{ id: EST_OTHER, projectScopeId: SCOPE_OTHER }];
  const versions = [
    { id: VER_OTHER, estimateId: EST_OTHER, versionNumber: 1, status: 'draft', approvedAt: null, createdAt: '2026-06-01' },
  ];
  const fake = {
    async projects(organizationId: Uuid) {
      return organizationId === ORG_A ? projects : [];
    },
    async projectById(organizationId: Uuid, projectId: Uuid) {
      if (organizationId !== ORG_A) return null;
      return projects.find((p) => p.id === projectId) ?? null;
    },
    async scopesByProject(projectId: Uuid) {
      return scopes.filter((s) => s.projectId === projectId);
    },
    async scopesByProjects(projectIds: readonly Uuid[]) {
      return scopes.filter((s) => projectIds.includes(s.projectId));
    },
    async scopeById(scopeId: Uuid) {
      return scopes.find((s) => s.id === scopeId) ?? null;
    },
    async estimatesByScopes(scopeIds: readonly Uuid[]) {
      return estimates.filter((e) => scopeIds.includes(e.projectScopeId));
    },
    async versionsByEstimates(estimateIds: readonly Uuid[]) {
      return versions.filter((v) => estimateIds.includes(v.estimateId));
    },
    async versionById(versionId: Uuid) {
      return versions.find((v) => v.id === versionId) ?? null;
    },
    async estimateById(estimateId: Uuid) {
      return estimates.find((e) => e.id === estimateId) ?? null;
    },
    async chaptersByVersion() {
      return [];
    },
    async boqItemsByVersion() {
      return [];
    },
    async indirectRulesByVersion() {
      return [];
    },
    async scheduleTasksByProject() {
      return [];
    },
    async taskDependenciesByProject() {
      return [];
    },
  };
  return fake as unknown as DrizzleReadRepository;
}

describe('project-grants — DrizzleReadModelRepository (scoping intra-org)', () => {
  const repo = new DrizzleReadModelRepository(makeFakeRepo());
  const clientGranted: ViewerContext = {
    organizationId: ORG_A,
    role: 'client',
    projectGrants: [P_GRANTED],
  };
  const interno: ViewerContext = { organizationId: ORG_A, role: 'internal' };

  it('listProjects intersecta con los grants (no ve el otro proyecto de su org)', async () => {
    const visible = await repo.listProjects(clientGranted);
    expect(visible.map((p) => p.id)).toEqual([P_GRANTED]);
  });

  it('proyecto de la misma org NO asignado ⇒ ProjectNotFoundError (igual que inexistente)', async () => {
    await expect(repo.getProjectOverview(clientGranted, P_OTHER)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(repo.getSchedule(clientGranted, P_OTHER)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('cadena versión→estimate→scope→proyecto NO asignado ⇒ EstimateVersionNotFoundError', async () => {
    await expect(repo.getEstimateDetail(clientGranted, VER_OTHER)).rejects.toBeInstanceOf(
      EstimateVersionNotFoundError,
    );
  });

  it('client sin grants ⇒ 0 proyectos (deny-by-default)', async () => {
    const viewer: ViewerContext = { organizationId: ORG_A, role: 'client' };
    expect(await repo.listProjects(viewer)).toEqual([]);
  });

  it('roles internos: sin cambio (ven ambos proyectos de su org)', async () => {
    const visible = await repo.listProjects(interno);
    expect(visible.map((p) => p.id).sort()).toEqual([P_GRANTED, P_OTHER].sort());
  });
});
