/**
 * Página de presupuestos (estimates) — listado real visible (Oleada 4B.3).
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Lista los presupuestos VISIBLES para la organización del viewer (RLS-bound):
 *  - `db`      → presupuestos reales de la organización autenticada.
 *  - `fixture` → demo explícito del golden master.
 * Sin fallback silencioso db→fixture. Request-time (`resolveViewer()` + layout
 * `force-dynamic`). NO calcula totales financieros.
 */
import Link from 'next/link';
import { ClipboardList, Layers, FolderOpen, ChevronRight, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository } from '@/server/estimates';
import type { EstimateListItem } from '@/server/estimates';

export const dynamic = 'force-dynamic';

function estimateHref(e: EstimateListItem): string | null {
  if (!e.projectId) return null;
  return `/projects/${e.projectId}/scopes/${e.projectScopeId}/estimates/${e.id}`;
}

export default async function EstimatesPage() {
  // Viewer real por modo (supabase=autenticado, demo=fixture).
  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al resolver la sesión.';
    return (
      <div>
        <PageHeader title="Presupuestos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {msg}
        </div>
      </div>
    );
  }

  let estimates: EstimateListItem[] = [];
  let error: string | null = null;
  try {
    estimates = await getEstimatesWriteRepository().listVisibleEstimates(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar presupuestos';
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Presupuestos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar presupuestos: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        description="Presupuestos visibles para tu organización"
      />

      {estimates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin presupuestos"
          description="Aún no hay presupuestos registrados en esta organización. Crea uno desde el alcance de un proyecto."
        />
      ) : (
        <ul role="list" className="space-y-3">
          {estimates.map((estimate) => {
            const href = estimateHref(estimate);
            const inner = (
              <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                      {estimate.code}
                    </span>
                    {estimate.status === 'active' && <Badge variant="success">Vigente</Badge>}
                    {estimate.status === 'archived' && <Badge variant="outline">Archivado</Badge>}
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-900">{estimate.name}</p>
                  <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-400">
                    {estimate.projectName && (
                      <span className="flex items-center gap-1">
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        {estimate.projectName}
                      </span>
                    )}
                    {estimate.scopeName && (
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        {estimate.scopeName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(estimate.createdAt)}
                    </span>
                  </div>
                </div>
                {href && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                )}
              </>
            );
            return (
              <li key={estimate.id}>
                {href ? (
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
