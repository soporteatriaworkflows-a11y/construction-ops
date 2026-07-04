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
  TrendingUp,
  LayoutDashboard,
  FolderOpen,
  Send,
  Tags,
  ArrowRight,
  Package,
  Truck,
  Radar,
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  CheckCircle2,
  CalendarRange,
  Sparkles,
} from 'lucide-react';
import { OperationsHeader } from '@/components/shared/operations-header';
import { SurfaceCard } from '@/components/shared/surface-card';
import { NotesCard } from '@/components/shared/notes-card';
import { OperationsTimelineCard } from '@/components/shared/operations-timeline-card';
import { WorkflowStrip } from '@/components/shared/workflow-strip';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { costSplitPct } from '@/modules/dashboard/visual-metrics';
import { Sparkbars } from '@/modules/dashboard/command-center';
import { ChapterDistributionSection } from '@/modules/dashboard/chapter-distribution-section';
import { SavingsSection } from '@/modules/dashboard/savings-section';
import { getReadModel, resolveSource } from '@/server/read-model';
import { getEstimatesWriteRepository } from '@/server/estimates';
import { getObservationRepository } from '@/server/pricing';
import { getMonitorRepository } from '@/server/pricing/monitor';
import { formatCountdown } from '@/lib/pricing/monitor-ui';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAccessActor } from '@/server/access';
import { canAccessModule, isAccessModule, type AccessModule } from '@/server/access/module-access';
import { isScopedProfileRole } from '@/server/auth/types';
import { canUseQuoteAssistant } from '@/lib/access/surface-visibility';
import { AuthError } from '@/server/auth/errors';
import { InviteMembershipRecovery } from '@/components/auth/invite-membership-recovery';
import { formatCOP, formatDateTime, ESTIMATE_VERSION_STATUS_LABELS } from '@/lib/utils/format';
import type { ProjectListItem } from '@/lib/contracts/read-model';
import { isCreationModeEnabled } from '../projects/mode-guard';
import {
  projectIdFromSearchParams,
  resolveDashboardProjectScope,
  type DashboardProjectScope,
} from './project-scope';
import {
  getDashboardQuickNotes,
  canViewQuickNotes,
  canCreateQuickNotes,
  type QuickNoteView,
} from '@/server/quick-notes';
import { createQuickNoteAction, archiveQuickNoteAction } from './notes-actions';
import { DeniedModuleCallout } from './denied-module-callout';

/** Render en REQUEST-TIME (ver cabecera). Igual que `/projects` y `/projects/new`. */
export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

