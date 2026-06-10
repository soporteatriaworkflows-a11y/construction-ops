/**
 * Página de creación de proveedor — /catalog/providers/new (Fase 3A).
 * Server Component. Propiedad: agent-frontend-boq.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { ProviderForm } from '../_components/provider-form';

export const dynamic = 'force-dynamic';

export default async function NewProviderPage() {
  const mode = resolveAuthMode();

  try {
    await resolveViewer();
  } catch {
    // Sin sesión válida — el Proxy ya redirige. Defensa en profundidad.
  }

  if (mode !== 'supabase') {
    return (
      <div>
        <PageHeader title="Nuevo proveedor" />
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <strong>Modo demostración activo.</strong> La creación no está disponible. Requiere{' '}
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

  return (
    <div>
      <PageHeader
        title="Nuevo proveedor"
        description="Registra un proveedor para inteligencia de precios."
        breadcrumb={
          <Link href="/catalog/providers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Proveedores
          </Link>
        }
      />
      <div className="max-w-lg">
        <ProviderForm mode="create" />
      </div>
    </div>
  );
}
