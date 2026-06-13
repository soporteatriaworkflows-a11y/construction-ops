/**
 * /apu/[id] — Detalle de plantilla APU organizado por pestañas
 * (APU_LIBRARY_OPERATIONAL_UX_V1 §3). Server Component.
 *
 * Pestañas (server-rendered vía ?tab=): Resumen · Componentes · Vínculo BOQ ·
 * Trazabilidad. No editor avanzado, sin nuevas fórmulas, sin tocar quantities.
 * Reutiliza el read-model (costos pre-calculados) + reconciliación (estado de
 * recursos por componente). CTA "Reconciliar recursos" → centro filtrado por APU.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitMerge, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCOP, formatDateTime, formatNumber, formatPct } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { ApuNotFoundError } from '@/server/read-model/errors';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import {
  getApuBoqLinks,
  getImportBatches,
  getTemplateReconciliation,
} from '@/server/apu-reconciliation';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ApuComponentView, ApuDetail } from '@/lib/contracts/read-model';
import type {
  ApuBoqLinkView,
  ReconciliationRow,
  ReconciliationState,
} from '@/lib/apu-reconciliation/types';

export const dynamic = 'force-dynamic';

const COMPONENT_TYPE_LABELS: Record<ApuComponentView['componentType'], string> = {
  material: 'Material',
  labor: 'Mano de obra',
  equipment: 'Equipo',
  tool: 'Herramienta',
  subcontract: 'Subcontrato',
  other: 'Otro',
};

const STATE_BADGE: Record<ReconciliationState, { label: string; cls: string }> = {
  exact_match: { label: 'Coincidencia exacta', cls: 'bg-green-100 text-green-700' },
  suggested: { label: 'Sugerido', cls: 'bg-amber-100 text-amber-700' },
  ambiguous: { label: 'Ambiguo', cls: 'bg-orange-100 text-orange-700' },
  unresolved: { label: 'Sin resolver', cls: 'bg-red-100 text-red-700' },
  associated: { label: 'Asociado', cls: 'bg-green-100 text-green-700' },
  intentionally_unresolved: { label: 'Sin asociar (consciente)', cls: 'bg-gray-100 text-gray-600' },
};

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'componentes', label: 'Componentes' },
  { id: 'boq', label: 'Vínculo BOQ' },
  { id: 'trazabilidad', label: 'Trazabilidad' },
] as const;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ApuDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam! : 'resumen';

  let detail: ApuDetail;
  let viewerRole = 'client';
  let reconRows: ReconciliationRow[] = [];
  let boqLinks: ApuBoqLinkView[] = [];
  let batchName: string | null = null;
  let batchSheet: string | null = null;
  let batchDate: string | null = null;
  let batchActor: string | null = null;
  let canMutate = false;

  try {
    const viewer = await resolveViewer();
    viewerRole = viewer.role;
    detail = await getReadModel().getApuDetail(viewer, id);
    canMutate = isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);
    if (canMutate) {
      const av = viewer as AuthenticatedViewer;
      const [recon, links, batches] = await Promise.all([
        getTemplateReconciliation(av, id).catch(() => ({ rows: [], summary: null, batches: [] })),
        getApuBoqLinks(av, id).catch(() => []),
        getImportBatches(av).catch(() => []),
      ]);
      reconRows = recon.rows;
      boqLinks = links;
      const batchId = recon.rows.find((r) => r.importBatchId)?.importBatchId ?? null;
      const batch = batches.find((b) => b.id === batchId) ?? batches[0] ?? null;
      if (batch) {
        batchName = batch.sourceFilename;
        batchSheet = batch.sourceSheet;
        batchDate = batch.importedAt;
        batchActor = batch.importedByName;
      }
    }
  } catch (e) {
    if (e instanceof ApuNotFoundError) notFound();
    notFound();
  }

  const reconByComponent = new Map(reconRows.map((r) => [r.componentId, r]));
  const pendingCount = reconRows.filter(
    (r) => r.state !== 'associated' && r.state !== 'intentionally_unresolved',
  ).length;

  const reconcileCta = canMutate ? (
    <Button size="sm" asChild>
      <Link href={`/apu/reconciliation?apu=${detail.id}`}>
        <GitMerge className="mr-1 h-4 w-4" />
        Reconciliar recursos{pendingCount > 0 ? ` (${pendingCount})` : ''}
      </Link>
    </Button>
  ) : undefined;

  return (
    <div>
      <div className="mb-4">
        <Link href="/apu" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Volver a la biblioteca APU
        </Link>
      </div>

      <PageHeader title={detail.name} description={`Análisis de precio unitario por ${detail.unitCanonical}`} actions={reconcileCta} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">{detail.code}</span>
        <Badge variant="secondary">v{detail.version}</Badge>
        <Badge variant="secondary">
          Unidad: {detail.unitCanonical}
          {detail.unit !== detail.unitCanonical ? ` (${detail.unit})` : ''}
        </Badge>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700">
            {pendingCount} componente{pendingCount !== 1 ? 's' : ''} por asociar
          </Badge>
        )}
      </div>

      {/* Tabs (server-rendered) */}
      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/apu/${detail.id}?tab=${t.id}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab detail={detail} pendingCount={pendingCount} origin={batchName} />}
      {tab === 'componentes' && (
        <ComponentesTab detail={detail} reconByComponent={reconByComponent} />
      )}
      {tab === 'boq' && <BoqTab links={boqLinks} canMutate={canMutate} />}
      {tab === 'trazabilidad' && (
        <TrazabilidadTab
          detail={detail}
          reconRows={reconRows}
          batchName={batchName}
          batchSheet={batchSheet}
          batchDate={batchDate}
          batchActor={batchActor}
          canMutate={canMutate}
          role={viewerRole}
        />
      )}
    </div>
  );
}

