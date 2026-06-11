/**
 * Detalle de plantilla APU — /apu/[id] (FASE 4B.1).
 *
 * Propiedad: agent-frontend-boq. Contrato:
 * `docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §10-11`.
 *
 * - Server Component. Consume el read-model canónico (`getApuDetail`); NO
 *   calcula totales financieros (llegan pre-calculados como DecimalString).
 * - Cross-org / inexistente ⇒ `notFound()` (sin exponer estado interno).
 * - El rol laboral de cada componente es 🔒: el read-model ya lo OMITE para
 *   rol `client` (proyección backend-first; aquí solo se muestra si llega).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCOP, formatNumber, formatPct } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { ApuNotFoundError } from '@/server/read-model/errors';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import type { ApuComponentView, ApuDetail } from '@/lib/contracts/read-model';

export const dynamic = 'force-dynamic';

const COMPONENT_TYPE_LABELS: Record<ApuComponentView['componentType'], string> = {
  material: 'Material',
  labor: 'Mano de obra',
  equipment: 'Equipo',
  tool: 'Herramienta',
  subcontract: 'Subcontrato',
  other: 'Otro',
};

interface ApuDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ApuDetailPage({ params }: ApuDetailPageProps) {
  const { id } = await params;

  let detail: ApuDetail;
  try {
    const viewer = await resolveViewer();
    detail = await getReadModel().getApuDetail(viewer, id);
  } catch (e) {
    if (e instanceof ApuNotFoundError) notFound();
    notFound();
  }

  const subtotals: { label: string; value: string }[] = [
    { label: 'Materiales', value: detail.unitCostMaterials },
    { label: 'Mano de obra', value: detail.unitCostLabor },
    { label: 'Equipos', value: detail.unitCostEquipment },
    { label: 'Herramienta', value: detail.unitCostTools },
    { label: 'Subcontratos', value: detail.unitCostSubcontract },
    { label: 'Otros', value: detail.unitCostOther },
  ].filter((s) => s.value !== '0');

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/apu"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al catálogo APU
        </Link>
      </div>

      <PageHeader
        title={detail.name}
        description={`Análisis de precio unitario por ${detail.unitCanonical}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
          {detail.code}
        </span>
        <Badge variant="secondary">v{detail.version}</Badge>
        <Badge variant="secondary">
          Unidad: {detail.unitCanonical}
          {detail.unit !== detail.unitCanonical ? ` (${detail.unit})` : ''}
        </Badge>
        {detail.defaultToolPct !== '0' && (
          <Badge variant="secondary">
            <Wrench className="mr-1 h-3 w-3" />
            Herramienta menor {formatPct(detail.defaultToolPct)} de M.O.
          </Badge>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Componentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 font-medium text-right">Rendimiento</th>
                  <th className="py-2 pr-3 font-medium text-right">Desperdicio</th>
                  <th className="py-2 pr-3 font-medium text-right">Precio unitario</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.components.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">
                        {COMPONENT_TYPE_LABELS[c.componentType]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-gray-900">
                        {c.resourceName ?? c.laborRoleName ?? '—'}
                      </span>
                      {c.laborRoleCode && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {c.laborRoleCode}
                        </span>
                      )}
                      {!c.laborRoleCode && c.resourceCode && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {c.resourceCode}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatNumber(c.quantity, 4)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.wastePct === '0' ? '—' : formatPct(c.wastePct)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatCOP(c.unitPriceSnapshot)}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatCOP(c.totalComponentCost)}
                    </td>
                  </tr>
                ))}
                {detail.unitCostToolDerived !== '0' && (
                  <tr className="border-b last:border-b-0 bg-gray-50/50">
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">Herramienta</Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      Herramienta menor ({formatPct(detail.defaultToolPct)} sobre M.O.)
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-400">—</td>
                    <td className="py-2 pr-3 text-right text-gray-400">—</td>
                    <td className="py-2 pr-3 text-right text-gray-400">—</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatCOP(detail.unitCostToolDerived)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Desglose por tipo de costo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {subtotals.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-600">{s.label}</span>
                <span className="tabular-nums">{formatCOP(s.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">
                Costo unitario total
              </span>
              <span className="text-lg font-bold text-blue-700 tabular-nums">
                {formatCOP(detail.unitCostTotal)}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  / {detail.unitCanonical}
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
