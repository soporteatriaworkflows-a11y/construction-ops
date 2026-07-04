/**
 * Editar ítem BOQ — .../chapters/[chapterId]/items/[itemId]/edit (4E.2A).
 *
 * Server Component request-time. Precarga el ítem editable + capítulos disponibles
 * para mover (RLS). Subtotal derivado server-side; origen preservado.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import {
  getEstimatesWriteRepository,
  BoqItemNotFoundError,
  EstimateNotFoundError,
} from '@/server/estimates';
import { isCreationModeEnabled } from '../../../../../../../../../../mode-guard';
import { canEditBudgetSurface } from '@/server/access/budget-surface';
import { ItemForm } from '../../../../../item-form';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string; chapterId: string; itemId: string }>;
}

export default async function EditItemPage({ params }: PageProps) {
  const { id, scopeId, estimateId, chapterId, itemId } = await params;
  const chapterHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}/chapters/${chapterId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let item: Awaited<ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEditableBoqItem']>>;
  try {
    item = await getEstimatesWriteRepository().getEditableBoqItem(viewer, estimateId, chapterId, itemId);
  } catch (e) {
    if (e instanceof BoqItemNotFoundError || e instanceof EstimateNotFoundError) notFound();
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={`Editar ítem ${item.code}`}
        breadcrumb={
          <Link href={chapterHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al capítulo
          </Link>
        }
      />
      <ItemForm
        mode="edit"
        estimateId={estimateId}
        chapterId={chapterId}
        chapterCode={item.chapterCode}
        chapterHref={chapterHref}
        canWrite={isCreationModeEnabled() && canEditBudgetSurface(viewer.profileRole)}
        editable={item.editable}
        initial={{
          itemId: item.id,
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }}
        origin={{ sourceCode: item.sourceCode, sourceRow: item.sourceRow, isManual: item.isManual }}
        availableChapters={item.availableChapters}
      />
    </div>
  );
}
