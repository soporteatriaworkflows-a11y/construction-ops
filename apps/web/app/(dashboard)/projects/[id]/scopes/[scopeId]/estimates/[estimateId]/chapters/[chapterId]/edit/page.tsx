/**
 * Editar capítulo — .../chapters/[chapterId]/edit (4E.2A).
 *
 * Server Component request-time. Precarga el capítulo editable (RLS) y preserva
 * la metadata de origen. La escritura requiere modo supabase+db.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import {
  getEstimatesWriteRepository,
  ChapterNotFoundError,
  EstimateNotFoundError,
} from '@/server/estimates';
import { isCreationModeEnabled } from '../../../../../../../../mode-guard';
import { canEditBudgetSurface } from '@/server/access/budget-surface';
import { ChapterForm } from '../../../chapter-form';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string; chapterId: string }>;
}

export default async function EditChapterPage({ params }: PageProps) {
  const { id, scopeId, estimateId, chapterId } = await params;
  const estimateHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  // Defensa adicional: el presupuesto debe pertenecer al alcance de la ruta.
  try {
    const est = await getEstimatesWriteRepository().getEstimateById(viewer, estimateId);
    if (est.projectScopeId !== scopeId) notFound();
  } catch {
    notFound();
  }

  let chapter: Awaited<ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEditableEstimateChapter']>>;
  try {
    chapter = await getEstimatesWriteRepository().getEditableEstimateChapter(viewer, estimateId, chapterId);
  } catch (e) {
    if (e instanceof ChapterNotFoundError || e instanceof EstimateNotFoundError) notFound();
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={`Editar capítulo ${chapter.code}`}
        breadcrumb={
          <Link href={estimateHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al presupuesto
          </Link>
        }
      />
      <ChapterForm
        mode="edit"
        estimateId={estimateId}
        estimateHref={estimateHref}
        canWrite={isCreationModeEnabled() && canEditBudgetSurface(viewer.profileRole)}
        editable={chapter.editable}
        initial={{ chapterId: chapter.id, code: chapter.code, name: chapter.name }}
        origin={{ sourceCode: chapter.sourceCode, sourceRow: chapter.sourceRow, isManual: chapter.isManual }}
      />
    </div>
  );
}
