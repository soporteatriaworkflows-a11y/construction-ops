/**
 * /planning/new — Crear cronograma desde presupuesto (planificación de obra, Fase 4).
 * Server Component: gatea por permiso, carga proyectos×versiones y delega el
 * formulario (con preview read-only) al cliente.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import {
  loadScheduleCreationData,
  canManageSchedules,
  type ScheduleCreationProject,
} from '@/server/planning';
import { NewScheduleForm } from './new-schedule-form';

export const dynamic = 'force-dynamic';

export default async function NewSchedulePage() {
  let projects: ScheduleCreationProject[] = [];
  let allowed = false;
  let error: string | null = null;
  try {
    const viewer = await resolveAuthenticatedViewer();
    allowed = canManageSchedules(viewer.role);
    if (allowed) projects = await loadScheduleCreationData(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar los presupuestos';
  }

  return (
    <div>
      <PageHeader
        title="Crear cronograma desde presupuesto"
        description="Genera un cronograma base con actividades de obra conectadas al BOQ."
      />
      <Link
        href="/planning"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a cronogramas
      </Link>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : !allowed ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No tienes permiso para crear cronogramas. Esta acción es para gerencia y presupuestos.
        </div>
      ) : (
        <NewScheduleForm projects={projects} />
      )}
    </div>
  );
}
