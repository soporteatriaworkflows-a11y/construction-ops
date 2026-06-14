/**
 * Página de planificación / cronograma — Oleada 3B.
 * Server Component. Propiedad: agent-planning.
 *
 * Consume el read-model canónico (@/server/read-model.getSchedule) en lugar de
 * mocks. NO calcula finanzas ni CPM en React: la ruta crítica/holguras provienen
 * del dominio `@/modules/planning` (server-side). Los campos 🔒 (holguras, ruta
 * crítica, notas, recursos internos, costos, external_reference) NO se exponen a
 * rol `client`.
 */
import { CalendarRange } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { buildPlanningViewModel, mapScheduleToGantt } from '@/modules/planning';
import { PlanningSummary } from '@/components/planning/planning-summary';
import { ScheduleTable } from '@/components/planning/schedule-table';
import { GanttChart } from '@/components/planning/gantt-chart';

// Render request-time: viewer real por modo (db=autenticado, fixture=demo).
// En modo `db` el cronograma proviene del proyecto real; sin proyectos ⇒ empty state.
export const dynamic = 'force-dynamic';

export default async function PlanningPage() {
  const rm = getReadModel();

  // Viewer real por modo + proyecto activo derivado de la lista real (sin UUID demo).
  let projectId: string | null = null;
  let projectName = 'Proyecto';
  let canSeeCriticalPath = true;
  let summary: Awaited<ReturnType<typeof rm.getSchedule>> | null = null;
  let error: string | null = null;
  try {
    const viewer = await resolveViewer();
    canSeeCriticalPath = viewer.role !== 'client';
    const projects = await rm.listProjects(viewer);
    const p = projects[0];
    if (p) {
      projectId = p.id;
      projectName = p.name;
    }
    if (projectId) {
      summary = await rm.getSchedule(viewer, projectId);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar el cronograma';
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Cronograma de obra" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar el cronograma: {error}
        </div>
      </div>
    );
  }

  if (!summary || summary.tasks.length === 0) {
    return (
      <div>
        <PageHeader title="Cronograma de obra" description={projectName} />
        <EmptyState
          icon={CalendarRange}
          title="Todavía no hay planificación generada"
          description="Crea una planificación desde un presupuesto para estimar duraciones, dependencias y recursos de obra."
        />
      </div>
    );
  }

  const vm = buildPlanningViewModel(summary, {
    canSeeCriticalPath,
    asOfDate: new Date().toISOString().slice(0, 10),
  });
  const ganttTasks = mapScheduleToGantt(summary.tasks, summary.dependencies, {
    criticalTaskIds: canSeeCriticalPath ? vm.criticalTaskIds : [],
  });

  return (
    <div>
      <PageHeader
        title="Cronograma de obra"
        description={`${projectName} — ${summary.tasks.length} tareas · ${summary.milestones.length} hitos`}
      />

      {/* Resumen del cronograma */}
      <section aria-label="Resumen del cronograma" className="mb-6">
        <PlanningSummary
          physicalProgressPct={vm.physicalProgressPct}
          milestoneCount={summary.milestones.length}
          delayCount={vm.delayAlerts.length}
          criticalPath={canSeeCriticalPath ? vm.criticalPath : undefined}
        />
      </section>

      {/* Vista Gantt */}
      <section aria-label="Diagrama de Gantt" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Diagrama de Gantt
        </h2>
        <GanttChart tasks={ganttTasks} />
      </section>

      {/* Tabla de tareas */}
      <section aria-label="Tareas del cronograma">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Tareas y avance
        </h2>
        <ScheduleTable tasks={vm.tasks} canSeeCriticalPath={canSeeCriticalPath} />
      </section>

      {/* Hitos */}
      {summary.milestones.length > 0 && (
        <section aria-label="Hitos" className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Hitos
          </h2>
          <ul className="flex flex-wrap gap-2">
            {summary.milestones.map((m) => (
              <li
                key={m.id}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700"
              >
                <CalendarRange className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                <span className="font-medium">{m.name}</span>
                <span className="text-gray-400">{m.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
