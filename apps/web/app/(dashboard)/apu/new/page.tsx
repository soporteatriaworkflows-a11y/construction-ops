/**
 * /apu/new — Constructor manual de APU (APU_MANUAL_BUILDER_V1).
 *
 * Server Component. Visible solo a management/internal con modo de creación
 * habilitado (Supabase + db). En demo/fixture muestra explicación y CTA de
 * vuelta a la biblioteca. Carga server-side los materiales (con precio aprobado)
 * y los roles de M.O. (con costo integral) para poblar el formulario.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { loadApuBuilderData } from '@/server/apu-builder';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ApuBuilderData } from '@/lib/apu-builder/types';
import { ApuBuilderForm } from './_components/apu-builder-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined): string | null {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? null : null;
}

function BackLink() {
  return (
    <Link
      href="/apu"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Biblioteca de APU
    </Link>
  );
}

export default async function NewApuPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const preselectedResourceId = str(sp.resourceId);

  let canMutate = false;
  let viewer: AuthenticatedViewer | null = null;
  try {
    const v = await resolveViewer();
    viewer = v as AuthenticatedViewer;
    canMutate = isCreationModeEnabled() && ['management', 'internal'].includes(v.role);
  } catch {
    canMutate = false;
  }

  if (!canMutate || !viewer) {
    return (
      <div>
        <PageHeader title="Nuevo APU" breadcrumb={<BackLink />} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          <strong>Creación no disponible.</strong> Crear un APU manual requiere un
          rol interno (gerencia/presupuestos) y el modo{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            Supabase + base de datos
          </code>
          .
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/apu">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver a la biblioteca
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  let data: ApuBuilderData;
  try {
    data = await loadApuBuilderData(viewer);
  } catch {
    return (
      <div>
        <PageHeader title="Nuevo APU" breadcrumb={<BackLink />} />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          No se pudieron cargar los recursos del catálogo. Inténtalo de nuevo.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nuevo APU"
        description="Construye una actividad a partir de materiales del catálogo y mano de obra."
        breadcrumb={<BackLink />}
      />
      <ApuBuilderForm data={data} preselectedResourceId={preselectedResourceId} />
    </div>
  );
}
