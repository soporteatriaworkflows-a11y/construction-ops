/**
 * schedule-service.test.ts — Servicio server-side de planificación (Fase 4–5).
 * Propiedad: agent-orchestrator. Usa un repositorio FAKE (sin DB) para verificar:
 * preview no escribe, create persiste, permisos y mapeo del detalle.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  previewScheduleFromBoq,
  createScheduleFromBoq,
  listSchedulesForViewer,
  getScheduleDetailForViewer,
  canManageSchedules,
  canUpdateScheduleProgress,
  canViewSchedules,
  SchedulePermissionError,
  type PlanningRepository,
  type GeneratorSourceRow,
  type ScheduleRow,
  type ScheduleTaskRow,
} from '@/server/planning';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerRole } from '@/lib/contracts/read-model';

function viewer(role: ViewerRole): AuthenticatedViewer {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    profileId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-0000000000a1',
    role,
  };
}

const CH1 = '00000000-0000-4000-8000-0000000000c1';
const I1 = '00000000-0000-4000-8000-000000000101';
const I2 = '00000000-0000-4000-8000-000000000102';
const APU1 = '00000000-0000-4000-8000-0000000000a9';
const VERSION = '00000000-0000-4000-8000-000000000311';
const PROJECT = '00000000-0000-4000-8000-0000000000c0';

function fakeSource(): GeneratorSourceRow {
  return {
    projectId: PROJECT,
    chapters: [{ id: CH1, code: '01', name: 'Preliminares', sortOrder: 0 }],
    items: [
      {
        boqItemId: I1,
        chapterId: CH1,
        code: 'ITM-1',
        description: 'Excavación',
        unit: 'm3',
        quantity: '100',
        apuTemplateId: APU1,
      },
      {
        boqItemId: I2,
        chapterId: CH1,
        code: 'ITM-2',
        description: 'Sin APU',
        unit: 'gl',
        quantity: '1',
        apuTemplateId: null,
      },
    ],
    apuLaborPersonDays: new Map([[APU1, '0.2']]),
  };
}

const baseParams = {
  estimateVersionId: VERSION,
  scheduleName: 'Cronograma A',
  startDate: '2026-07-01',
  includeChapters: true,
  onlyPositiveQuantity: true,
  includeItemsWithoutApu: true,
  createChapterMilestones: false,
  minDurationDays: 1,
  defaultCrewSize: '2',
};

/** Repositorio fake: registra llamadas; sin DB. */
function makeRepo(over: Partial<PlanningRepository> = {}) {
  const calls = {
    createScheduleFromBoq: vi.fn(),
    updateTask: vi.fn(),
    insertDependency: vi.fn(),
    archiveSchedule: vi.fn(),
    setScheduleEndDate: vi.fn(),
  };
  const repo = {
    loadGeneratorSource: vi.fn(async () => fakeSource()),
    createScheduleFromBoq: vi.fn(async (p: unknown) => {
      calls.createScheduleFromBoq(p);
      return { scheduleId: 'sched-1' };
    }),
    listProjectVersionOptions: vi.fn(async () => []),
    listSchedules: vi.fn(async () => []),
    getSchedule: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    listDependencies: vi.fn(async () => []),
    updateTask: vi.fn(async (...a: unknown[]) => {
      calls.updateTask(...a);
      return {};
    }),
    insertDependency: vi.fn(async (...a: unknown[]) => {
      calls.insertDependency(...a);
      return {};
    }),
    archiveSchedule: vi.fn(async (...a: unknown[]) => {
      calls.archiveSchedule(...a);
      return {};
    }),
    setScheduleEndDate: vi.fn(async (...a: unknown[]) => {
      calls.setScheduleEndDate(...a);
    }),
    ...over,
  } as unknown as PlanningRepository;
  return { repo, calls };
}

describe('permisos de cronograma', () => {
  it('canManageSchedules: internal/management sí; site/client no', () => {
    expect(canManageSchedules('internal')).toBe(true);
    expect(canManageSchedules('management')).toBe(true);
    expect(canManageSchedules('site')).toBe(false);
    expect(canManageSchedules('client')).toBe(false);
  });
  it('canUpdateScheduleProgress: internal/management/site sí; client no', () => {
    expect(canUpdateScheduleProgress('site')).toBe(true);
    expect(canUpdateScheduleProgress('client')).toBe(false);
  });
  it('canViewSchedules: todos', () => {
    expect(canViewSchedules('client')).toBe(true);
  });
});

describe('previewScheduleFromBoq', () => {
  it('NO escribe durante el preview (solo lee la fuente)', async () => {
    const { repo, calls } = makeRepo();
    const preview = await previewScheduleFromBoq(viewer('internal'), baseParams, repo);
    expect(preview.tasks.length).toBeGreaterThan(0);
    expect(calls.createScheduleFromBoq).not.toHaveBeenCalled();
    expect(calls.updateTask).not.toHaveBeenCalled();
    expect(calls.insertDependency).not.toHaveBeenCalled();
  });

  it('produce duración por rendimiento APU y warning sin APU', async () => {
    const { repo } = makeRepo();
    const preview = await previewScheduleFromBoq(viewer('management'), baseParams, repo);
    const a1 = preview.tasks.find((t) => t.boqItemId === I1)!;
    expect(a1.productivitySource).toBe('apu');
    expect(a1.durationDays).toBe(10); // 100 × 0.2 / 2
    expect(preview.warnings.some((w) => w.kind === 'no_apu' && w.boqItemId === I2)).toBe(true);
  });

  it('rechaza a un rol sin permiso (client)', async () => {
    const { repo } = makeRepo();
    await expect(previewScheduleFromBoq(viewer('client'), baseParams, repo)).rejects.toBeInstanceOf(
      SchedulePermissionError,
    );
  });
});

