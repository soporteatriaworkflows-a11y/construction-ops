/**
 * /steel/optimization — Plan de corte (FFD real de F1) + banco de sobrantes.
 * Las barras se agrupan por diámetro/perfil para que se lea "esta varilla se
 * corta así, sobra esto, y puede usarse acá". Ahorro = ml × kg/m × COP/kg de
 * referencia (mock), calculado en `computeOffcutSavings`.
 */
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { KpiBand, KpiCard } from '@/components/shared/kpi-card';
import { buildCutPlans, computeOffcutSavings, groupBarsBySpec, specDisplayLabel } from '@/lib/steel/domain-bridge';
import { MOCK_STEEL_OFFCUTS_WORKFLOW_ONLY, MOCK_STEEL_SETTINGS } from '@/lib/steel/mock-data';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from '../_components/steel-status-badge';
import type { SteelCutPlan, SteelCutPlanBar } from '@/modules/steel';

function CutBar({ bar }: { bar: SteelCutPlanBar }) {
  const commercial = Number(bar.commercialLengthM);
  const remaining = Number(bar.remainingLengthM);
  const reusable = bar.offcutStatus === 'available';
  return (
    <div className="rounded-lg border border-iconic-soft-blue/40 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="font-medium text-iconic-ink">
          Barra comercial de {formatDecimal(bar.commercialLengthM, 0)} m · {bar.assignments.length} corte{bar.assignments.length === 1 ? '' : 's'}
        </span>
        <span className={reusable ? 'font-medium text-green-700' : 'text-iconic-graphite/60'}>
          {remaining > 0
            ? `sobra ${formatDecimal(bar.remainingLengthM, 2)} m ${reusable ? '(reutilizable)' : '(desperdicio final)'}`
            : 'sin sobrante'}
        </span>
      </div>
      <div
        className="flex h-5 w-full overflow-hidden rounded-full bg-gray-100"
        role="img"
        aria-label={`Barra de ${formatDecimal(bar.commercialLengthM, 0)} metros con ${bar.assignments.length} cortes y sobrante de ${formatDecimal(bar.remainingLengthM, 2)} metros`}
      >
        {bar.assignments.map((a, i) => (
          <div
            key={`${bar.id}-${a.cutId}-${i}`}
            className="flex h-full items-center justify-center border-r border-white/70 bg-iconic-primary/75 text-[9px] font-medium text-white"
            style={{ width: `${(Number(a.lengthM) / commercial) * 100}%` }}
            title={`Corte ${a.cutId}: ${a.lengthM} m`}
          >
            {Number(a.lengthM) / commercial > 0.12 ? `${formatDecimal(a.lengthM, 1)} m` : ''}
          </div>
        ))}
        {remaining > 0 && (
          <div
            className={reusable ? 'h-full bg-green-300' : 'h-full bg-gray-300'}
            style={{ width: `${(remaining / commercial) * 100}%` }}
            title={`Sobrante ${bar.remainingLengthM} m (${reusable ? 'reutilizable' : 'desperdicio final'})`}
          />
        )}
      </div>
    </div>
  );
}

