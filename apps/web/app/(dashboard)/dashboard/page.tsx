/**
 * Dashboard principal — endurecido 4B.1+.
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
  ClipboardCheck,
  CheckCircle2,
  CalendarRange,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/modules/dashboard/kpi-card';
import { costSplitPct } from '@/modules/dashboard/visual-metrics';
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

/**
 * Acceso rápido del dashboard operativo (navegación, sin datos sensibles).
 * Tile tipo "centro de control": ícono en placa de marca + etiqueta + flecha.
 */
function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-iconic-primary/40 hover:shadow-iconic"
    >
      <span className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-iconic-primary transition-colors group-hover:bg-iconic-primary group-hover:text-white">
          {icon}
        </span>
        <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-iconic-primary" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium leading-tight text-iconic-ink">{label}</span>
    </Link>
  );
}

/**
 * Tarjeta de pendiente/alerta con estado vacío premium. `count`:
 *  - `null`   → dato no disponible (neutro).
 *  - `0`      → "todo al día" (verde, sin acción).
 *  - `> 0`    → requiere acción (tono ámbar/rojo + enlace).
 */
function AlertCard({
  href,
  label,
  count,
  actionLabel,
  clearLabel,
  icon,
  tone = 'amber',
}: {
  href: string;
  label: string;
  count: number | null;
  actionLabel: string;
  clearLabel: string;
  icon: React.ReactNode;
  tone?: 'amber' | 'red';
}) {
  const actionable = typeof count === 'number' && count > 0;
  const toneRing = tone === 'red' ? 'border-red-200' : 'border-amber-200';
  const toneText = tone === 'red' ? 'text-red-700' : 'text-amber-700';
  const toneBg = tone === 'red' ? 'bg-red-50' : 'bg-amber-50';
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-iconic ${actionable ? toneRing : 'border-gray-200'}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${actionable ? toneBg : 'bg-green-50'}`}>
        {actionable ? <span className={toneText}>{icon}</span> : <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {count === null ? (
          <p className="text-sm font-semibold text-gray-400">—</p>
        ) : actionable ? (
          <p className={`text-sm font-semibold ${toneText}`}>
            <span className="tabular-nums">{count}</span> · {actionLabel}
          </p>
        ) : (
          <p className="text-sm font-semibold text-green-700">{clearLabel}</p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-iconic-primary" aria-hidden="true" />
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
  const split = costSplitPct(summary.directCost, summary.budget);

  return (
    <div>
      {/* Hero ejecutivo — centro de control ICONIC (navy → azul, acento cian) */}
      <section
        className="relative mb-6 overflow-hidden rounded-2xl px-6 py-7 text-white shadow-iconic"
        style={{ background: 'linear-gradient(120deg, #020148 0%, #013E97 55%, #005DD6 100%)' }}
      >
        <svg className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 text-white/[0.07]" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M400,0 L400,200 L80,200 C260,140 120,60 400,0 Z" fill="currentColor" />
          <circle cx="330" cy="48" r="120" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-iconic-cyan">Centro de control</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Resumen del proyecto activo</h1>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-iconic-soft-blue/80">Total presupuesto</p>
                <p className="text-3xl font-bold tabular-nums">{formatCOP(summary.budget)}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/20">
                <span className="h-1.5 w-1.5 rounded-full bg-iconic-cyan" aria-hidden="true" />
                {statusLabel}
              </span>
            </div>
            {/* Micro-barra de composición directo vs indirecto (presentación) */}
            {split.directPct + split.indirectPct > 0 && (
              <div className="mt-4 max-w-md">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                  <span className="block h-full bg-iconic-cyan" style={{ width: `${split.directPct}%` }} />
                  <span className="block h-full bg-white/45" style={{ width: `${split.indirectPct}%` }} />
                </div>
                <div className="mt-1.5 flex gap-4 text-[11px] text-white/70">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-iconic-cyan" aria-hidden="true" />Directos {split.directPct}%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white/45" aria-hidden="true" />Indirectos (AIU) {split.indirectPct}%</span>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-white/60">Actualizado {formatDateTime(summary.lastUpdatedAt)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" className="bg-white text-iconic-ink hover:bg-iconic-soft-blue">
              <Link href={`/projects/${projectId}`}>Ver proyecto</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href="/planning"><CalendarRange className="h-4 w-4" aria-hidden="true" />Cronograma</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href="/catalog"><Package className="h-4 w-4" aria-hidden="true" />Catálogo</Link>
            </Button>
          </div>
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
            accent="primary"
            icon={<DollarSign className="h-4 w-4 text-iconic-primary" />}
            iconBg="bg-brand-50"
            bar={{ pct: split.directPct }}
          />
          <KpiCard
            title="Costos directos"
            value={formatCOP(summary.directCost)}
            description="Σ capítulos BOQ"
            accent="green"
            icon={<TrendingUp className="h-4 w-4 text-green-700" />}
            iconBg="bg-green-50"
          />
          <KpiCard
            title="Costos indirectos (AIU)"
            value={formatCOP(summary.indirectCost)}
            description="Administración + Imprevistos + Utilidad + IVA"
            accent="amber"
            icon={<BarChart2 className="h-4 w-4 text-amber-700" />}
            iconBg="bg-amber-50"
          />
          <KpiCard
            title="Estado del presupuesto"
            value={statusLabel}
            description={`Actualizado: ${formatDateTime(summary.lastUpdatedAt)}`}
            accent="cyan"
            icon={<Calendar className="h-4 w-4 text-iconic-primary" />}
            iconBg="bg-brand-50"
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
            accent="primary"
            icon={<FolderOpen className="h-4 w-4 text-iconic-primary" />}
            iconBg="bg-brand-50"
          />
          <KpiCard
            title="Presupuestos activos"
            value={activeEstimateCount === null ? '—' : String(activeEstimateCount)}
            description="Presupuestos de trabajo vigentes"
            accent="green"
            icon={<ClipboardList className="h-4 w-4 text-green-700" />}
            iconBg="bg-green-50"
          />
          <KpiCard
            title="Versiones emitidas"
            value={issuedVersionCount === null ? '—' : String(issuedVersionCount)}
            description="Snapshots inmutables entregados"
            accent="navy"
            icon={<Send className="h-4 w-4 text-iconic-ink" />}
            iconBg="bg-iconic-soft-blue/40"
          />
          {isAuthorizedForSavings && (
            <Link
              href="/catalog/prices/review"
              aria-label="Abrir el centro de revisión de precios"
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
            >
              <KpiCard
                title="Precios por revisar"
                value={pendingPriceCount === null ? '—' : String(pendingPriceCount)}
                description="Observaciones pendientes — abrir revisión masiva"
                accent={pendingPriceCount && pendingPriceCount > 0 ? 'amber' : 'green'}
                valueColor={pendingPriceCount && pendingPriceCount > 0 ? 'text-amber-700' : 'text-iconic-ink'}
                icon={<Tags className="h-4 w-4 text-amber-700" />}
                iconBg="bg-amber-50"
              />
            </Link>
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
                accent="primary"
                icon={<Radar className="h-4 w-4 text-iconic-primary" />}
                iconBg="bg-brand-50"
              />
              <KpiCard
                title="Cambios de precio pendientes"
                value={String(monitoringSummary.pendingChangesCount)}
                description="Detectados por el monitor, por revisar"
                accent={monitoringSummary.pendingChangesCount > 0 ? 'amber' : 'green'}
                valueColor={monitoringSummary.pendingChangesCount > 0 ? 'text-amber-700' : undefined}
                icon={<TrendingUp className="h-4 w-4 text-amber-700" />}
                iconBg="bg-amber-50"
              />
              <KpiCard
                title="Fuentes con error"
                value={String(monitoringSummary.erroredCount)}
                description="3+ fallos consecutivos"
                accent={monitoringSummary.erroredCount > 0 ? 'red' : 'green'}
                valueColor={monitoringSummary.erroredCount > 0 ? 'text-red-700' : undefined}
                icon={<AlertTriangle className="h-4 w-4 text-red-700" />}
                iconBg="bg-red-50"
              />
              <KpiCard
                title="Fuentes vencidas"
                value={String(monitoringSummary.overdueCount)}
                description="Pendientes de la próxima revisión"
                accent="navy"
                icon={<Clock className="h-4 w-4 text-iconic-ink" />}
                iconBg="bg-iconic-soft-blue/40"
              />
            </div>
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <QuickLink href="/projects" label="Proyectos" icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog" label="Catálogo" icon={<Package className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog/providers" label="Proveedores" icon={<Truck className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog" label="Inteligencia de precios" icon={<Tags className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog/monitoring" label="Monitoreo de precios" icon={<Radar className="h-4 w-4" aria-hidden="true" />} />
          <QuickLink href="/catalog/prices/review" label="Revisión de precios" icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />} />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pendientes y alertas — qué requiere acción (datos ya disponibles)    */}
      {/* ------------------------------------------------------------------ */}
      {isAuthorizedForSavings && (
        <section aria-label="Pendientes y alertas" className="mt-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Pendientes y alertas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AlertCard
              href="/catalog/prices/review"
              label="Precios por revisar"
              count={pendingPriceCount}
              actionLabel="observaciones por revisar"
              clearLabel="Sin precios pendientes"
              icon={<Tags className="h-5 w-5" aria-hidden="true" />}
            />
            <AlertCard
              href="/catalog/monitoring"
              label="Cambios de precio detectados"
              count={monitoringSummary ? monitoringSummary.pendingChangesCount : null}
              actionLabel="cambios por revisar"
              clearLabel="Sin cambios pendientes"
              icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
            />
            <AlertCard
              href="/catalog/monitoring"
              label="Fuentes con error"
              count={monitoringSummary ? monitoringSummary.erroredCount : null}
              actionLabel="fuentes con fallos"
              clearLabel="Sin fuentes con error"
              icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
              tone="red"
            />
          </div>
        </section>
      )}

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
