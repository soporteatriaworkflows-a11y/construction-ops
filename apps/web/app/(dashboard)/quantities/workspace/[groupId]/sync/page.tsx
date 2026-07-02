/**
 * page.tsx - Sincronizar mediciones con presupuesto (preview obligatorio).
 * Server Component: carga el grupo, sus líneas y las versiones editables.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getReadModel } from '@/server/read-model';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { listQuantityLinkableVersions } from '@/server/quantity-import';
import { SyncPanel } from './_components/sync-panel';

export const dynamic = 'force-dynamic';

export default async function SyncPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const rm = getReadModel();

  const viewer = await resolveViewer();
  const canSync = isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);

  const groups = await rm.listWorkspaceGroups(viewer);
  const group = groups.find((g) => g.id === groupId);
  if (!group) notFound();

  let versions: Awaited<ReturnType<typeof listQuantityLinkableVersions>> = [];
  if (canSync) {
    try {
      const authed = await resolveAuthenticatedViewer();
      versions = await listQuantityLinkableVersions(authed);
    } catch {
      versions = [];
    }
  }

  return (
    <div>
      <PageHeader
        title={`Enviar al presupuesto · ${group.name}`}
        description="Previsualiza antes de crear o actualizar ítems del BOQ"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/quantities/workspace">Volver a Mediciones</Link>
          </Button>
        }
      />

      {!canSync ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="note">
          El envío al presupuesto requiere modo Supabase con datos reales y rol autorizado.
        </div>
      ) : (
        <SyncPanel
          group={{
            id: group.id,
            name: group.name,
            resultUnit: group.resultUnit,
            lines: group.lines.map((l) => ({
              workspaceLineId: l.id,
              description: l.description,
              resultNet: l.resultNet,
              resultUnit: l.resultUnit,
              apuTemplateId: l.apuTemplateId,
              boqItemId: l.boqItemId,
            })),
          }}
          versions={versions.map((v) => ({ versionId: v.versionId, label: v.label, status: v.status }))}
        />
      )}
    </div>
  );
}
