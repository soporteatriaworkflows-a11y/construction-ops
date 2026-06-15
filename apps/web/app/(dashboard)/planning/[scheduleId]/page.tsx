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
import { getScheduleDetailForViewer, displayWbs, ScheduleNotFoundError } from '@/server/planning';
import { buildPlanningViewModel, mapScheduleToGantt } from '@/modules/planning';
import { PlanningSummary } from '@/components/planning/planning-summary';
import { ScheduleTable } from '@/components/planning/schedule-table';
import { GanttChart } from '@/components/planning/gantt-chart';
import { ScheduleManagePanel, type EditableTask } from './schedule-manage-panel';
import { ScheduleWorkspace, type WorkspaceTask } from './schedule-workspace';

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
    wbsCode: displayWbs(t.wbsCode),
    name: t.name,
    taskType: t.taskType,
    isMilestone: t.isMilestone,
    progressPct: t.progressPct,
    durationDays: t.plannedDurationDays,
    responsible: t.responsible,
    crewLabel: t.crewLabel,
    crewSize: t.crewSize,
  }));

  // Tareas aplanadas para el workspace (UX Fase 1): combina el view-model (fechas,
  // avance, brecha, holgura, crítica) con la trazabilidad cruda (tipo, capítulo,
  // rendimiento, vínculos BOQ/APU). Sólo presentación; no recalcula nada.
  const rawById = new Map(rawTasks.map((r) => [r.id, r]));
  const workspaceTasks: WorkspaceTask[] = vm.tasks.map((t) => {
    const r = rawById.get(t.id);
    return {
      id: t.id,
      wbsCode: t.wbsCode, // ya viene en forma display desde el read-model
      name: t.name,
      parentTaskId: t.parentTaskId ?? null,
      taskType: (r?.taskType as 'chapter' | 'activity' | 'milestone' | null) ?? null,
      isMilestone: t.isMilestone,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      plannedDurationDays: t.plannedDurationDays,
      progressPct: t.progressPct,
      status: t.status,
      varianceStatus: t.varianceStatus,
      totalFloatDays: t.totalFloatDays,
      isCritical: t.isCritical,
      productivitySource: r?.productivitySource ?? null,
      apuTemplateId: r?.apuTemplateId ?? null,
      boqItemId: r?.boqItemId ?? null,
    };
  });

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

      {/* Tareas y avance: workspace navegable (búsqueda/filtros/capítulos colapsables). */}
      <section aria-label="Tareas del cronograma" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Tareas y avance</h2>
        <ScheduleWorkspace tasks={workspaceTasks} canSeeCriticalPath={canSeeCriticalPath} />
      </section>

      {/* Gantt: pesado para 160 tareas; colapsado por defecto para aligerar la pantalla. */}
      <section aria-label="Diagrama de Gantt" className="mb-6">
        <details className="rounded-md border border-gray-200">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Diagrama de Gantt
          </summary>
          <div className="px-3 pb-3 pt-1">
            <GanttChart tasks={ganttTasks} />
          </div>
        </details>
      </section>

      {/* Tabla detallada plan vs real (Esperado/Brecha): disponible, colapsada. */}
      <section aria-label="Tabla detallada de avance" className="mb-6">
        <details className="rounded-md border border-gray-200">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Tabla detallada (esperado / brecha)
          </summary>
          <div className="px-3 pb-3 pt-1">
            <ScheduleTable tasks={vm.tasks} canSeeCriticalPath={canSeeCriticalPath} />
          </div>
        </details>
      </section>

      {/* Trazabilidad BOQ/APU + rendimiento + advertencias (read-only). */}
      {(() => {
        const activities = rawTasks.filter((t) => t.taskType === 'activity');
        if (activities.length === 0) return null;
        const noApu = activities.filter((t) => !t.apuTemplateId).length;
        const noYield = activities.filter((t) => t.productivitySource === 'unknown').length;
        return (
          <section aria-label="Trazabilidad y rendimiento" className="mb-6">
            <details className="rounded-md border border-gray-200">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
                Trazabilidad BOQ/APU y rendimiento
                {(noApu > 0 || noYield > 0) && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {noApu + noYield} advertencia(s)
                  </span>
                )}
              </summary>
              <div className="px-3 pb-3 pt-1">
            {(noApu > 0 || noYield > 0) && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {noApu > 0 && <span className="mr-3">⚠ {noApu} actividad(es) sin APU vinculado (duración manual).</span>}
                {noYield > 0 && <span>⚠ {noYield} actividad(es) con APU sin rendimiento usable (duración manual).</span>}
              </div>
            )}
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Actividad</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2 font-medium">Unidad</th>
                    <th className="px-3 py-2 text-right font-medium">Duración (d)</th>
                    <th className="px-3 py-2 font-medium">Rendimiento</th>
                    <th className="px-3 py-2 font-medium">Vínculos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activities.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{displayWbs(t.wbsCode)}</td>
                      <td className="px-3 py-2 text-gray-800">{t.name}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {t.quantitySnapshot ? Number(t.quantitySnapshot).toLocaleString('es-CO') : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{t.unitSnapshot ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{Number(t.plannedDurationDays)}</td>
                      <td className="px-3 py-2">
                        <ProductivityBadge source={t.productivitySource} />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={t.boqItemId ? 'text-green-700' : 'text-gray-400'}>BOQ {t.boqItemId ? '✓' : '—'}</span>
                        <span className={`ml-2 ${t.apuTemplateId ? 'text-green-700' : 'text-gray-400'}`}>APU {t.apuTemplateId ? '✓' : '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </div>
            </details>
          </section>
        );
      })()}

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

function ProductivityBadge({ source }: { source: string | null }) {
  if (source === 'apu') return <Badge variant="success">Rendimiento APU</Badge>;
  if (source === 'unknown') return <Badge variant="warning">Sin rendimiento</Badge>;
  if (source === 'manual') return <Badge variant="secondary">Manual (sin APU)</Badge>;
  return <span className="text-gray-400">—</span>;
}
