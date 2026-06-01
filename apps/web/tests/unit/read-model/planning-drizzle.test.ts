/**
 * planning-drizzle.test.ts — El `DrizzleReadModelRepository` arma los DTOs de
 * planificación a partir de filas Drizzle, respetando `organizationId` y
 * aplicando la proyección por rol. Se inyecta un `DrizzleReadRepository`
 * simulado (sin tocar Postgres) que sólo entrega filas de la organización
 * solicitada — espejo del aislamiento real por RLS.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import { DrizzleReadModelRepository } from '@/server/read-model/drizzle-repository';
import type { DrizzleReadRepository } from '@/server/repositories/read-repository';
import { ProjectNotFoundError } from '@/server/read-model/errors';
import type { ViewerContext, Uuid } from '@/lib/contracts/read-model';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const ORG_B = '00000000-0000-0000-0000-0000000000a2';
const PROJECT_A = '00000000-0000-0000-0000-0000000000c1';
const TASK_1 = '0d000000-0000-0000-0000-000000000001';
const TASK_2 = '0d000000-0000-0000-0000-000000000002';
const MILESTONE = '0d000000-0000-0000-0000-000000000006';
const RES_LABOR = '00000000-0000-0000-0000-0000000000e2';
const ROLE_OFFICIAL = '00000000-0000-0000-0000-0000000000f1';

/** Filas de la organización A (espejo del seed 0003). */
const projectsA = [{ id: PROJECT_A, organizationId: ORG_A, name: 'Entre Patios' }];

const tasksA = [
  {
    id: TASK_1, organizationId: ORG_A, projectId: PROJECT_A, parentTaskId: null,
    wbsCode: '1', name: 'Preliminares', plannedStart: '2026-06-01', plannedEnd: '2026-06-10',
    plannedDurationDays: '10.0000', progressPct: '100.0000', status: 'completed',
    isMilestone: false, sortOrder: 0, externalReference: 'MSP-WBS-1',
  },
  {
    id: TASK_2, organizationId: ORG_A, projectId: PROJECT_A, parentTaskId: null,
    wbsCode: '2', name: 'Mampostería', plannedStart: '2026-06-11', plannedEnd: '2026-06-30',
    plannedDurationDays: '20.0000', progressPct: '45.0000', status: 'in_progress',
    isMilestone: false, sortOrder: 1, externalReference: 'MSP-WBS-2',
  },
  {
    id: MILESTONE, organizationId: ORG_A, projectId: PROJECT_A, parentTaskId: null,
    wbsCode: 'M1', name: 'Entrega', plannedStart: '2026-07-20', plannedEnd: '2026-07-20',
    plannedDurationDays: '0.0000', progressPct: '0.0000', status: 'not_started',
    isMilestone: true, sortOrder: 2, externalReference: 'MSP-MILESTONE-1',
  },
];

const depsA = [
  {
    id: 'dep-1', organizationId: ORG_A, projectId: PROJECT_A,
    predecessorTaskId: TASK_1, successorTaskId: TASK_2, dependencyType: 'FS', lagDays: '0.0000',
  },
];

const progressA = [
  {
    id: 'pg-1', organizationId: ORG_A, projectId: PROJECT_A, taskId: TASK_2,
    recordedAt: new Date('2026-06-20T22:00:00Z'), physicalProgressPct: '30.0000',
    financialProgressPct: '28.0000', notes: 'Avance parcial', createdBy: null,
  },
];

const assignmentsA = [
  {
    id: 'ra-1', organizationId: ORG_A, projectId: PROJECT_A, taskId: TASK_2,
    resourceId: RES_LABOR, laborRoleId: ROLE_OFFICIAL, quantity: '3.0000000000',
    unit: 'cuadrilla', notes: 'Cuadrilla de mampostería',
  },
];

const resources = [{ id: RES_LABOR, name: 'Oficial de obra' }];
const laborRoles = [{ id: ROLE_OFFICIAL, name: 'Oficial' }];

/**
 * Repositorio Drizzle simulado: sólo devuelve filas de `ORG_A`. Cualquier
 * consulta con otra organización devuelve vacío / null, igual que RLS en
 * runtime (defensa en profundidad por `organizationId`).
 */
