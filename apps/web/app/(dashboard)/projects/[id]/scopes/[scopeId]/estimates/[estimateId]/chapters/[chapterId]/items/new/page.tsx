/**
 * Nuevo ítem BOQ — .../chapters/[chapterId]/items/new (4E.2A).
 *
 * Server Component request-time. Precarga el capítulo editable (RLS). La escritura
 * requiere modo supabase+db. El subtotal es derivado server-side.
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
import { isCreationModeEnabled } from '../../../../../../../../../mode-guard';
import { ItemForm } from '../../../../item-form';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string; chapterId: string }>;
}

export default async function NewItemPage({ params }: PageProps) {
  const { id, scopeId, estimateId, chapterId } = await params;
  const chapterHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}/chapters/${chapterId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
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
        title="Nuevo ítem"
        breadcrumb={
          <Link href={chapterHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al capítulo
          </Link>
        }
      />
      <ItemForm
        mode="create"
        estimateId={estimateId}
        chapterId={chapterId}
        chapterCode={chapter.code}
        chapterHref={chapterHref}
        canWrite={isCreationModeEnabled()}
        editable={chapter.editable}
      />
    </div>
  );
}
