/**
 * Formulario de creación de proyecto — /projects/new (4B.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §7`.
 *
 * Diseño:
 *  - Server Component externo (verifica el modo antes de renderizar).
 *  - `NewProjectForm` Client Component maneja el estado del formulario y la action.
 *  - En modo demo/fixture: muestra mensaje claro y botón de regreso (no el formulario).
 *  - Campos enviados: nombre, ciudad, descripción (opcional).
 *  - Nunca envía organization_id, created_by, code, id, role.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { isCreationModeEnabled } from '../mode-guard';
import { NewProjectForm } from './new-project-form';

export default function NewProjectPage() {
  const canCreate = isCreationModeEnabled();

  if (!canCreate) {
    return (
      <div>
        <PageHeader
          title="Nuevo proyecto"
          breadcrumb={
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Proyectos
            </Link>
          }
        />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          <strong>Modo demostración activo.</strong> La creación de proyectos no está
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
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver a proyectos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nuevo proyecto"
        description="Completa los datos del proyecto para comenzar."
        breadcrumb={
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Proyectos
          </Link>
        }
      />
      <div className="max-w-lg">
        <NewProjectForm />
      </div>
    </div>
  );
}