function makeFakeRepo(): DrizzleReadRepository {
  const ofOrg = (organizationId: Uuid) => organizationId === ORG_A;
  const fake = {
    async projectById(organizationId: Uuid, projectId: Uuid) {
      if (!ofOrg(organizationId)) return null;
      return projectsA.find((p) => p.id === projectId) ?? null;
    },
    async scheduleTasksByProject(organizationId: Uuid, projectId: Uuid) {
      if (!ofOrg(organizationId)) return [];
      return tasksA.filter((t) => t.projectId === projectId);
    },
    async taskDependenciesByProject(organizationId: Uuid, projectId: Uuid) {
      if (!ofOrg(organizationId)) return [];
      return depsA.filter((d) => d.projectId === projectId);
    },
    async progressEntriesByProject(organizationId: Uuid, projectId: Uuid, taskId?: Uuid) {
      if (!ofOrg(organizationId)) return [];
      return progressA.filter(
        (e) => e.projectId === projectId && (taskId === undefined || e.taskId === taskId),
      );
    },
    async resourceAssignmentsByProject(organizationId: Uuid, projectId: Uuid, taskId?: Uuid) {
      if (!ofOrg(organizationId)) return [];
      return assignmentsA.filter(
        (a) => a.projectId === projectId && (taskId === undefined || a.taskId === taskId),
      );
    },
    async resourcesByIds(ids: readonly Uuid[]) {
      return resources.filter((r) => ids.includes(r.id));
    },
    async laborRolesByIds(ids: readonly Uuid[]) {
      return laborRoles.filter((r) => ids.includes(r.id));
    },
  };
  return fake as unknown as DrizzleReadRepository;
}

const repo = new DrizzleReadModelRepository(makeFakeRepo());

const internalViewer: ViewerContext = { organizationId: ORG_A, role: 'internal' };
const clientViewer: ViewerContext = { organizationId: ORG_A, role: 'client' };
const otherOrgViewer: ViewerContext = { organizationId: ORG_B, role: 'internal' };

describe('DrizzleReadModelRepository — getSchedule (estructura)', () => {
  it('arma tareas, dependencias e hitos del proyecto', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT_A);
    expect(schedule.projectId).toBe(PROJECT_A);
    expect(schedule.tasks.length).toBe(3);
    expect(schedule.dependencies.length).toBe(1);
    expect(schedule.milestones.length).toBe(1);
    expect(schedule.milestones[0]!.id).toBe(MILESTONE);
  });

  it('agrega physicalProgressPct dentro de [0,100]', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT_A);
    const pct = Number(schedule.physicalProgressPct);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('DrizzleReadModelRepository — proyección por rol', () => {
  it('rol client no recibe holguras/ruta crítica ni criticalPath', async () => {
    const schedule = await repo.getSchedule(clientViewer, PROJECT_A);
    for (const t of schedule.tasks) {
      expect('totalFloatDays' in t).toBe(false);
      expect('isCritical' in t).toBe(false);
    }
    expect('criticalPath' in schedule).toBe(false);
  });

  it('rol client no recibe financialProgressPct/notes en avances', async () => {
    const entries = await repo.listProgressEntries(clientViewer, PROJECT_A);
    expect(entries.length).toBe(1);
    expect('financialProgressPct' in entries[0]!).toBe(false);
    expect('notes' in entries[0]!).toBe(false);
  });

  it('rol internal recibe financialProgressPct/notes y recordedAt en ISO', async () => {
    const entries = await repo.listProgressEntries(internalViewer, PROJECT_A);
    expect(entries[0]!.financialProgressPct).toBe('28.0000');
    expect(entries[0]!.notes).toBe('Avance parcial');
    expect(entries[0]!.recordedAt).toBe('2026-06-20T22:00:00.000Z');
  });

  it('rol client no recibe notes internas en asignaciones', async () => {
    const assignments = await repo.listResourceAssignments(clientViewer, PROJECT_A);
    expect('notes' in assignments[0]!).toBe(false);
    // Los nombres resueltos sí son cliente-safe.
    expect(assignments[0]!.resourceName).toBe('Oficial de obra');
    expect(assignments[0]!.laborRoleName).toBe('Oficial');
  });
});

describe('DrizzleReadModelRepository — aislamiento multitenant (planning)', () => {
  it('viewer de otra organización no encuentra el proyecto (ProjectNotFoundError)', async () => {
    await expect(repo.getSchedule(otherOrgViewer, PROJECT_A)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(
      repo.listProgressEntries(otherOrgViewer, PROJECT_A),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(
      repo.listResourceAssignments(otherOrgViewer, PROJECT_A),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