function CutPlanSection({ title, plan, kerfM }: { title: string; plan: SteelCutPlan; kerfM: string }) {
  const groups = groupBarsBySpec(plan);
  return (
    <SurfaceCard variant="chart" className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-iconic-ink">{title}</h3>
        <span className="text-xs text-iconic-graphite/50">
          kerf {kerfM} m · desperdicio total {formatDecimal(plan.totalWasteM, 2)} m
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-iconic-graphite/50">Sin cortes para optimizar en este grupo.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.specId}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/50">
                {group.specLabel} · {group.bars.length} barra{group.bars.length === 1 ? '' : 's'}
              </p>
              <div className="space-y-2">
                {group.bars.map((bar) => (
                  <CutBar key={bar.id} bar={bar} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {plan.rejectedCuts.length > 0 && (
        <p className="mt-3 text-xs font-medium text-red-700" role="alert">
          {plan.rejectedCuts.length} corte(s) rechazados: exceden las longitudes comerciales disponibles.
        </p>
      )}
    </SurfaceCard>
  );
}

export default function SteelOptimizationPage() {
  const { rebar, profiles } = buildCutPlans();
  const savings = computeOffcutSavings([rebar, profiles]);
  const domainOffcuts = [...rebar.offcuts, ...profiles.offcuts];

  return (
    <div>
      <PageHeader
        title="Optimización de cortes y banco de sobrantes"
        description="Cada barra comercial muestra sus cortes asignados y el sobrante resultante; los sobrantes por encima del mínimo útil entran al banco para reutilizarse."
      />

      <InlineCallout tone="warning" title="Optimización heurística (FFD)" className="mb-4">
        El plan de corte usa una heurística determinista first-fit-decreasing: explicable y
        reproducible, pero no garantiza el óptimo absoluto. Requiere revisión humana antes de
        comprar.
      </InlineCallout>

      <KpiBand className="mb-4">
        <KpiCard label="Barras (refuerzo)" value={rebar.bars.length} hint={`Comerciales ${MOCK_STEEL_SETTINGS.commercialLengthsM.join('/')} m`} />
        <KpiCard label="Barras (perfiles)" value={profiles.bars.length} />
        <KpiCard label="Sobrantes reutilizables" value={domainOffcuts.length} />
        <KpiCard label="Ahorro en ml" value={`${formatDecimal(savings.totalMl, 2)} m`} tone="ok" />
        <KpiCard label="Ahorro en kg" value={`${formatDecimal(savings.totalKg, 1)} kg`} tone="ok" />
        <KpiCard label="Ahorro estimado COP" value={formatCop(savings.totalCop)} tone="ok" hint="Precio de referencia mock" />
      </KpiBand>

      <InlineCallout tone="info" className="mb-4">
        Parámetros activos (D3): longitudes comerciales {MOCK_STEEL_SETTINGS.commercialLengthsM.join(', ')} m ·
        kerf refuerzo {MOCK_STEEL_SETTINGS.kerfRebarM} m · kerf perfiles {MOCK_STEEL_SETTINGS.kerfProfilesM} m ·
        sobrante mínimo útil {MOCK_STEEL_SETTINGS.minimumUsefulOffcutRebarM} m (refuerzo) /{' '}
        {MOCK_STEEL_SETTINGS.minimumUsefulOffcutProfilesM} m (perfiles). Configurables en{' '}
        <a href="/steel/settings" className="font-medium text-iconic-primary hover:underline">
          Configuración
        </a>
        .
      </InlineCallout>

      <CutPlanSection title="Refuerzo — agrupado por número de varilla" plan={rebar} kerfM={MOCK_STEEL_SETTINGS.kerfRebarM} />
      <CutPlanSection title="Estructura metálica — agrupado por referencia de perfil" plan={profiles} kerfM={MOCK_STEEL_SETTINGS.kerfProfilesM} />

      <SurfaceCard variant="metric">
        <h3 className="mb-1 text-sm font-semibold text-iconic-ink">Banco de sobrantes</h3>
        <p className="mb-3 text-xs text-iconic-graphite/60">
          Un sobrante solo puede reutilizarse en cortes del mismo grupo (misma varilla/perfil,
          grado y tratamiento). Los estados sugerido/asignado/descartado son del flujo posterior
          (aún mock).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-iconic-graphite/50">
              <tr>
                <th scope="col" className="px-3 py-2">Material</th>
                <th scope="col" className="px-3 py-2 text-right">Longitud</th>
                <th scope="col" className="px-3 py-2">Estado</th>
                <th scope="col" className="px-3 py-2 text-right">Ahorro estimado</th>
                <th scope="col" className="px-3 py-2">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {domainOffcuts.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 text-xs text-iconic-graphite/70">{specDisplayLabel(o.steelSpecId)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(o.lengthM, 2)} m</td>
                  <td className="px-3 py-2">
                    <SteelStatusBadge kind="offcut" status={o.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCop(computeOffcutSavings([{ bars: [], offcuts: [o], rejectedCuts: [], totalWasteM: '0' }]).totalCop)}
                  </td>
                  <td className="px-3 py-2 text-xs text-iconic-graphite/50">Optimizador FFD (real)</td>
                </tr>
              ))}
              {MOCK_STEEL_OFFCUTS_WORKFLOW_ONLY.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 text-xs text-iconic-graphite/70">{o.specLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(o.lengthM, 2)} m</td>
                  <td className="px-3 py-2">
                    <SteelStatusBadge kind="offcut" status={o.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCop(o.estimatedSavingsCop)}</td>
                  <td className="px-3 py-2 text-xs text-iconic-graphite/50">Mock (flujo posterior)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
