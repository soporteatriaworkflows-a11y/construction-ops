/**
 * /planning — Lista de cronogramas (planificación de obra, Fase 4).
 * Server Component. Reemplaza el empty state previo por la lista real de cronogramas
 * + CTA "Crear cronograma desde presupuesto". Solo lectura del read-model de
 * planning; campos 🔒 ocultos a `client` en el detalle.
 */
import Link from 'next/link';
import { CalendarRange, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OperationsHeader } from '@/components/shared/operations-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { createOpsPerfTrace } from '@/server/performance/ops-perf';
import {
  listSchedulesForViewer,
  canManageSchedules,
  type ScheduleListItem,
} from '@/server/planning';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  baseline: 'Línea base',
  active: 'Activo',
  archived: 'Archivado',
};

export default async function PlanningPage() {
  const perf = createOpsPerfTrace('/planning');
  let schedules: ScheduleListItem[] = [];
  let canManage = false;
  let error: string | null = null;
  try {
    const viewer = await perf.span('auth.resolveAuthenticatedViewer', async () => await resolveAuthenticatedViewer());
    canManage = canManageSchedules(viewer.role);
    schedules = await perf.span('planning.listSchedulesForViewer', () => listSchedulesForViewer(viewer, undefined));
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar los cronogramas';
  }

  perf.finish({ scheduleCount: schedules.length, canManage, hasError: Boolean(error) });

  const actions = canManage ? (
    <Button size="sm" asChild>
      <Link href="/planning/new">
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        Crear cronograma desde presupuesto
      </Link>
    </Button>
  ) : undefined;

  if (error) {
    return (
      <div>
        <PageHeader title="Cronogramas de obra" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          Error al cargar los cronogramas: {error}
        </div>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div>
        <PageHeader title="Cronogramas de obra" actions={actions} />
        <EmptyState
          icon={CalendarRange}
          title="Todavía no hay cronogramas"
          description={
            canManage
              ? 'Crea un cronograma desde un presupuesto para estimar duraciones, dependencias y avance de obra.'
              : 'Los cronogramas se generan desde un presupuesto. Pide a tu equipo de presupuestos o gerencia que cree uno.'
          }
        />
      </div>
    );
  }

  return (
    <div>
      <OperationsHeader
        eyebrow="Cronograma"
        title="Planeación de obra"
        subtitle={`${schedules.length} cronograma${schedules.length === 1 ? '' : 's'}`}
        stat={{ label: 'Cronogramas', value: String(schedules.length) }}
        actions={actions}
      />
      <InlineCallout tone="info" title="Cronograma en evolución" className="mb-4">
        El cronograma se genera desde el BOQ del presupuesto. Úsalo como apoyo de planeación; revisa fechas
        y dependencias con criterio antes de comprometer plazos.
      </InlineCallout>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Cronograma</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Inicio</th>
              <th className="px-4 py-2 font-medium">Fin</th>
              <th className="px-4 py-2 text-right font-medium">Tareas</th>
              <th className="px-4 py-2 text-right font-medium">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedules.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/planning/${s.id}`} className="font-medium text-blue-600 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Badge variant={s.status === 'archived' ? 'outline' : 'secondary'}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-gray-600">{s.startDate}</td>
                <td className="px-4 py-2 text-gray-600">{s.endDate ?? '—'}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {s.activityCount}
                  <span className="text-gray-400"> / {s.taskCount}</span>
                </td>
                <td className="px-4 py-2 text-right font-medium text-gray-700">
                  {Number(s.progressPct).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
