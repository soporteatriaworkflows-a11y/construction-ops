/**
 * Formulario de creación de presupuesto — .../scopes/[scopeId]/estimates/new (4B.3).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §7`.
 *
 * - Server Component: valida modo + visibilidad del alcance antes de renderizar.
 * - Request-time (`resolveViewer()` lee cookies; layout fuerza dynamic). La server
 *   action conserva su propio guard.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getScopesWriteRepository, ScopeNotFoundError } from '@/server/scopes';
import { isCreationModeEnabled } from '../../../../../mode-guard';
import { NewEstimateForm } from './new-estimate-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; scopeId: string }>;
}

export default async function NewEstimatePage({ params }: PageProps) {
  const { id, scopeId } = await params;
  const backHref = `/projects/${id}/scopes/${scopeId}`;

  // El alcance debe ser visible para el viewer (RLS) y pertenecer al proyecto.
  try {
    const viewer = await resolveViewer();
    const scope = await getScopesWriteRepository().getScopeById(viewer, scopeId);
    if (scope.projectId !== id) notFound();
  } catch (e) {
    if (e instanceof ScopeNotFoundError) notFound();
    // Sin sesión válida en modo supabase: el proxy ya redirige a /login.
  }

  const canCreate = isCreationModeEnabled();

  const breadcrumb = (
    <Link
      href={backHref}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Volver al alcance
    </Link>
  );

  if (!canCreate) {
    return (
      <div>
        <PageHeader title="Nuevo presupuesto" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          <strong>Modo demostración activo.</strong> La creación de presupuestos no está
          disponible en este modo. Se requiere{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            APP_AUTH_MODE=supabase
          </code>{' '}
          y{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            READ_MODEL_SOURCE=db
          </code>
          .
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al alcance
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nuevo presupuesto"
        description="Completa los datos. Se creará su versión inicial V01 automáticamente."
        breadcrumb={breadcrumb}
      />
      <div className="max-w-lg">
        <NewEstimateForm scopeId={scopeId} backHref={backHref} />
      </div>
    </div>
  );
}
