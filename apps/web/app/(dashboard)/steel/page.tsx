/**
 * /steel — Hub y dashboard del preview de Acero y Estructura Metálica.
 * Todos los KPIs vienen de `computeDashboardKpis()` (dominio real de F1 +
 * mocks), no de números fijos. Ver `docs/STEEL_OPS_UIX_HEAVY_WAVE_HANDOFF.md`.
 */
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { KpiBand, KpiCard } from '@/components/shared/kpi-card';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { computeDashboardKpis } from '@/lib/steel/domain-bridge';
import { MOCK_STEEL_TAKEOFFS } from '@/lib/steel/mock-data';
import { formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from './_components/steel-status-badge';

export default function SteelHubPage() {
  const kpis = computeDashboardKpis();

  return (
    <div>
      <PageHeader
        title="Acero y Estructura Metálica"
        eyebrow="Steel Ops — preview interno"
        description="Vista consolidada de refuerzo y estructura metálica por proyecto. Datos de ejemplo; el motor de cálculo (parser, ml/kg, alertas, optimización de cortes) es el dominio real de F1."
      />

      <InlineCallout tone="tip" title="Cómo leer este hub" className="mb-4">
        Los KPIs se calculan a partir de los mocks vía <code>@/modules/steel</code> (parser +
        calculadora + optimizador FFD). Nada aquí lee catálogo, precios o proyectos reales.
      </InlineCallout>

      <KpiBand className="mb-6">
        <KpiCard label="Total kg" value={formatDecimal(kpis.totalKg, 1)} />
        <KpiCard label="Total ml" value={formatDecimal(kpis.totalMl, 1)} />
        <KpiCard label="Unidades comerciales" value={formatDecimal(kpis.totalCommercialUnits, 0)} hint="Barras/piezas 6-9-12 m" />
        <KpiCard
          label="Desperdicio estimado"
          value={`${formatDecimal(kpis.estimatedWasteKg, 1)} kg`}
          tone={Number(kpis.estimatedWasteKg) > 0 ? 'warn' : 'default'}
          hint="Modo asumido (%), por línea"
        />
        <KpiCard
          label="Desperdicio optimizado"
          value={`${formatDecimal(kpis.optimizedWasteM, 2)} m`}
          hint="Plan de corte FFD (real)"
        />
        <KpiCard
          label="Alertas críticas"
          value={kpis.criticalAlertsCount}
          tone={kpis.criticalAlertsCount > 0 ? 'danger' : 'ok'}
        />
        <KpiCard
          label="Alertas de advertencia"
          value={kpis.warningAlertsCount}
          tone={kpis.warningAlertsCount > 0 ? 'warn' : 'ok'}
        />
        <KpiCard label="Pedidos en borrador" value={kpis.draftOrdersCount} href="/steel/orders" />
        <KpiCard
          label="Precios pendientes/vencidos"
          value={kpis.pendingOrExpiredPricesCount}
          tone={kpis.pendingOrExpiredPricesCount > 0 ? 'warn' : 'ok'}
          href="/steel/catalog"
        />
      </KpiBand>

      <SurfaceCard variant="primary">
        <h2 className="mb-3 text-sm font-semibold text-iconic-ink">Takeoffs (mock)</h2>
        <ul className="divide-y divide-iconic-soft-blue/30">
          {MOCK_STEEL_TAKEOFFS.map((takeoff) => (
            <li key={takeoff.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/steel/takeoffs/${takeoff.id}`} className="truncate text-sm font-medium text-iconic-ink hover:text-iconic-primary">
                  {takeoff.name}
                </Link>
                <p className="truncate text-xs text-iconic-graphite/60">
                  {takeoff.projectName} · {takeoff.scopeLabel} · {takeoff.lineCount} líneas
                </p>
              </div>
              <SteelStatusBadge kind="takeoff" status={takeoff.status} />
            </li>
          ))}
        </ul>
      </SurfaceCard>
    </div>
  );
}
