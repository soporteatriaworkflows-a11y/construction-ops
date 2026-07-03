/**
 * Página de edición de proveedor — /catalog/providers/[id]/edit (V5.6.6A).
 * Server Component. Propiedad: agent-frontend-boq / agent-pricing.
 *
 * Fix del dead-link: la lista enlazaba a esta ruta desde Fase 3A pero la
 * página nunca existió (404). Reutiliza ProviderForm en mode='edit' con
 * updateProviderAction (ya existente); el backstop de rol vive en la action
 * (management/internal) y aquí se refleja el mismo gate para no renderizar
 * el formulario a roles de solo lectura (consulta/obra).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getProviderRepository, ProviderNotFoundError } from '@/server/pricing';
import type { ProviderView } from '@/server/pricing';
import { ProviderForm } from '../../_components/provider-form';

export const dynamic = 'force-dynamic';

// Mismo gate que updateProviderAction: internal=admin/presupuestos/compras,
// management=gerencia. consulta (client) y obra (site) quedan fuera.
const EDIT_ROLES = ['management', 'internal'];

export default async function EditProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = resolveAuthMode();

  if (mode !== 'supabase') {
    return (
      <div>
        <PageHeader title="Editar proveedor" />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          <strong>Modo demostración activo.</strong> La edición no está disponible. Requiere{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">APP_AUTH_MODE=supabase</code>.
        </div>
        <div className="mt-4">
          <Link href="/catalog/providers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver a proveedores
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  let provider: ProviderView;
  try {
    const viewer = await resolveAuthenticatedViewer();
    if (!EDIT_ROLES.includes(viewer.role)) {
      return (
        <div>
          <PageHeader title="Editar proveedor" />
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            Tu rol no permite editar proveedores.
          </div>
          <div className="mt-4">
            <Link href="/catalog/providers">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Volver a proveedores
              </Button>
            </Link>
          </div>
        </div>
      );
    }
    provider = await getProviderRepository().getProviderById(viewer, id);
  } catch (e) {
    if (e instanceof ProviderNotFoundError) notFound();
    throw e;
  }

  return (
    <div>
      <PageHeader
        title={`Editar proveedor: ${provider.name}`}
        description="Actualiza los datos del proveedor. El tipo no es editable tras la creación."
        breadcrumb={
          <Link
            href="/catalog/providers"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Proveedores
          </Link>
        }
      />
      <div className="max-w-lg">
        <ProviderForm mode="edit" provider={provider} />
      </div>
    </div>
  );
}
