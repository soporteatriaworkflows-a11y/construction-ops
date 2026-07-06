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
import { getScheduleDetailForViewer, getScheduleContextForViewer, displayWbs, ScheduleNotFoundError } from '@/server/planning';
import { buildPlanningViewModel, buildScheduleDurationReport, mapScheduleToGantt } from '@/modules/planning';
import { PlanningSummary } from '@/components/planning/planning-summary';
import { ScheduleTable } from '@/components/planning/schedule-table';
import { GanttChart } from '@/components/planning/gantt-chart';
import { formatDate } from '@/lib/utils/format';
import { ScheduleManagePanel, type EditableTask } from './schedule-manage-panel';
import { ScheduleDetailShell } from './schedule-detail-shell';
import type { WorkspaceTask } from './schedule-workspace-filter';

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
  let viewerProfileRole: string | null = null;
  let error: string | null = null;
  try {
    const viewer = await resolveAuthenticatedViewer();
    viewerProfileRole = viewer.profileRole ?? null;
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
  // P2C1: contexto de negocio (proyecto/alcance/presupuesto) para el header.
  // Lectura ligera SECUENCIAL (una consulta anidada, disciplina P0B); si falla
  // o falta la cadena, degrada a fallback amable sin tumbar la página.
  const context = await getScheduleContextForViewer(schedule.estimateVersionId);
  const isClientSafe = viewerProfileRole === 'consulta';
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

  // Tareas aplanadas para el workspace (UX): combina el view-model (fechas, avance,
  // brecha, holgura, crítica) con la trazabilidad cruda (tipo, capítulo, rendimiento,
  // vínculos BOQ/APU, responsable, cuadrilla). Sólo presentación; no recalcula nada.
  const rawById = new Map(rawTasks.map((r) => [r.id, r]));
  const chapterNameById = new Map(
    rawTasks.filter((r) => r.taskType === 'chapter').map((r) => [r.id, r.name]),
  );
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
      chapterName: t.parentTaskId ? chapterNameById.get(t.parentTaskId) ?? null : null,
      responsible: r?.responsible ?? null,
      crewLabel: r?.crewLabel ?? null,
      crewSize: r?.crewSize ?? null,
      quantitySnapshot: r?.quantitySnapshot ?? null,
      unitSnapshot: r?.unitSnapshot ?? null,
    };
  });

  const activities = rawTasks.filter((t) => t.taskType === 'activity');
  const noApu = activities.filter((t) => !t.apuTemplateId).length;
  const noYield = activities.filter((t) => t.productivitySource === 'unknown').length;

  // P2C4a: reporte puro de criterio de duración (sin queries; solo advierte).
  const durationReport = buildScheduleDurationReport(workspaceTasks);

  // Nodos para las pestañas de la shell (Gantt/Trazabilidad/Edición), renderizados
  // por el servidor con los componentes existentes SIN modificarlos.
  const ganttNode = <GanttChart tasks={ganttTasks} />;

  const traceNode = isClientSafe ? (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
          Este cronograma no tiene actividades visibles para trazabilidad.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Codigo</th>
                <th className="px-3 py-2 font-medium">Tarea</th>
                <th className="px-3 py-2 font-medium">Inicio</th>
                <th className="px-3 py-2 font-medium">Fin</th>
                <th className="px-3 py-2 text-right font-medium">Duracion</th>
                <th className="px-3 py-2 text-right font-medium">Avance</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activities.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{displayWbs(t.wbsCode)}</td>
                  <td className="px-3 py-2 text-gray-800">{t.name}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDate(t.plannedStart)}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDate(t.plannedEnd)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{Number(t.plannedDurationDays)} d</td>
                  <td className="px-3 py-2 text-right text-gray-600">{Number(t.progressPct ?? 0).toFixed(0)}%</td>
                  <td className="px-3 py-2"><span className="text-xs text-gray-600">{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
          Este cronograma no tiene actividades trazables.
        </p>
      ) : (
        <>
          {(noApu > 0 || noYield > 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {noApu > 0 && <span className="mr-3">Aviso: {noApu} actividad(es) sin APU vinculado (duracion manual).</span>}
              {noYield > 0 && <span>Aviso: {noYield} actividad(es) con APU sin rendimiento usable (duracion manual).</span>}
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Codigo</th>
                  <th className="px-3 py-2 font-medium">Actividad</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 text-right font-medium">Duracion (d)</th>
                  <th className="px-3 py-2 font-medium">Rendimiento</th>
                  <th className="px-3 py-2 font-medium">Vinculos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{displayWbs(t.wbsCode)}</td>
                    <td className="px-3 py-2 text-gray-800">{t.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {t.quantitySnapshot ? Number(t.quantitySnapshot).toLocaleString('es-CO') : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.unitSnapshot ?? '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{Number(t.plannedDurationDays)}</td>
                    <td className="px-3 py-2"><ProductivityBadge source={t.productivitySource} /></td>
                    <td className="px-3 py-2 text-xs">
                      <span className={t.boqItemId ? 'text-green-700' : 'text-gray-400'}>BOQ {t.boqItemId ? 'si' : '-'}</span>
                      <span className={t.apuTemplateId ? 'ml-2 text-green-700' : 'ml-2 text-gray-400'}>APU {t.apuTemplateId ? 'si' : '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Tabla detallada plan vs real (esperado/brecha) preservada bajo disclosure. */}
          <details className="rounded-md border border-gray-200">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-600">
              Tabla detallada (esperado / brecha)
            </summary>
            <div className="max-h-[55vh] overflow-auto px-3 pb-3 pt-1">
              <ScheduleTable tasks={vm.tasks} canSeeCriticalPath={canSeeCriticalPath} />
            </div>
          </details>
        </>
      )}
    </div>
  );

  const editNode = canManage ? (
    <ScheduleManagePanel
      scheduleId={schedule.id}
      tasks={editableTasks}
      isArchived={schedule.status === 'archived'}
    />
  ) : null;

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
        breadcrumb={
          // P2C1: contexto claro — SOLO nombres y navegación, sin montos.
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <span>
              Proyecto:{' '}
              <Link href={`/projects/${schedule.projectId}`} className="font-medium text-blue-700 hover:underline">
                {context?.projectName ?? 'Proyecto'}
              </Link>
            </span>
            <span aria-hidden="true">·</span>
            <span>Alcance: {context?.scopeName ?? 'Alcance no definido'}</span>
            <span aria-hidden="true">·</span>
            <span>
              Presupuesto:{' '}
              {context?.estimateName
                ? `${context.estimateName} · v${context.versionNumber}`
                : 'No disponible'}
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={schedule.status === 'archived' ? 'outline' : 'secondary'}>
              {STATUS_LABEL[schedule.status] ?? schedule.status}
            </Badge>
            <Link
              href={`/projects/${schedule.projectId}`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ver proyecto
            </Link>
            {context?.estimateId && context.scopeId && context.projectId && (
              <Link
                href={`/projects/${context.projectId}/scopes/${context.scopeId}/estimates/${context.estimateId}/workspace`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Ver presupuesto
              </Link>
            )}
          </div>
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

      {/* P2C4a: indicador global de criterio de duración — señal INTERNA de
          calidad de datos (consulta NO lo ve). Solo advierte; nunca bloquea. */}
      {!isClientSafe && (durationReport.outOfRangeCount > 0 || schedule.status === 'draft') && (
        <section aria-label="Criterio de duración" className="mb-6 space-y-2">
          {durationReport.outOfRangeCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este cronograma dura {durationReport.totalDays} días. Hay {durationReport.outOfRangeCount}{' '}
              actividad(es) fuera del rango sugerido
              {durationReport.highCount > 0 && ` · ${durationReport.highCount} con duración inusualmente alta`}
              {durationReport.lowCount > 0 && ` · ${durationReport.lowCount} con duración inusualmente baja`}
              . Revisar antes de publicar.
            </div>
          )}
          {schedule.status === 'draft' && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Cronograma en borrador con datos estimados.
            </div>
          )}
        </section>
      )}

      {/* Workspace maestro-detalle con pestañas (Tareas / Gantt / Trazabilidad / Edición). */}
      <ScheduleDetailShell
        scheduleId={schedule.id}
        tasks={workspaceTasks}
        canSeeCriticalPath={canSeeCriticalPath}
        warningCount={isClientSafe ? 0 : noApu + noYield}
        gantt={ganttNode}
        trace={traceNode}
        edit={editNode}
        clientSafe={isClientSafe}
        canEditDuration={canManage && schedule.status !== 'archived'}
      />
    </div>
  );
}

function ProductivityBadge({ source }: { source: string | null }) {
  if (source === 'apu') return <Badge variant="success">Rendimiento APU</Badge>;
  if (source === 'unknown') return <Badge variant="warning">Sin rendimiento</Badge>;
  if (source === 'manual') return <Badge variant="secondary">Manual (sin APU)</Badge>;
  return <span className="text-gray-400">—</span>;
}