describe('createScheduleFromBoq', () => {
  it('persiste schedule + tareas vía repositorio con el payload generado', async () => {
    const { repo, calls } = makeRepo();
    const id = await createScheduleFromBoq(viewer('internal'), baseParams, repo);
    expect(id).toBe('sched-1');
    expect(calls.createScheduleFromBoq).toHaveBeenCalledTimes(1);
    const payload = calls.createScheduleFromBoq.mock.calls[0]![0] as {
      projectId: string;
      estimateVersionId: string;
      tasks: { taskType: string }[];
    };
    expect(payload.projectId).toBe(PROJECT);
    expect(payload.estimateVersionId).toBe(VERSION);
    // 1 capítulo + 2 actividades.
    expect(payload.tasks.filter((t) => t.taskType === 'chapter')).toHaveLength(1);
    expect(payload.tasks.filter((t) => t.taskType === 'activity')).toHaveLength(2);
  });

  it('rechaza a un rol sin permiso (site)', async () => {
    const { repo, calls } = makeRepo();
    await expect(createScheduleFromBoq(viewer('site'), baseParams, repo)).rejects.toBeInstanceOf(
      SchedulePermissionError,
    );
    expect(calls.createScheduleFromBoq).not.toHaveBeenCalled();
  });
});

describe('listSchedulesForViewer + getScheduleDetailForViewer', () => {
  const schedule: ScheduleRow = {
    id: 'sched-1',
    projectId: PROJECT,
    estimateVersionId: VERSION,
    name: 'Cronograma A',
    status: 'draft',
    startDate: '2026-07-01',
    endDate: '2026-07-20',
    createdAt: '2026-07-01T00:00:00Z',
    archivedAt: null,
  };
  const tasks: ScheduleTaskRow[] = [
    {
      id: 't-ch', scheduleId: 'sched-1', parentTaskId: null, chapterId: CH1, boqItemId: null,
      apuTemplateId: null, taskType: 'chapter', wbsCode: 'ab.01', name: 'Preliminares',
      unitSnapshot: null, quantitySnapshot: null, plannedStart: '2026-07-01', plannedEnd: '2026-07-20',
      plannedDurationDays: '20', progressPct: '0', status: 'not_started', isMilestone: false,
      productivitySource: null, crewLabel: null, crewSize: null, responsible: null, sortOrder: 0,
    },
    {
      id: 't-a1', scheduleId: 'sched-1', parentTaskId: 't-ch', chapterId: CH1, boqItemId: I1,
      apuTemplateId: APU1, taskType: 'activity', wbsCode: 'ab.01.001', name: 'Excavación',
      unitSnapshot: 'm3', quantitySnapshot: '100', plannedStart: '2026-07-01', plannedEnd: '2026-07-10',
      plannedDurationDays: '10', progressPct: '50', status: 'in_progress', isMilestone: false,
      productivitySource: 'apu', crewLabel: null, crewSize: '2', responsible: null, sortOrder: 1,
    },
  ];

  it('lista cronogramas con avance ponderado por duración', async () => {
    const { repo } = makeRepo({
      listSchedules: vi.fn(async () => [schedule]) as unknown as PlanningRepository['listSchedules'],
      listTasks: vi.fn(async () => tasks) as unknown as PlanningRepository['listTasks'],
    });
    const list = await listSchedulesForViewer(viewer('internal'), undefined, repo);
    expect(list).toHaveLength(1);
    expect(list[0]!.activityCount).toBe(1);
    expect(list[0]!.taskCount).toBe(2);
    // Solo la actividad cuenta (no el capítulo): 50%.
    expect(Number(list[0]!.progressPct)).toBe(50);
  });

  it('detalle proyecta ScheduleSummary reutilizable por los componentes 3B', async () => {
    const { repo } = makeRepo({
      getSchedule: vi.fn(async () => schedule) as unknown as PlanningRepository['getSchedule'],
      listTasks: vi.fn(async () => tasks) as unknown as PlanningRepository['listTasks'],
      listDependencies: vi.fn(async () => []) as unknown as PlanningRepository['listDependencies'],
    });
    const detail = await getScheduleDetailForViewer(viewer('internal'), 'sched-1', repo);
    expect(detail.summary.tasks).toHaveLength(2);
    expect(detail.canManage).toBe(true);
    expect(detail.canSeeCriticalPath).toBe(true);
    expect(Number(detail.summary.physicalProgressPct)).toBe(50);
  });

  it('detalle oculta ruta crítica a client (canSeeCriticalPath=false)', async () => {
    const { repo } = makeRepo({
      getSchedule: vi.fn(async () => schedule) as unknown as PlanningRepository['getSchedule'],
      listTasks: vi.fn(async () => tasks) as unknown as PlanningRepository['listTasks'],
      listDependencies: vi.fn(async () => []) as unknown as PlanningRepository['listDependencies'],
    });
    const detail = await getScheduleDetailForViewer(viewer('client'), 'sched-1', repo);
    expect(detail.canSeeCriticalPath).toBe(false);
    expect(detail.canManage).toBe(false);
  });
});