function ResumenTab({
  detail,
  pendingCount,
  origin,
}: {
  detail: ApuDetail;
  pendingCount: number;
  origin: string | null;
}) {
  const subtotals = [
    { label: 'Materiales', value: detail.unitCostMaterials },
    { label: 'Mano de obra', value: detail.unitCostLabor },
    { label: 'Equipos', value: detail.unitCostEquipment },
    { label: 'Herramienta', value: detail.unitCostTools },
    { label: 'Subcontratos', value: detail.unitCostSubcontract },
    { label: 'Otros', value: detail.unitCostOther },
  ].filter((s) => s.value !== '0');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Código" value={detail.code} mono />
          <Row label="Descripción" value={detail.name} />
          <Row label="Unidad" value={detail.unitCanonical} />
          <Row label="Estado" value={pendingCount > 0 ? `${pendingCount} por asociar` : 'Completo'} />
          <Row label="Origen" value={origin ?? 'Manual'} />
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <span className="font-medium text-gray-700">Costo unitario total</span>
            <span className="text-lg font-bold tabular-nums text-blue-700">
              {formatCOP(detail.unitCostTotal)} <span className="text-xs font-normal text-gray-400">/ {detail.unitCanonical}</span>
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Desglose por tipo de costo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {subtotals.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-gray-600">{s.label}</span>
              <span className="tabular-nums">{formatCOP(s.value)}</span>
            </div>
          ))}
          {detail.defaultToolPct !== '0' && (
            <p className="flex items-center gap-1 pt-1 text-xs text-gray-400">
              <Wrench className="h-3 w-3" /> Herramienta menor {formatPct(detail.defaultToolPct)} de M.O.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ComponentesTab({
  detail,
  reconByComponent,
}: {
  detail: ApuDetail;
  reconByComponent: Map<string, ReconciliationRow>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Componente</th>
                <th className="py-2 pr-3 font-medium text-right">Rend.</th>
                <th className="py-2 pr-3 font-medium text-right">Desp.</th>
                <th className="py-2 pr-3 font-medium text-right">Precio unit.</th>
                <th className="py-2 pr-3 font-medium text-right">Subtotal</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {detail.components.map((c) => {
                const recon = reconByComponent.get(c.id);
                const badge = recon ? STATE_BADGE[recon.state] : null;
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{COMPONENT_TYPE_LABELS[c.componentType]}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-900">
                      {c.resourceName ?? c.laborRoleName ?? recon?.description ?? '—'}
                      {(c.resourceCode || c.laborRoleCode) && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {c.laborRoleCode ?? c.resourceCode}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(c.quantity, 4)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.wastePct === '0' ? '—' : formatPct(c.wastePct)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCOP(c.unitPriceSnapshot)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatCOP(c.totalComponentCost)}</td>
                    <td className="py-2">
                      {badge ? (
                        <Badge variant="secondary" className={badge.cls}>{badge.label}</Badge>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {detail.unitCostToolDerived !== '0' && (
                <tr className="border-b last:border-b-0 bg-gray-50/50">
                  <td className="py-2 pr-3"><Badge variant="secondary">Herramienta</Badge></td>
                  <td className="py-2 pr-3 text-gray-600">
                    Herramienta menor ({formatPct(detail.defaultToolPct)} sobre M.O.)
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-400">—</td>
                  <td className="py-2 pr-3 text-right text-gray-400">—</td>
                  <td className="py-2 pr-3 text-right text-gray-400">—</td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatCOP(detail.unitCostToolDerived)}</td>
                  <td className="py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BoqTab({ links, canMutate }: { links: ApuBoqLinkView[]; canMutate: boolean }) {
  if (!canMutate) {
    return <p className="text-sm text-gray-500">El detalle de vínculo BOQ está disponible para roles internos.</p>;
  }
  if (links.length === 0) {
    return <p className="text-sm text-gray-500">Esta plantilla APU no está vinculada a ningún ítem BOQ activo.</p>;
  }
  return (
    <Card>
      <CardContent className="pt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3 font-medium">Presupuesto</th>
              <th className="py-2 pr-3 font-medium">Versión</th>
              <th className="py-2 pr-3 font-medium">Actividad</th>
              <th className="py-2 pr-3 font-medium">Unidad</th>
              <th className="py-2 pr-3 font-medium text-right">Cantidad</th>
              <th className="py-2 pr-3 font-medium text-right">Costo unit.</th>
              <th className="py-2 font-medium text-right">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.boqItemId} className="border-b last:border-b-0">
                <td className="py-2 pr-3">{l.estimateName}</td>
                <td className="py-2 pr-3">
                  <Badge variant="secondary">V{String(l.versionNumber).padStart(2, '0')} · {l.versionStatus}</Badge>
                </td>
                <td className="py-2 pr-3">
                  <span className="font-mono text-xs text-gray-400">{l.code}</span> {l.description}
                </td>
                <td className="py-2 pr-3 text-gray-600">{l.unit}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(l.quantity, 2)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatCOP(l.unitPrice)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatCOP(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TrazabilidadTab({
  detail,
  reconRows,
  batchName,
  batchSheet,
  batchDate,
  batchActor,
  canMutate,
  role,
}: {
  detail: ApuDetail;
  reconRows: ReconciliationRow[];
  batchName: string | null;
  batchSheet: string | null;
  batchDate: string | null;
  batchActor: string | null;
  canMutate: boolean;
  role: string;
}) {
  if (!canMutate) {
    return <p className="text-sm text-gray-500">La trazabilidad de importación está disponible para roles internos.</p>;
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Origen de la importación</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Workbook" value={batchName ?? 'Manual'} />
          <Row label="Hoja" value={batchSheet ?? '—'} />
          <Row label="Fecha de importación" value={batchDate ? formatDateTime(batchDate) : '—'} />
          <Row label="Actor" value={batchActor ?? '—'} />
          <Row label="Plantilla" value={`${detail.code} · v${detail.version}`} mono />
        </CardContent>
      </Card>
      {reconRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Valores raw por componente</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">Código raw</th>
                  <th className="py-2 pr-3 font-medium">Descripción raw</th>
                  <th className="py-2 font-medium">Unidad raw</th>
                </tr>
              </thead>
              <tbody>
                {reconRows.map((r) => (
                  <tr key={r.componentId} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-xs text-gray-500">{r.rawCode ?? '—'}</td>
                    <td className="py-2 pr-3">{r.description || '—'}</td>
                    <td className="py-2 text-gray-600">{r.rawUnit ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-gray-400">Rol activo: {role}. Branding ICONIC intacto.</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={mono ? 'font-mono text-xs text-gray-700' : 'text-gray-900'}>{value}</span>
    </div>
  );
}
