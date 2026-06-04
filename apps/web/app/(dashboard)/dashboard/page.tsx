/**
 * Dashboard principal — Oleada 3A / endurecido 4B.1.
 *
 * Server Component. Propiedad: agent-dashboard.
 *
 * CERO cálculo financiero en React: los valores llegan como DecimalString
 * ya calculados por cost-domain (vía read-model: fixture o Drizzle/Postgres).
 *
 * Render REQUEST-TIME (no prerender estático):
 *  - `export const dynamic = 'force-dynamic'` (flag explícito).
 *  - Señal dinámica intrínseca: resuelve el viewer (que en modo `supabase` lee
 *    `cookies()`), igual que `/projects`. Esto evita que Next prerenderice la
 *    página durante el build y la ejecute contra la base — comportamiento que,
 *    en modo `db` con base vacía, lanzaba `ProjectNotFoundError` al resolver un
 *    UUID demo fijo. El proyecto activo se deriva ahora de los proyectos REALES
 *    visibles para el viewer; si no hay ninguno, se muestra estado vacío.
 *
 * Privacidad: campos 🔒 (projectedSaving, realizedSaving, pricingCoverage)
 * solo se pasan a componentes cuando el viewer.role es management/internal.
 * Para rol `client`, esos campos no se pasan ni se renderizan.
 */

import Link from 'next/link';
import { DollarSign, TrendingUp, BarChart2, Calendar, LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { KpiCard, FinancialKpiCard } from '@/modules/dashboard/kpi-card';
import { ChapterDistributionSection } from '@/modules/dashboard/chapter-distribution-section';
import { SavingsSection } from '@/modules/dashboard/savings-section';
import { getReadModel, resolveSource } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { formatCOP, formatDateTime, ESTIMATE_VERSION_STATUS_LABELS } from '@/lib/utils/format';
import { isCreationModeEnabled } from '../projects/mode-guard';
import { selectActiveProjectId } from './select-active-project';

/** Render en REQUEST-TIME (ver cabecera). Igual que `/projects` y `/projects/new`. */
export const dynamic = 'force-dynamic';

/** Bloque de error amable reutilizable (mismo patrón que `/projects`). */
function DashboardError({ message }: { message: string }) {
  return (
    <div>
      <PageHeader title="Dashboard gerencial" />
      <div
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
        aria-live="assertive"
      >
        {message}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  // Viewer por modo: supabase=autenticado (lee cookies → dinámico); demo=fixture.
  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch (e) {
    // Sin sesión en modo supabase: el Proxy redirige a /login antes de llegar.
    const msg = e instanceof Error ? e.message : 'Error al resolver la sesión.';
    return <DashboardError message={msg} />;
  }

  const rm = getReadModel();

  // Proyecto activo derivado de la lista REAL de proyectos visibles (sin UUID demo).
  let projectId: string | null;
  try {
    const projects = await rm.listProjects(viewer);
    projectId = selectActiveProjectId(projects);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al cargar proyectos';
    return <DashboardError message={`Error al cargar proyectos: ${msg}`} />;
  }

  const canCreate = isCreationModeEnabled();
  const isFixtureMode = resolveSource(process.env.READ_MODEL_SOURCE) === 'fixture';

  // Base sin proyectos (p. ej. organización productiva recién creada): estado vacío.
  if (!projectId) {
    return (
      <div>
        <PageHeader
          title="Dashboard gerencial"
          description="Resumen financiero de la organización"
        />
        <EmptyState
          icon={LayoutDashboard}
          title="Sin proyectos para resumir"
          description="Aún no hay proyectos en esta organización. Crea el primero para ver el resumen financiero."
          action={
            canCreate ? (
              <Link href="/projects/new">
                <Button size="sm">Crear primer proyecto</Button>
              </Link>
            ) : (
              <Link href="/projects">
                <Button size="sm" variant="outline">
                  Ir a proyectos
                </Button>
              </Link>
            )
          }
        />
      </div>
    );
  }

  let summary: Awaited<ReturnType<typeof rm.getDashboardSummary>>;
  try {
    summary = await rm.getDashboardSummary(viewer, projectId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al cargar el resumen';
    return <DashboardError message={`Error al cargar el resumen: ${msg}`} />;
  }

  const isAuthorizedForSavings = viewer.role === 'management' || viewer.role === 'internal';

  const statusLabel =
    ESTIMATE_VERSION_STATUS_LABELS[summary.estimateStatus] ?? summary.estimateStatus;

  return (
    <div>
      <PageHeader
        title="Dashboard gerencial"
        description="Resumen financiero del proyecto activo"
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
      {/* Aviso modo fixture (solo cuando READ_MODEL_SOURCE=fixture)           */}
      {/* ------------------------------------------------------------------ */}
      {isFixtureMode && (
        <div
          className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          <strong>Modo fixture.</strong> Los valores mostrados provienen del golden
          master sanitizado (ENTRE PATIOS — Primer Piso). En modo{' '}
          <code className="font-mono text-xs">db</code> los datos provienen de la
          base productiva vía read-model.
        </div>
      )}
    </div>
  );
}
