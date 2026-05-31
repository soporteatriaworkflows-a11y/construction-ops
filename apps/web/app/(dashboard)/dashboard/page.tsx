/**
 * Dashboard principal — Oleada 3A.
 *
 * Server Component. Propiedad: agent-dashboard.
 *
 * Consume DashboardSummary desde el accesor temporal de dev (fixture).
 * CERO cálculo financiero en React: los valores llegan como DecimalString
 * ya calculados por cost-domain (vía fixture del golden master).
 *
 * TEMP integración 3A: `getDashboardSummaryFromFixture` debe reemplazarse por
 * `getReadModel().getDashboardSummary(viewer, projectId)` cuando db-rls
 * entregue la implementación de @/server/read-model.
 *
 * Privacidad: campos 🔒 (projectedSaving, realizedSaving, pricingCoverage)
 * solo se pasan a componentes cuando el viewer.role es management/internal.
 * Para rol `client`, esos campos no se pasan ni se renderizan.
 */

import { DollarSign, TrendingUp, BarChart2, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { KpiCard, FinancialKpiCard } from '@/modules/dashboard/kpi-card';
import { ChapterDistributionSection } from '@/modules/dashboard/chapter-distribution-section';
import { SavingsSection } from '@/modules/dashboard/savings-section';
import { getDashboardSummaryFromFixture } from '@/modules/dashboard/dev-read-model';
import { formatCOP, formatDateTime, ESTIMATE_VERSION_STATUS_LABELS } from '@/lib/utils/format';
import type { ViewerContext } from '@/lib/contracts/read-model';

// ---------------------------------------------------------------------------
// Contexto de viewer para demo (modo fixture).
// En producción, esto vendrá de la sesión de auth (server-side, no de query params).
// TEMP integración 3A: reemplazar por resolución real de sesión.
// ---------------------------------------------------------------------------
const DEMO_VIEWER: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  role: 'management', // demo como gerencia para mostrar todos los KPIs
};

// ID del proyecto piloto (del fixture sanitizado)
const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000010';

export default async function DashboardPage() {
  // Obtener el resumen — en producción: await getReadModel().getDashboardSummary(viewer, projectId)
  const summary = getDashboardSummaryFromFixture(DEMO_VIEWER, DEMO_PROJECT_ID);

  const isAuthorizedForSavings =
    DEMO_VIEWER.role === 'management' || DEMO_VIEWER.role === 'internal';

  const statusLabel =
    ESTIMATE_VERSION_STATUS_LABELS[summary.estimateStatus] ?? summary.estimateStatus;

  return (
    <div>
      <PageHeader
        title="Dashboard gerencial"
        description="Resumen financiero — ENTRE PATIOS (Primer Piso)"
      />

      {/* ------------------------------------------------------------------ */}
      {/* KPIs financieros principales                                         */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Resumen financiero" className="mt-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total presupuesto"
            value={formatCOP(summary.budget)}
            description="Costos directos + AIU"
            valueColor="text-blue-700"
            icon={<DollarSign className="h-4 w-4 text-blue-700" />}
            iconBg="bg-blue-50"
          />
          <KpiCard
            title="Costos directos"
            value={formatCOP(summary.directCost)}
            description="Σ capítulos BOQ"
            icon={<TrendingUp className="h-4 w-4 text-green-700" />}
            iconBg="bg-green-50"
          />
          <KpiCard
            title="Costos indirectos (AIU)"
            value={formatCOP(summary.indirectCost)}
            description="Administración + Imprevistos + Utilidad + IVA"
            icon={<BarChart2 className="h-4 w-4 text-amber-700" />}
            iconBg="bg-amber-50"
          />
          <KpiCard
            title="Estado del presupuesto"
            value={statusLabel}
            description={`Actualizado: ${formatDateTime(summary.lastUpdatedAt)}`}
            icon={<Calendar className="h-4 w-4 text-purple-700" />}
            iconBg="bg-purple-50"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Resumen financiero compacto                                          */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Desglose financiero" className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Desglose financiero
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FinancialKpiCard
            title="Costos directos"
            value={formatCOP(summary.directCost)}
            valueColor="text-gray-900"
          />
          <FinancialKpiCard
            title="Costos indirectos (AIU)"
            value={formatCOP(summary.indirectCost)}
            valueColor="text-gray-900"
          />
          <FinancialKpiCard
            title="Total presupuesto"
            value={formatCOP(summary.budget)}
            valueColor="text-blue-700"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Distribución por capítulo (Recharts)                                 */}
      {/* ------------------------------------------------------------------ */}
      <ChapterDistributionSection
        chapterDistribution={summary.chapterDistribution}
        topChapters={summary.topChapters}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Ahorro e indicadores internos (🔒 solo management/internal)         */}
      {/* ------------------------------------------------------------------ */}
      {isAuthorizedForSavings && (
        <SavingsSection
          projectedSaving={summary.projectedSaving}
          realizedSaving={summary.realizedSaving}
          pricingCoverage={summary.pricingCoverage}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Aviso modo fixture                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        role="status"
        aria-live="polite"
      >
        <strong>Modo fixture — Oleada 3A.</strong> Los valores mostrados provienen
        del golden master sanitizado (ENTRE PATIOS — Primer Piso). En integración,
        el orquestador reemplaza el accesor temporal por{' '}
        <code className="font-mono text-xs">@/server/read-model</code> (db-rls).
      </div>
    </div>
  );
}
