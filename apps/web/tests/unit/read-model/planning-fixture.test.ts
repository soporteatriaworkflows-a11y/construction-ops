/**
 * planning-fixture.test.ts — El `FixtureReadModelRepository` sirve el cronograma
 * de planificación (Oleada 3B) desde el fixture sanitizado: tareas, dependencias,
 * hitos, avance (append-only) y recursos. Verifica proyección por rol
 * (privacidad backend-first), aislamiento por organización y errores.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import { FixtureReadModelRepository } from '@/server/read-model/fixture-repository';
import { ProjectNotFoundError } from '@/server/read-model/errors';
import type { ViewerContext } from '@/lib/contracts/read-model';
import fixture from '../../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

const ORG = fixture.organization.id;
const PROJECT = fixture.project.id;
const MASONRY_TASK = '0d000000-0000-4000-8000-000000000002';
const MILESTONE_TASK = '0d000000-0000-4000-8000-000000000006';

const internalViewer: ViewerContext = { organizationId: ORG, role: 'internal' };
const managementViewer: ViewerContext = { organizationId: ORG, role: 'management' };
const siteViewer: ViewerContext = { organizationId: ORG, role: 'site' };
// `projectGrants: 'all'`: aquí se valida la PROYECCIÓN por rol, no el alcance
// por proyecto (V5.6.4; el scope se prueba en project-grants.test.ts).
const clientViewer: ViewerContext = { organizationId: ORG, role: 'client', projectGrants: 'all' };
const otherOrgViewer: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-0000000000ff',
  role: 'internal',
};

const repo = new FixtureReadModelRepository();

describe('FixtureReadModelRepository — getSchedule (estructura del cronograma)', () => {
  it('devuelve todas las tareas, dependencias e hitos del proyecto', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT);
    expect(schedule.projectId).toBe(PROJECT);
    expect(schedule.tasks.length).toBe(fixture.planning.scheduleTasks.length);
    expect(schedule.dependencies.length).toBe(fixture.planning.taskDependencies.length);
    // Un único hito (M1).
    expect(schedule.milestones.length).toBe(1);
    expect(schedule.milestones[0]!.id).toBe(MILESTONE_TASK);
  });

  it('ordena las tareas por sortOrder y preserva la jerarquía WBS', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT);
    const orders = schedule.tasks.map((t) => t.sortOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    const sub = schedule.tasks.find((t) => t.wbsCode === '2.1');
    expect(sub?.parentTaskId).toBe(MASONRY_TASK);
  });

  it('el hito tiene duración 0 (start = end) y es isMilestone', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT);
    const m = schedule.tasks.find((t) => t.id === MILESTONE_TASK)!;
    expect(m.isMilestone).toBe(true);
    expect(m.plannedStart).toBe(m.plannedEnd);
    expect(Number(m.plannedDurationDays)).toBe(0);
  });

  it('expone dependencias FS y SS con lag', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT);
    const types = schedule.dependencies.map((d) => d.dependencyType);
    expect(types).toContain('FS');
    expect(types).toContain('SS');
    const ss = schedule.dependencies.find((d) => d.dependencyType === 'SS')!;
    expect(Number(ss.lagDays)).toBe(8);
  });

  it('agrega physicalProgressPct ponderado por duración (DecimalString 0..100)', async () => {
    const schedule = await repo.getSchedule(internalViewer, PROJECT);
    const pct = Number(schedule.physicalProgressPct);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('FixtureReadModelRepository — proyección por rol (privacidad backend-first)', () => {
  it('rol client NO recibe campos 🔒 de tarea (holguras/ruta crítica) ni criticalPath', async () => {
    const schedule = await repo.getSchedule(clientViewer, PROJECT);
    for (const t of schedule.tasks) {
      expect('totalFloatDays' in t).toBe(false);
      expect('freeFloatDays' in t).toBe(false);
      expect('isCritical' in t).toBe(false);
    }
    expect('criticalPath' in schedule).toBe(false);
  });

  it('rol client NO recibe financialProgressPct ni notes en avances', async () => {
    const entries = await repo.listProgressEntries(clientViewer, PROJECT);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect('financialProgressPct' in e).toBe(false);
      expect('notes' in e).toBe(false);
    }
  });

  it('rol client NO recibe notes internas en asignaciones de recursos', async () => {
    const assignments = await repo.listResourceAssignments(clientViewer, PROJECT);
    expect(assignments.length).toBeGreaterThan(0);
    for (const a of assignments) {
      expect('notes' in a).toBe(false);
    }
  });

  it('roles management/internal/site SÍ reciben los campos internos de avance', async () => {
    for (const viewer of [managementViewer, internalViewer, siteViewer]) {
      const entries = await repo.listProgressEntries(viewer, PROJECT);
      const withFinancial = entries.find((e) => e.financialProgressPct != null);
      expect(withFinancial).toBeDefined();
      const withNotes = entries.find((e) => e.notes != null);
      expect(withNotes).toBeDefined();
    }
  });
});

describe('FixtureReadModelRepository — avances (append-only) y recursos', () => {
  it('listProgressEntries por tarea filtra correctamente y respeta orden cronológico', async () => {
    const entries = await repo.listProgressEntries(internalViewer, PROJECT, MASONRY_TASK);
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.taskId === MASONRY_TASK)).toBe(true);
    const times = entries.map((e) => Date.parse(e.recordedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('listResourceAssignments resuelve nombres de recurso y rol de obra', async () => {
    const assignments = await repo.listResourceAssignments(internalViewer, PROJECT, MASONRY_TASK);
    expect(assignments.length).toBe(1);
    const a = assignments[0]!;
    expect(a.resourceName).toBe('Oficial de construcción');
    expect(a.laborRoleName).toBe('Oficial');
    expect(a.unit).toBe('cuadrilla');
  });
});

describe('FixtureReadModelRepository — aislamiento por organización (planning)', () => {
  it('getSchedule de otra organización lanza ProjectNotFoundError', async () => {
    await expect(repo.getSchedule(otherOrgViewer, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('listProgressEntries de otra organización lanza ProjectNotFoundError', async () => {
    await expect(repo.listProgressEntries(otherOrgViewer, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('listResourceAssignments de otra organización lanza ProjectNotFoundError', async () => {
    await expect(
      repo.listResourceAssignments(otherOrgViewer, PROJECT),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('getSchedule de un proyecto inexistente lanza ProjectNotFoundError', async () => {
    await expect(
      repo.getSchedule(internalViewer, '00000000-0000-4000-8000-000000000999'),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
