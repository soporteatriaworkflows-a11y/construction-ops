/**
 * /steel — Hub y dashboard del preview de Acero y Estructura Metálica.
 * Todos los KPIs vienen de `computeDashboardKpis()` (dominio real de F1 +
 * mocks), no de números fijos. Ver `docs/STEEL_OPS_UIX_HEAVY_WAVE_HANDOFF.md`.
 */
import Link from 'next/link';
import { FileSearch, Scissors, Link2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { KpiBand, KpiCard } from '@/components/shared/kpi-card';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { computeDashboardKpis } from '@/lib/steel/domain-bridge';
import { MOCK_STEEL_TAKEOFFS } from '@/lib/steel/mock-data';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import { SteelStatusBadge } from './_components/steel-status-badge';

const VALUE_POINTS = [
  {
    icon: FileSearch,
    title: 'De documento a cantidades',
    text: 'Convierte documentación estructural en cantidades comprables, con revisión humana en cada paso.',
  },
  {
    icon: ShieldAlert,
    title: 'Riesgo visible antes del pedido',
    text: 'Detecta inconsistencias de interpretación, peso y precio antes de comprometer una compra.',
  },
  {
    icon: Scissors,
    title: 'Menos desperdicio',
    text: 'Optimiza cortes contra longitudes comerciales y reutiliza sobrantes compatibles.',
  },
  {
    icon: Link2,
    title: 'Conectado al presupuesto',
    text: 'Vincula el acero con catálogo, APU y BOQ — sin duplicar fuentes de verdad.',
  },
];

export default function SteelHubPage() {
  const kpis = computeDashboardKpis();

  return (
    <div>
      <PageHeader
        title="Acero y Estructura Metálica"
        eyebrow="Steel Ops — preview interno"
        description="Vista consolidada de refuerzo y estructura metálica por proyecto: cantidades, desperdicio, pedidos y riesgo comercial en un solo lugar."
      />

      <section aria-label="Qué hace este módulo" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-iconic-soft-blue/40 bg-brand-50/40 p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-iconic-primary" aria-hidden="true" />
              <h2 className="text-xs font-semibold text-iconic-ink">{title}</h2>
            </div>
            <p className="text-xs leading-relaxed text-iconic-graphite/60">{text}</p>
          </div>
        ))}
      </section>

      <h2 className="mb-2 text-sm font-semibold text-iconic-ink">Cantidades y desperdicio</h2>
      <KpiBand className="mb-4">
        <KpiCard label="Total kg" value={formatDecimal(kpis.totalKg, 1)} hint="Refuerzo + estructura metálica" />
        <KpiCard label="Total ml" value={formatDecimal(kpis.totalMl, 1)} />
        <KpiCard label="Unidades comerciales" value={formatDecimal(kpis.totalCommercialUnits, 0)} hint="Barras/piezas 6-9-12 m" />
        <KpiCard
          label="Desperdicio asumido"
          value={`${formatDecimal(kpis.estimatedWasteKg, 1)} kg`}
          tone={Number(kpis.estimatedWasteKg) > 0 ? 'warn' : 'default'}
          hint="Modo % por línea (D5)"
        />
        <KpiCard
          label="Desperdicio optimizado"
          value={`${formatDecimal(kpis.optimizedWasteM, 2)} m`}
          hint="Plan de corte FFD real"
          href="/steel/optimization"
        />
        <KpiCard
          label="Ahorro estimado"
          value={formatCop(kpis.estimatedSavingsCop)}
          tone="ok"
          hint="Sobrantes reutilizables (referencia)"
          href="/steel/optimization"
        />
      </KpiBand>

      <h2 className="mb-2 text-sm font-semibold text-iconic-ink">Revisión y compra</h2>
      <KpiBand className="mb-6">
        <KpiCard
          label="Alertas críticas"
          value={kpis.criticalAlertsCount}
          tone={kpis.criticalAlertsCount > 0 ? 'danger' : 'ok'}
          href="/steel/takeoffs"
        />
        <KpiCard
          label="Alertas de advertencia"
          value={kpis.warningAlertsCount}
          tone={kpis.warningAlertsCount > 0 ? 'warn' : 'ok'}
          href="/steel/takeoffs"
        />
        <KpiCard
          label="Líneas por revisar"
          value={kpis.linesPendingReviewCount}
          tone={kpis.linesPendingReviewCount > 0 ? 'warn' : 'ok'}
          hint="Interpretación pendiente"
          href="/steel/review"
        />
        <KpiCard label="Pedidos en borrador" value={kpis.draftOrdersCount} href="/steel/orders" />
        <KpiCard
          label="Precios sin aprobar o vencidos"
          value={kpis.pendingOrExpiredPricesCount}
          tone={kpis.pendingOrExpiredPricesCount > 0 ? 'warn' : 'ok'}
          href="/steel/catalog"
        />
      </KpiBand>

      <SurfaceCard variant="primary">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-iconic-ink">Estado de los takeoffs</h2>
          <Link href="/steel/takeoffs" className="text-xs font-medium text-iconic-primary hover:underline">
            Ver todos
          </Link>
        </div>
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

      <InlineCallout tone="info" className="mt-4">
        Los KPIs se calculan con el motor real de F1 (<code>@/modules/steel</code>: parser,
        calculadora, alertas, optimizador FFD) sobre datos de ejemplo. Nada aquí lee catálogo,
        precios o proyectos reales.
      </InlineCallout>
    </div>
  );
}