/** Métrica plana (tira hairline; sin caja). Tono semántico opcional en el valor. */
function DashMetric({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
}) {
  const valueColor =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'danger'
        ? 'text-red-700 dark:text-red-300'
        : tone === 'ok'
          ? 'text-green-700 dark:text-green-300'
          : 'text-content';
  return (
    <div className="bg-surface p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-content-muted">{label}</p>
      <p className={`mt-1 font-display text-lg font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-content-muted">{sub}</p>}
    </div>
  );
}

/** Bloque de error amable reutilizable (mismo patrón que `/projects`). */
function DashboardError({ message }: { message: string }) {
  return (
    <div>
      <OperationsHeader eyebrow="Panel" title="Centro de control" />
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

function DashboardScopeSelector({
  projects,
  scope,
}: {
  projects: ProjectListItem[];
  scope: DashboardProjectScope;
}) {
  const selectedId = scope.mode === 'project' ? scope.selectedProject.id : null;

  return (
    <section aria-label="Alcance del dashboard" className="mb-5 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
            Alcance del dashboard
          </p>
          <p className="text-sm font-semibold text-content">
            {scope.mode === 'project' ? scope.selectedProject.name : 'Todos los proyectos'}
          </p>
          <p className="text-xs text-content-muted">
            {scope.mode === 'project'
              ? 'Vista filtrada por proyecto: presupuesto, capítulos y notas rápidas usan este alcance.'
              : 'Vista global: KPIs de organización/catálogo. El presupuesto se muestra como proyecto destacado.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={selectedId === null ? 'default' : 'outline'}>
            <Link href="/dashboard">Todos los proyectos</Link>
          </Button>
          {projects.map((project) => (
            <Button
              key={project.id}
              asChild
              size="sm"
              variant={selectedId === project.id ? 'default' : 'outline'}
            >
              <Link href={`/dashboard?projectId=${encodeURIComponent(project.id)}`}>
                {project.name}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      {scope.invalidProjectId && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          El proyecto solicitado no está disponible para este usuario. Mostrando vista global.
        </p>
      )}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // Viewer por modo: supabase=autenticado (lee cookies → dinámico); demo=fixture.
  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch (e) {
    // Usuario Auth CONFIRMADO pero sin `profiles`: casi siempre una invitación
    // cuyo cierre no llegó a ejecutarse. En vez de dejarlo sin salida, intenta
    // finalizar la invitación (token persistido en su navegador) y sólo recarga
    // al panel tras un cierre confirmado por el RPC (deny-by-default).
    if (e instanceof AuthError && e.reason === 'no_membership') {
      return <InviteMembershipRecovery />;
    }
    // Sin sesión en modo supabase: el Proxy redirige a /login antes de llegar.
    const msg = e instanceof Error ? e.message : 'Error al resolver la sesión.';
    return <DashboardError message={msg} />;
  }

  const rm = getReadModel();

  const params = await searchParams;
  const requestedProjectId = projectIdFromSearchParams(params);
  const deniedParam = typeof params.denied === 'string' ? params.denied : null;
  const deniedModule = isAccessModule(deniedParam) ? deniedParam : null;

  let profileRole: string | null = null;
  try {
    profileRole = (await resolveAccessActor()).profileRole;
  } catch {
    profileRole = null;
  }

  // Alcance derivado de la lista REAL de proyectos visibles (sin UUID demo).
  let projects: ProjectListItem[] = [];
  let scope: DashboardProjectScope;
  let projectId: string | null;
  let projectCount = 0;
  try {
    projects = await rm.listProjects(viewer);
    projectCount = projects.length;
    scope = resolveDashboardProjectScope(projects, requestedProjectId);
    projectId = scope.highlightedProject?.id ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al cargar proyectos';
    return <DashboardError message={`Error al cargar proyectos: ${msg}`} />;
  }

  const canCreate = isCreationModeEnabled();
  const isFixtureMode = resolveSource(process.env.READ_MODEL_SOURCE) === 'fixture';

  // Base sin proyectos: organización recién creada, o (V5.6.4 + V5.6.6C) un
  // usuario de rol scoped (consulta/obra/compras) sin proyectos asignados —
  // estado deliberado, nunca un error.
  if (!projectId) {
    const isConsulta = isScopedProfileRole(profileRole);
    return (
      <div>
        <OperationsHeader
          eyebrow="Panel"
          title="Centro de control"
          subtitle="Vista global de organizacion"
        />
        {deniedModule && <DeniedModuleCallout module={deniedModule} />}
      <DashboardScopeSelector projects={projects} scope={scope} />
        <EmptyState
          icon={LayoutDashboard}
          title={isConsulta ? 'Aún no tienes proyectos asignados' : 'Sin proyectos para resumir'}
          description={
            isConsulta
              ? 'La persona que administra tu acceso puede asignarte proyectos desde Accesos. Cuando lo haga, verás aquí su resumen.'
              : 'Aún no hay proyectos en esta organización. Crea el primero para ver el resumen financiero.'
          }
          action={
            isConsulta ? undefined : canCreate ? (
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

  const selectedProjectId = scope.mode === 'project' ? scope.selectedProject.id : null;
  const dashboardActionHref = selectedProjectId ? `/projects/${selectedProjectId}` : '/projects';
  const dashboardActionLabel = selectedProjectId ? 'Ver proyecto' : 'Ver proyectos';
  const scopeSubtitle = scope.mode === 'project'
    ? `Vista de proyecto: ${scope.selectedProject.name}`
    : 'Vista global de organizacion. KPIs de organizacion/catalogo cuando aplica.';
  const isAuthorizedForSavings = viewer.role === 'management' || viewer.role === 'internal';
  const canOpenModule = (module: AccessModule) => canAccessModule(profileRole, module);
  const canOpenAssistant = canUseQuoteAssistant(profileRole);
  const canReviewPrices = canOpenModule('operational-review');
  const canMonitorPrices = canOpenModule('monitoring');
  const canViewPricingInsights = canOpenModule('price-intelligence');
  // ------------------------------------------------------------------
  // KPIs operativos (Oleada OPERATIONAL BUDGET UX V1) — lecturas aditivas,
  // tolerantes a fallo (null ⇒ la tarjeta no muestra valor, no rompe la página).
  // ------------------------------------------------------------------
  let activeEstimateCount: number | null = null;
  let issuedVersionCount: number | null = null;
  try {
    const estimatesRepo = getEstimatesWriteRepository();
    const estimates = await estimatesRepo.listVisibleEstimates(viewer);
    activeEstimateCount = estimates.filter((e) => e.status === 'active' && (!selectedProjectId || e.projectId === selectedProjectId)).length;
    issuedVersionCount = await estimatesRepo.countIssuedEstimateVersions(viewer);
  } catch {
    activeEstimateCount = null;
    issuedVersionCount = null;
  }

  // 🔒 Pendientes de revisión de precios: solo roles management/internal.
  let pendingPriceCount: number | null = null;
  if (isAuthorizedForSavings && canReviewPrices) {
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
  if (isAuthorizedForSavings && canMonitorPrices) {
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

  // Notas rápidas internas (V5.4.2c) — privacy-first: `client` no ve/crea/archiva
  // (no se llama al repositorio). Lectura tolerante a fallo (no rompe el dashboard).
  const canViewNotes = canViewQuickNotes(viewer.role);
  const canCreateNotes = canCreateQuickNotes(viewer.role);
  let quickNotes: QuickNoteView[] = [];
  if (canViewNotes) {
    try {
      quickNotes = await getDashboardQuickNotes({
        userId: viewer.profileId ?? viewer.organizationId,
        profileId: viewer.profileId ?? viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      }, undefined, selectedProjectId);
    } catch {
      quickNotes = [];
    }
  }

  const statusLabel =
    ESTIMATE_VERSION_STATUS_LABELS[summary.estimateStatus] ?? summary.estimateStatus;
  const budgetScopeLabel = selectedProjectId
    ? `Total presupuesto - ${statusLabel}`
    : `Proyecto destacado - ${scope.highlightedProject?.name ?? 'Sin proyecto'} - ${statusLabel}`;
  const split = costSplitPct(summary.directCost, summary.budget);
  const sparkValues = summary.chapterDistribution.map((s) => Number(s.share)).filter((n) => Number.isFinite(n));
  // Capítulo de mayor peso (insight) — selección sobre shares YA calculados.
  const topSlice = summary.chapterDistribution.reduce<(typeof summary.chapterDistribution)[number] | null>(
    (best, s) => (best === null || Number(s.share) > Number(best.share) ? s : best),
    null,
  );

  const workflowSteps = [
    { href: '/quote', label: 'Cotizar con asistente', icon: Sparkles, module: 'estimates' as const, requiresAssistant: true },
    { href: '/projects', label: 'Proyectos', icon: FolderOpen, module: 'projects' as const },
    { href: '/catalog', label: 'Catálogo', icon: Package, module: 'catalog' as const },
    { href: '/catalog/providers', label: 'Proveedores', icon: Truck, module: 'catalog' as const },
    { href: '/catalog', label: 'Inteligencia de precios', icon: Tags, module: 'price-intelligence' as const },
    { href: '/catalog/monitoring', label: 'Monitoreo de precios', icon: Radar, module: 'monitoring' as const },
    { href: '/catalog/prices/review', label: 'Revisión de precios', icon: ClipboardCheck, module: 'operational-review' as const },
  ].filter((step) => (step.requiresAssistant ? canOpenAssistant : canOpenModule(step.module)));

  const alertCards = [
    canReviewPrices
      ? {
          href: '/catalog/prices/review',
          label: 'Precios por revisar',
          count: pendingPriceCount,
          actionLabel: 'observaciones por revisar',
          clearLabel: 'Sin precios pendientes',
          icon: <Tags className="h-5 w-5" aria-hidden="true" />,
        }
      : null,
    canMonitorPrices
      ? {
          href: '/catalog/monitoring',
          label: 'Cambios de precio detectados',
          count: monitoringSummary ? monitoringSummary.pendingChangesCount : null,
          actionLabel: 'cambios por revisar',
          clearLabel: 'Sin cambios pendientes',
          icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />,
        }
      : null,
    canMonitorPrices
      ? {
          href: '/catalog/monitoring',
          label: 'Fuentes con error',
          count: monitoringSummary ? monitoringSummary.erroredCount : null,
          actionLabel: 'fuentes con fallos',
          clearLabel: 'Sin fuentes con error',
          icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
          tone: 'red' as const,
        }
      : null,
  ].filter((card): card is NonNullable<typeof card> => card !== null);

  return (
    <div>
      <OperationsHeader
        eyebrow={selectedProjectId ? 'Panel de proyecto' : 'Panel global'}
        title="Centro de control"
        subtitle={scopeSubtitle}
      />
      {deniedModule && <DeniedModuleCallout module={deniedModule} />}
      <DashboardScopeSelector projects={projects} scope={scope} />

      {/* ZONA 1 — Centro de mando (grid modular de cards; navy SOLO como acento) */}
      <section aria-label="Centro de mando" className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* Card PRIMARY: resumen + métricas integradas */}
        <SurfaceCard variant="primary" className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-iconic-primary dark:text-iconic-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                Centro de mando
              </p>
              <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wide text-content-muted">
                {budgetScopeLabel}
              </p>
              <p className="font-display text-[2.5rem] font-bold leading-none tracking-tight tabular-nums text-content">
                {formatCOP(summary.budget)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={dashboardActionHref}>{dashboardActionLabel}</Link>
              </Button>
              {canOpenModule('planning') && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/planning"><CalendarRange className="h-4 w-4" aria-hidden="true" />Cronograma</Link>
                </Button>
              )}
              {canOpenModule('catalog') && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/catalog"><Package className="h-4 w-4" aria-hidden="true" />Catálogo</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Composición de costo — instrumento firma (específico de obra) */}
          {split.directPct + split.indirectPct > 0 && (
            <div className="mt-5">
              <div className="flex h-2 w-full max-w-xl overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                <span className="block h-full bg-iconic-primary" style={{ width: `${split.directPct}%` }} />
                <span className="block h-full bg-iconic-cyan/70" style={{ width: `${split.indirectPct}%` }} />
              </div>
              <div className="mt-2 flex gap-5 text-[11px] text-content-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-iconic-primary" aria-hidden="true" />Directos <strong className="font-semibold text-content">{split.directPct}%</strong></span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-iconic-cyan/70" aria-hidden="true" />Indirectos AIU <strong className="font-semibold text-content">{split.indirectPct}%</strong></span>
              </div>
            </div>
          )}

          {/* Métricas integradas — tira hairline */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            <DashMetric label="Costos directos" value={formatCOP(summary.directCost)} />
            <DashMetric label="Indirectos (AIU)" value={formatCOP(summary.indirectCost)} />
            <DashMetric label="Proyectos" value={String(projectCount)} sub="organizacion" />
            <DashMetric label="Presupuestos activos" value={activeEstimateCount === null ? '—' : String(activeEstimateCount)} sub={selectedProjectId ? "proyecto" : "organizacion"} />
          </div>
        </SurfaceCard>

        {/* Card CHART compacta: distribución por capítulo (ya no ocupa media pantalla) */}
        <SurfaceCard variant="chart" className="flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">Distribución por capítulo</p>
            <span className="text-[11px] text-content-muted">{sparkValues.length} cap.</span>
          </div>
          {sparkValues.length > 0 ? (
            <div className="mt-3 h-24 flex-1">
              <Sparkbars values={sparkValues} />
            </div>
          ) : (
            <p className="mt-4 flex-1 text-sm text-content-muted">Sin capítulos para graficar todavía.</p>
          )}
          <p className="mt-3 text-[11px] text-content-muted">Peso por capítulo · {formatDateTime(summary.lastUpdatedAt)}</p>
        </SurfaceCard>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ZONA 2 — Operación / estado de módulos                               */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Operación" className="mt-2 space-y-4">
        <h2 className="font-display text-base font-semibold tracking-tight text-content">Operación</h2>

        {/* Fila B — panel Operación unificado: KPIs compactos a ancho completo. Quick Notes
            se movió a "Pulso operativo" (abajo) para NO estirar la altura de estos KPIs. */}
        <SurfaceCard variant="primary" className="overflow-hidden p-0">
            <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Capítulo de mayor peso */}
              <div className="p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                  <TrendingUp className="h-3.5 w-3.5 text-iconic-primary/70" aria-hidden="true" />
                  Capítulo de mayor peso
                </p>
                {topSlice ? (
                  <>
                    <p className="mt-2 truncate text-sm font-bold text-content">
                      <span className="font-mono text-xs text-content-muted">{topSlice.code}</span> {topSlice.name}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                        <span className="block h-full rounded-full bg-gradient-to-r from-iconic-primary to-iconic-cyan" style={{ width: `${Math.min(100, Math.round(Number(topSlice.share) * 100))}%` }} />
                      </div>
                      <span className="shrink-0 font-display text-sm font-bold tabular-nums text-iconic-primary">{Math.round(Number(topSlice.share) * 100)}%</span>
                    </div>
                    <p className="mt-1 text-[11px] text-content-muted">del costo directo</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-content-muted">Sin capítulos todavía.</p>
                )}
              </div>

              {/* Versiones emitidas */}
              <div className="p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                  <Send className="h-3.5 w-3.5 text-iconic-primary/70" aria-hidden="true" />
                  Versiones emitidas
                </p>
                <p className="mt-2 font-display text-2xl font-bold tabular-nums text-content">
                  {issuedVersionCount === null ? '—' : issuedVersionCount}
                </p>
                <p className="mt-1 text-[11px] text-content-muted">Snapshots inmutables entregados - organizacion</p>
              </div>

              {/* Precios por revisar */}
              {canReviewPrices && (
                <div className="p-4">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                    <Tags className="h-3.5 w-3.5 text-iconic-primary/70" aria-hidden="true" />
                    Precios por revisar
                  </p>
                  <p className={`mt-2 font-display text-2xl font-bold tabular-nums ${pendingPriceCount && pendingPriceCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-content'}`}>
                    {pendingPriceCount === null ? '—' : pendingPriceCount}
                  </p>
                  <Link href="/catalog/prices/review" className="mt-1 inline-block text-[11px] font-medium text-iconic-primary hover:underline">
                    Abrir revisión masiva
                  </Link>
                </div>
              )}
            </div>
        </SurfaceCard>

        {/* Pulso operativo — franja inferior: Quick Notes (angosto 4/12) + línea de tiempo
            operativa longitudinal (8/12). Aislado de los KPIs de arriba: no los estira.
            En móvil se apila (Notas arriba, timeline abajo). `client` no ve Quick Notes. */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
            Pulso operativo
          </h3>
          <div className="grid gap-4 lg:grid-cols-12">
            {canViewNotes && (
              <NotesCard
                className="lg:col-span-4"
                notes={quickNotes}
                projectId={selectedProjectId}
                canCreate={canCreateNotes}
                createAction={createQuickNoteAction}
                archiveAction={archiveQuickNoteAction}
              />
            )}
            <OperationsTimelineCard
              className={canViewNotes ? 'lg:col-span-8' : 'lg:col-span-12'}
              lastUpdatedAt={summary.lastUpdatedAt}
              lastRunAt={monitoringSummary?.lastRunAt ?? null}
            />
          </div>
        </div>

        {/* Fila C — Monitoreo automático de precios (panel consolidado + subzona de tiempo) */}
        {canMonitorPrices && monitoringSummary && (
          <SurfaceCard variant="primary" className="overflow-hidden p-0">
            <div className="flex flex-col lg:flex-row">
              <div className="flex-1 p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                  <Radar className="h-3.5 w-3.5 text-iconic-primary/70" aria-hidden="true" />
                  Monitoreo automático de precios
                </p>
                <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                  <DashMetric label="Fuentes monitoreadas" value={String(monitoringSummary.monitoredCount)} sub={`catalogo - ${monitoringSummary.activeCount} activas - ${monitoringSummary.pausedCount} pausadas`} />
                  <DashMetric label="Cambios pendientes" value={String(monitoringSummary.pendingChangesCount)} tone={monitoringSummary.pendingChangesCount > 0 ? 'warn' : 'ok'} sub="catalogo - por revisar" />
                  <DashMetric label="Fuentes con error" value={String(monitoringSummary.erroredCount)} tone={monitoringSummary.erroredCount > 0 ? 'danger' : 'ok'} sub="catalogo - 3+ fallos" />
                  <DashMetric label="Fuentes vencidas" value={String(monitoringSummary.overdueCount)} tone={monitoringSummary.overdueCount > 0 ? 'warn' : 'ok'} sub="catalogo - proxima revision" />
                </div>
              </div>

              {/* Subzona de tiempo — anillo countdown (estilo target) + Última revisión real */}
              <div className="flex items-center gap-4 border-t border-line p-4 lg:w-72 lg:border-l lg:border-t-0">
                {/* Anillo de "próxima revisión" — decorativo; el tiempo real (nextReviewAt) se muestra al lado. */}
                <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-surface-muted" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
                      pathLength={100} strokeDasharray="100" strokeDashoffset={28}
                      className="stroke-iconic-primary dark:stroke-iconic-cyan"
                    />
                  </svg>
                  {/* Centro limpio: solo un ícono (el tiempo vive afuera, sin duplicar). */}
                  <span className="absolute inset-0 flex items-center justify-center text-iconic-primary dark:text-iconic-cyan">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-content-muted">Próxima revisión</p>
                  <p className="font-display text-base font-bold tabular-nums text-content">
                    {formatCountdown(monitoringSummary.nextReviewAt)}
                  </p>
                  {monitoringSummary.nextTargetLabel && (
                    <p className="truncate text-[11px] text-content-muted" title={monitoringSummary.nextTargetLabel}>
                      {monitoringSummary.nextTargetLabel}
                    </p>
                  )}
                  <p className="mt-1 truncate text-[11px] text-content-muted">
                    Última: {monitoringSummary.lastRunAt ? formatDateTime(monitoringSummary.lastRunAt) : 'sin corridas'}
                  </p>
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        {/* Fila D — Workflow strip (reemplaza las cards de acceso rápido) */}
        {workflowSteps.length > 0 && (
          <SurfaceCard variant="metric" className="px-3 py-4">
            <WorkflowStrip steps={workflowSteps.map((step, index) => ({ ...step, current: index === 0 }))} />
          </SurfaceCard>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pendientes y alertas — qué requiere acción (datos ya disponibles)    */}
      {/* ------------------------------------------------------------------ */}
      {alertCards.length > 0 && (
        <section aria-label="Pendientes y alertas" className="mt-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Pendientes y alertas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {alertCards.map((card) => (
              <AlertCard key={card.href + card.label} {...card} />
            ))}
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
      {isAuthorizedForSavings && canViewPricingInsights && (
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
