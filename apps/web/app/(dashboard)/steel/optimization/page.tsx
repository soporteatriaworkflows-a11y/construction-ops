import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { KpiBand, KpiCard } from '@/components/shared/kpi-card';
import { buildCutPlans } from '@/lib/steel/domain-bridge';
import { MOCK_STEEL_OFFCUTS_WORKFLOW_ONLY, MOCK_STEEL_SETTINGS } from '@/lib/steel/mock-data';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';
import type { SteelCutPlanBar, SteelOffcut } from '@/modules/steel';

function CutPlanTable({ title, plan, kerfM }: { title: string; plan: { bars: readonly SteelCutPlanBar[]; rejectedCuts: readonly { cutId: string; reason: string }[]; totalWasteM: string }; kerfM: string }) {
  return (
    <SurfaceCard variant="chart" className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-iconic-ink">{title}</h3>
        <span className="text-xs text-iconic-graphite/50">kerf {kerfM} m · desperdicio total {formatDecimal(plan.totalWasteM, 2)} m</span>
      </div>
      {plan.bars.length === 0 ? (
        <p className="text-xs text-iconic-graphite/50">Sin barras asignadas.</p>
      ) : (
        <div className="space-y-2">
          {plan.bars.map((bar) => (
            <div key={bar.id} className="rounded-lg border border-iconic-soft-blue/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-iconic-ink">
                  Barra {bar.id} — comercial {formatDecimal(bar.commercialLengthM, 1)} m
                </span>
                <span className="text-iconic-graphite/60">sobrante {formatDecimal(bar.remainingLengthM, 2)} m</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
                {bar.assignments.map((a, i) => (
                  <div
                    key={`${bar.id}-${a.cutId}-${i}`}
                    className="h-full border-r border-white/60 bg-iconic-primary/70"
                    style={{ width: `${(Number(a.lengthM) / Number(bar.commercialLengthM)) * 100}%` }}
                    title={`${a.cutId}: ${a.lengthM} m`}
                  />
                ))}
                {Number(bar.remainingLengthM) > 0 && (
                  <div
                    className={bar.offcutStatus === 'available' ? 'h-full bg-green-300' : 'h-full bg-gray-300'}
                    style={{ width: `${(Number(bar.remainingLengthM) / Number(bar.commercialLengthM)) * 100}%` }}
                    title={`sobrante ${bar.remainingLengthM} m (${bar.offcutStatus})`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {plan.rejectedCuts.length > 0 && (
        <p className="mt-2 text-xs text-red-700">
          {plan.rejectedCuts.length} corte(s) rechazados: excede longitudes comerciales disponibles.
        </p>
      )}
    </SurfaceCard>
  );
}

function OffcutRow({
  offcut,
  label,
  savingsCop,
  fromDomain,
}: {
  offcut: Pick<SteelOffcut, 'id' | 'lengthM' | 'status'>;
  label: string;
  savingsCop?: string;
  fromDomain: boolean;
}) {
  return (
    <tr>
      <td className="px-3 py-2 text-xs text-iconic-graphite/70">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(offcut.lengthM, 2)} m</td>
      <td className="px-3 py-2">
        <SteelStatusBadge kind="offcut" status={offcut.status} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCop(savingsCop)}</td>
      <td className="px-3 py-2 text-xs text-iconic-graphite/50">{fromDomain ? 'Optimizador FFD (real)' : 'Mock (estado de flujo, aún no en F1)'}</td>
    </tr>
  );
}

export default function SteelOptimizationPage() {
  const { rebar, profiles } = buildCutPlans();
  const domainOffcuts = [...rebar.offcuts, ...profiles.offcuts];
  const estimatedSavingsCop = domainOffcuts.reduce((acc, o) => acc + Number(o.lengthM) * 4200, 0);

  return (
    <div>
      <PageHeader
        title="Optimización de cortes y banco de sobrantes"
        description="Plan de corte calculado con el optimizador FFD real de F1 sobre las líneas mock del takeoff."
      />

      <InlineCallout tone="info" title="Longitudes comerciales y kerf (D3)" className="mb-4">
        Longitudes: {MOCK_STEEL_SETTINGS.commercialLengthsM.join(', ')} m · kerf refuerzo{' '}
        {MOCK_STEEL_SETTINGS.kerfRebarM} m · kerf perfiles {MOCK_STEEL_SETTINGS.kerfProfilesM} m · sobrante
        mínimo útil refuerzo {MOCK_STEEL_SETTINGS.minimumUsefulOffcutRebarM} m / perfiles{' '}
        {MOCK_STEEL_SETTINGS.minimumUsefulOffcutProfilesM} m.
      </InlineCallout>

      <KpiBand className="mb-6">
        <KpiCard label="Barras usadas (refuerzo)" value={rebar.bars.length} />
        <KpiCard label="Barras usadas (perfiles)" value={profiles.bars.length} />
        <KpiCard label="Sobrantes reutilizables" value={domainOffcuts.length} />
        <KpiCard label="Ahorro estimado" value={formatCop(String(estimatedSavingsCop))} hint="mock: ml sobrante × precio referencia" />
      </KpiBand>

      <CutPlanTable title="Refuerzo (rebar)" plan={rebar} kerfM={MOCK_STEEL_SETTINGS.kerfRebarM} />
      <CutPlanTable title="Perfiles / estructura metálica" plan={profiles} kerfM={MOCK_STEEL_SETTINGS.kerfProfilesM} />

      <SurfaceCard variant="metric">
        <h3 className="mb-3 text-sm font-semibold text-iconic-ink">Banco de sobrantes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th className="px-3 py-2">Sobrante</th>
                <th className="px-3 py-2 text-right">Longitud</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Ahorro estimado</th>
                <th className="px-3 py-2">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {domainOffcuts.map((o) => (
                <OffcutRow key={o.id} offcut={o} label={o.steelSpecId} savingsCop={String(Number(o.lengthM) * 4200)} fromDomain />
              ))}
              {MOCK_STEEL_OFFCUTS_WORKFLOW_ONLY.map((o) => (
                <OffcutRow key={o.id} offcut={o} label={o.specLabel} savingsCop={o.estimatedSavingsCop} fromDomain={false} />
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
