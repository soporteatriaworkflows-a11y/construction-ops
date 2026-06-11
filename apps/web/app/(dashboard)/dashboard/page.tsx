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
import {
  DollarSign,
  TrendingUp,
  BarChart2,
  Calendar,
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  Send,
  Tags,
  ArrowRight,
  Package,
  Truck,
  Radar,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { KpiCard, FinancialKpiCard } from '@/modules/dashboard/kpi-card';
import { ChapterDistributionSection } from '@/modules/dashboard/chapter-distribution-section';
import { SavingsSection } from '@/modules/dashboard/savings-section';
import { getReadModel, resolveSource } from '@/server/read-model';
import { getEstimatesWriteRepository } from '@/server/estimates';
import { getObservationRepository } from '@/server/pricing';
import { getMonitorRepository } from '@/server/pricing/monitor';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { formatCOP, formatDateTime, ESTIMATE_VERSION_STATUS_LABELS } from '@/lib/utils/format';
import { isCreationModeEnabled } from '../projects/mode-guard';
import { selectActiveProjectId } from './select-active-project';

/** Render en REQUEST-TIME (ver cabecera). Igual que `/projects` y `/projects/new`. */
export const dynamic = 'force-dynamic';

/** Acceso rápido del dashboard operativo (navegación, sin datos sensibles). */
function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-iconic-ink transition-colors hover:border-iconic-primary/40 hover:bg-brand-50"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-iconic-primary">{icon}</span>
        {label}
      </span>
      <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-iconic-primary" aria-hidden="true" />
    </Link>
  );
}

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
  let projectCount = 0;
  try {
    const projects = await rm.listProjects(viewer);
    projectCount = projects.length;
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
              <Button asChild size="sm">
                <Link href="/projects/new">Crear primer proyecto</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/projects">Ir a proyectos</Link>
              </Button>
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

  // ------------------------------------------------------------------
  // KPIs operativos (Oleada OPERATIONAL BUDGET UX V1) — lecturas aditivas,
  // tolerantes a fallo (null ⇒ la tarjeta no muestra valor, no rompe la página).
  // ------------------------------------------------------------------
  let activeEstimateCount: number | null = null;
  let issuedVersionCount: number | null = null;
  try {
    const estimatesRepo = getEstimatesWriteRepository();
    const estimates = await estimatesRepo.listVisibleEstimates(viewer);
    activeEstimateCount = estimates.filter((e) => e.status === 'active').length;
    issuedVersionCount = await estimatesRepo.countIssuedEstimateVersions(viewer);
  } catch {
    activeEstimateCount = null;
    issuedVersionCount = null;
  }

  // 🔒 Pendientes de revisión de precios: solo roles management/internal.
  let pendingPriceCount: number | null = null;
  if (isAuthorizedForSavings) {
    try {
      const pricingViewer = {
        userId: viewer.profileId ?? viewer.organizationId,
        profileId: viewer.profileId ?? viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      };
      pendingPriceCount = await getObservationRepository().countPendingResourcePriceObservations(
        pricingViewer,
      );
    } catch {
      pendingPriceCount = null;
    }
  }

  // 🔒 Monitoreo automático de precios (Fase 4A): KPIs tolerantes a fallo.
  let monitoringSummary: import('@/server/pricing/monitor').MonitoringSummary | null = null;
  if (isAuthorizedForSavings) {
    try {
      const pricingViewer = {
        userId: viewer.profileId ?? viewer.organizationId,
        profileId: viewer.profileId ?? viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      };
      monitoringSummary = await getMonitorRepository().getMonitoringSummary(pricingViewer);
    } catch {
      monitoringSummary = null;
    }
  }

  const statusLabel =
    ESTIMATE_VERSION_STATUS_LABELS[summary.estimateStatus] ?? summary.estimateStatus;

  return (
    <div>
      {/* Hero de marca ICONIC: bloque azul amplio + curva + detalle cian */}
      <section
        className="relative mb-6 overflow-hidden rounded-2xl px-6 py-7 text-white shadow-sm"
        style={{ background: 'linear-gradient(120deg, #020148 0%, #013E97 55%, #005DD6 100%)' }}
      >
        <svg className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 text-white/10" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M400,0 L400,200 L80,200 C260,140 120,60 400,0 Z" fill="currentColor" />
        </svg>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-iconic-soft-blue">Dashboard gerencial</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Resumen financiero del proyecto activo</h1>
          <p className="mt-1 text-sm text-white/75">
            Estado del presupuesto: <span className="font-semibold text-white">{statusLabel}</span>
            {' · '}Actualizado {formatDateTime(summary.lastUpdatedAt)}
          </p>
          <span className="mt-4 inline-block h-1 w-14 rounded bg-iconic-cyan" aria-hidden="true" />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* KPIs financieros principales                                         */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Resumen financiero" className="mt-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total presupuesto"
            value={formatCOP(summary.budget)}
            description="Costos directos + AIU"
            valueColor="text-iconic-ink"
            icon={<DollarSign className="h-4 w-4 text-iconic-primary" />}
            iconBg="bg-brand-50"
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
      {/* Operación (Oleada OPERATIONAL BUDGET UX V1)                          */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Operación" className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Operación</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Proyectos"
            value={String(projectCount)}
            description="Visibles para tu organización"
            icon={<FolderOpen className="h-4 w-4 text-iconic-primary" />}
            iconBg="bg-brand-50"
          />
          <KpiCard
            title="Presupuestos activos"
            value={activeEstimateCount === null ? '—' : String(activeEstimateCount)}
            description="Presupuestos de trabajo vigentes"
            icon={<ClipboardList className="h-4 w-4 text-green-700" />}
            iconBg="bg-green-50"
          />
          <KpiCard
            title="Versiones emitidas"
            value={issuedVersionCount === null ? '—' : String(issuedVersionCount)}
            description="Snapshots inmutables entregados"
            icon={<Send className="h-4 w-4 text-purple-700" />}
            iconBg="bg-purple-50"
          />
          {isAuthorizedForSavings && (
            <KpiCard
              title="Precios por revisar"
              value={pendingPriceCount === null ? '—' : String(pendingPriceCount)}
              description="Observaciones pendientes de aprobación"
              icon={<Tags className="h-4 w-4 text-amber-700" />}
              iconBg="bg-amber-50"
            />
          )}
        </div>

        {/* 🔒 Monitoreo automático de precios (Fase 4A) — solo management/internal */}
        {isAuthorizedForSavings && monitoringSummary && (
          <div className="mt-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Monitoreo automático de precios</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                title="Fuentes monitoreadas"
                value={String(monitoringSummary.monitoredCount)}
                description={`${monitoringSummary.activeCount} activas · ${monitoringSummary.pausedCount} pausadas`}
                icon={<Radar className="h-4 w-4 text-iconic-primary" />}
                iconBg="bg-brand-50"
              />
              <KpiCard
                title="Cambios de precio pendientes"
                value={String(monitoringSummary.pendingChangesCount)}
                description="Detectados por el monitor, por revisar"
                valueColor={monitoringSummary.pendingChangesCount > 0 ? 'text-amber-700' : undefined}
                icon={<TrendingUp className="h-4 w-4 text-amber-700" />}
                iconBg="bg-amber-50"
              />
              <KpiCard
                title="Fuentes con error"
                value={String(monitoringSummary.erroredCount)}
                description="3+ fallos consecutivos"
                valueColor={monitoringSummary.erroredCount > 0 ? 'text-red-700' : undefined}
                icon={<AlertTriangle className="h-4 w-4 text-red-700" />}
                iconBg="bg-red-50"
              />
              <KpiCard
                title="Fuentes vencidas"
                value={String(monitoringSummary.overdueCount)}
                description="Pendientes de la próxima revisión"
                icon={<Clock className="h-4 w-4 text-purple-700" />}
                iconBg="bg-purple-50"
              />
            </div>
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <QuickLink href="/projects" label="Proyectos" icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog" label="Catálogo" icon={<Package className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog/providers" label="Proveedores" icon={<Truck className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog" label="Inteligencia de precios" icon={<Tags className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog/monitoring" label="Monitoreo de precios" icon={<Radar className="h-4 w-4" aria-hidden="true" />} />
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
