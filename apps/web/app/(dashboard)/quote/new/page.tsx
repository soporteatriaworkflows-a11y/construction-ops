/**
 * /quote/new — Wizard de arranque del asistente (QUOTING_ASSISTED_MODE_V1).
 *
 * Server Component. Selector guiado en cascada (proyecto → alcance → versión)
 * sobre LECTURAS existentes (read-model + repo de presupuestos). NO crea
 * mutaciones nuevas: "crear nuevo" enlaza a las rutas de creación existentes
 * (que usan createProjectAction/createScopeAction/createEstimateAction). Al
 * elegir versión, continúa al centro de cotización.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getReadModel } from '@/server/read-model';
import { getEstimatesWriteRepository } from '@/server/estimates';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
}

function StepBox({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-iconic-gray text-[11px] font-semibold text-iconic-ink">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function QuoteNewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const projectId = str(sp.projectId);
  const scopeId = str(sp.scopeId);

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  const canCreate = isCreationModeEnabled();

  const projects = await getReadModel().listProjects(viewer).catch(() => []);
  const scopes = projectId
    ? await getReadModel().getProjectOverview(viewer, projectId).then((o) => o.scopes).catch(() => [])
    : [];
  const estimates = projectId && scopeId
    ? await getEstimatesWriteRepository().listEstimatesByScope(viewer, scopeId).catch(() => [])
    : [];

  return (
    <div>
      <PageHeader
        title="Nueva cotización asistida"
        description="Elige el proyecto, el alcance y la versión editable. Te llevamos al centro de cotización."
        breadcrumb={
          <Link href="/quote" className="text-sm text-gray-500 hover:text-gray-700">← Volver al asistente</Link>
        }
      />

      {!canCreate && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Estás en modo demostración: puedes <strong>seleccionar</strong> proyectos existentes, pero la creación
          de proyectos/alcances/versiones requiere modo Supabase + base de datos.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Proyecto */}
        <StepBox n={1} title="Proyecto">
          {projects.length === 0 ? (
            <p className="text-xs text-gray-500">No hay proyectos visibles.</p>
          ) : (
            <ul className="space-y-1">
              {projects.map((p) => {
                const active = p.id === projectId;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/quote/new?projectId=${p.id}`}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${active ? 'border-iconic-primary bg-brand-50/60 font-medium text-iconic-ink' : 'hover:bg-gray-50'}`}
                    >
                      <span className="truncate">{p.name}</span>
                      {active && <ChevronRight className="h-4 w-4 text-iconic-primary" aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {canCreate && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/projects/new"><Plus className="h-4 w-4" aria-hidden="true" />Crear proyecto</Link>
            </Button>
          )}
        </StepBox>

        {/* 2. Alcance */}
        <StepBox n={2} title="Alcance">
          {!projectId ? (
            <p className="text-xs text-gray-400">Selecciona primero un proyecto.</p>
          ) : scopes.length === 0 ? (
            <p className="text-xs text-gray-500">Este proyecto no tiene alcances.</p>
          ) : (
            <ul className="space-y-1">
              {scopes.map((sc) => {
                const active = sc.id === scopeId;
                return (
                  <li key={sc.id}>
                    <Link
                      href={`/quote/new?projectId=${projectId}&scopeId=${sc.id}`}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${active ? 'border-iconic-primary bg-brand-50/60 font-medium text-iconic-ink' : 'hover:bg-gray-50'}`}
                    >
                      <span className="truncate">{sc.code} · {sc.name}</span>
                      {active && <ChevronRight className="h-4 w-4 text-iconic-primary" aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {canCreate && projectId && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href={`/projects/${projectId}/scopes/new`}><Plus className="h-4 w-4" aria-hidden="true" />Crear alcance</Link>
            </Button>
          )}
        </StepBox>

        {/* 3. Versión / presupuesto */}
        <StepBox n={3} title="Presupuesto / versión">
          {!projectId || !scopeId ? (
            <p className="text-xs text-gray-400">Selecciona proyecto y alcance.</p>
          ) : estimates.length === 0 ? (
            <p className="text-xs text-gray-500">Este alcance no tiene presupuestos.</p>
          ) : (
            <ul className="space-y-1">
              {estimates.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/quote/${projectId}/${scopeId}/${e.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:border-iconic-primary hover:bg-brand-50/60"
                  >
                    <span className="truncate"><span className="font-mono text-xs text-gray-500">{e.code}</span> · {e.name}</span>
                    <ChevronRight className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {canCreate && projectId && scopeId && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href={`/projects/${projectId}/scopes/${scopeId}/estimates/new`}><Plus className="h-4 w-4" aria-hidden="true" />Crear presupuesto</Link>
            </Button>
          )}
        </StepBox>
      </div>
    </div>
  );
}
