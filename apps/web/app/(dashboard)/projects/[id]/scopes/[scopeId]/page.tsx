/**
 * Detalle básico de alcance — /projects/[id]/scopes/[scopeId] (4B.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §7`.
 *
 * - Server Component, request-time (`resolveViewer()` + layout force-dynamic).
 * - Cross-org / inexistente ⇒ `notFound()` (404 amable). RLS es la barrera real.
 * - Verifica que el alcance pertenezca al proyecto de la ruta (defensa).
 * - Sin presupuesto (placeholder honesto para la siguiente fase).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tag, Layers, Calendar, FileText, FolderOpen } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getScopesWriteRepository, ScopeNotFoundError } from '@/server/scopes';
import { SCOPE_TYPE_LABELS } from '../../scope-labels';

interface PageProps {
  params: Promise<{ id: string; scopeId: string }>;
}

export default async function ScopeDetailPage({ params }: PageProps) {
  const { id, scopeId } = await params;
  const backHref = `/projects/${id}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let scope: Awaited<ReturnType<ReturnType<typeof getScopesWriteRepository>['getScopeById']>>;
  try {
    scope = await getScopesWriteRepository().getScopeById(viewer, scopeId);
  } catch (e) {
    if (e instanceof ScopeNotFoundError) notFound();
    notFound();
  }

  // Defensa: el alcance debe pertenecer al proyecto de la ruta.
  if (scope.projectId !== id) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={scope.name}
        breadcrumb={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al proyecto
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Información general */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Información general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {scope.code}
              </span>
              <Badge variant="secondary">
                <Layers className="mr-1 h-3 w-3" aria-hidden="true" />
                {SCOPE_TYPE_LABELS[scope.scopeType]}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Tag className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="sr-only">Estado:</span>
              {scope.status === 'active' ? 'Activo' : 'Archivado'}
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Proyecto: </span>
                <Link href={backHref} className="text-blue-700 hover:underline">
                  Ver proyecto
                </Link>
              </span>
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Creado: </span>
                Creado el {formatDateTime(scope.createdAt)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Descripción */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Descripción</CardTitle>
          </CardHeader>
          <CardContent>
            {scope.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="sr-only">Descripción del alcance: </span>
                {scope.description}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Sin descripción</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Presupuesto del alcance: siguiente fase (4B.3) */}
      <div
        className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700"
        role="status"
      >
        El presupuesto de este alcance estará disponible en la siguiente fase.
      </div>
    </div>
  );
}
