/**
 * /planning/[scheduleId] — Detalle tipo MS Project (planificación de obra, Fase 4–5).
 * Server Component. Reutiliza los componentes 3B (PlanningSummary, GanttChart,
 * ScheduleTable) sobre el cronograma seleccionado y agrega edición controlada.
 * Campos 🔒 (ruta crítica/holguras) ocultos a `client`.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { getScheduleDetailForViewer, ScheduleNotFoundError } from '@/server/planning';
import { buildPlanningViewModel, mapScheduleToGantt } from '@/modules/planning';
import { PlanningSummary } from '@/components/planning/planning-summary';
import { ScheduleTable } from '@/components/planning/schedule-table';
import { GanttChart } from '@/components/planning/gantt-chart';
import { ScheduleManagePanel, type EditableTask } from './schedule-manage-panel';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  baseline: 'Línea base',
  active: 'Activo',
  archived: 'Archivado',
};

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;

  let detail: Awaited<ReturnType<typeof getScheduleDetailForViewer>> | null = null;
  let error: string | null = null;
  try {
    const viewer = await resolveAuthenticatedViewer();
    detail = await getScheduleDetailForViewer(viewer, scheduleId);
  } catch (e) {
    if (e instanceof ScheduleNotFoundError) notFound();
    error = e instanceof Error ? e.message : 'Error al cargar el cronograma';
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Cronograma" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      </div>
    );
  }
  if (!detail) notFound();

  const { schedule, summary, rawTasks, canManage, canSeeCriticalPath } = detail;
  const vm = buildPlanningViewModel(summary, {
    canSeeCriticalPath,
    asOfDate: new Date().toISOString().slice(0, 10),
  });
  const ganttTasks = mapScheduleToGantt(summary.tasks, summary.dependencies, {
    criticalTaskIds: canSeeCriticalPath ? vm.criticalTaskIds : [],
  });

  const editableTasks: EditableTask[] = rawTasks.map((t) => ({
    id: t.id,
    wbsCode: t.wbsCode,
    name: t.name,
    taskType: t.taskType,
    isMilestone: t.isMilestone,
    progressPct: t.progressPct,
    durationDays: t.plannedDurationDays,
    responsible: t.responsible,
    crewLabel: t.crewLabel,
    crewSize: t.crewSize,
  }));

  return (
    <div>
      <Link
        href="/planning"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a cronogramas
      </Link>
      <PageHeader
        title={schedule.name}
        description={`${summary.tasks.length} tareas · ${summary.milestones.length} hitos · ${schedule.startDate} → ${schedule.endDate ?? '—'}`}
        actions={
          <Badge variant={schedule.status === 'archived' ? 'outline' : 'secondary'}>
            {STATUS_LABEL[schedule.status] ?? schedule.status}
          </Badge>
        }
      />

      <section aria-label="Resumen del cronograma" className="mb-6">
        <PlanningSummary
          physicalProgressPct={vm.physicalProgressPct}
          milestoneCount={summary.milestones.length}
          delayCount={vm.delayAlerts.length}
          criticalPath={canSeeCriticalPath ? vm.criticalPath : undefined}
        />
      </section>

      <section aria-label="Diagrama de Gantt" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Diagrama de Gantt</h2>
        <GanttChart tasks={ganttTasks} />
      </section>

      <section aria-label="Tareas del cronograma" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Tareas y avance</h2>
        <ScheduleTable tasks={vm.tasks} canSeeCriticalPath={canSeeCriticalPath} />
      </section>

      {canManage && (
        <section aria-label="Edición del cronograma">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Edición</h2>
          <ScheduleManagePanel
            scheduleId={schedule.id}
            tasks={editableTasks}
            isArchived={schedule.status === 'archived'}
          />
        </section>
      )}
    </div>
  );
}
