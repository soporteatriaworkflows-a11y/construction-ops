/**
 * Nuevo capítulo — .../estimates/[estimateId]/chapters/new (4E.2A).
 *
 * Server Component request-time. Verifica presupuesto/alcance (RLS) y deriva la
 * editabilidad de la versión activa. La escritura requiere modo supabase+db.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import { isCreationModeEnabled } from '../../../../../../../mode-guard';
import { ChapterForm } from '../../chapter-form';

const LOCKED = ['approved', 'issued', 'archived'];

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
}

export default async function NewChapterPage({ params }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const estimateHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let estimate: Awaited<ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEstimateById']>>;
  try {
    estimate = await getEstimatesWriteRepository().getEstimateById(viewer, estimateId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }
  if (estimate.projectScopeId !== scopeId) notFound();

  const editable = !!estimate.activeVersion && !LOCKED.includes(estimate.activeVersion.status);

  return (
    <div>
      <PageHeader
        title="Nuevo capítulo"
        breadcrumb={
          <Link href={estimateHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al presupuesto
          </Link>
        }
      />
      <ChapterForm
        mode="create"
        estimateId={estimateId}
        estimateHref={estimateHref}
        canWrite={isCreationModeEnabled()}
        editable={editable}
      />
    </div>
  );
}
