/**
 * manual-takeoff-workspace.tsx — Workspace del flujo F3 "Manual Takeoff".
 *
 * Orquesta el flujo completo sin persistencia real: líneas manuales →
 * parser F1 → cálculo F1 → alertas F1 → plan de corte FFD F1 → pedido mock →
 * preparación de export. El estado vive en localStorage (`manual-store.ts`);
 * TODO lo derivado se recalcula con el dominio en cada render (useMemo).
 */
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineCallout } from '@/components/shared/inline-callout';
import { KpiCard } from '@/components/shared/kpi-card';
import { formatCop, formatDecimal, TAKEOFF_STATUS_LABEL } from '@/lib/steel/format';
import {
  buildManualCutPlan,
  buildManualOrderDraft,
  canEditManualLines,
  canTransitionManualTakeoff,
  computeManualLines,
  computeManualTotals,
  ensureDemoIntakeTakeoff,
  MANUAL_TAKEOFF_STATUS_TRANSITIONS,
  MANUAL_TAKEOFF_TRANSITION_LABEL,
  type ManualCutPlanResult,
  type ManualLineRecord,
  type ManualOrderDraft,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';
import { loadManualTakeoffs } from '@/lib/steel/manual-store';
import { openManualTakeoff } from '@/lib/steel/open-takeoff';
import { useManualTakeoffs, writeManualTakeoffs } from '@/lib/steel/use-manual-takeoffs';
import type { SteelTakeoffStatusView } from '@/lib/steel/types';
import { SteelStatusBadge } from '../../_components/steel-status-badge';
import { ManualLineForm } from './manual-line-form';
import { ManualLinesTable } from './manual-lines-table';
import { ManualAlertsPanel } from './manual-alerts-panel';
import { ManualCutPlanSection } from './manual-cut-plan-section';
import { ManualOrderSection } from './manual-order-section';
import { ManualExportSection } from './manual-export-section';
import { ManualPdfIntakeSection } from './manual-pdf-intake-section';

function newLineId(): string {
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-iconic-ink">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-iconic-primary text-[11px] font-bold text-white" aria-hidden="true">
        {step}
      </span>
      {title}
    </h2>
  );
}

export function ManualTakeoffWorkspace({ takeoffId }: { takeoffId: string }) {
  const router = useRouter();
  const { takeoffs, hydrated } = useManualTakeoffs();
  const [planResult, setPlanResult] = useState<ManualCutPlanResult | null>(null);
  const [order, setOrder] = useState<ManualOrderDraft | null>(null);

  const takeoff = takeoffs.find((t) => t.id === takeoffId);

  const computedLines = useMemo(
    () => (takeoff ? computeManualLines(takeoff.lines) : []),
    [takeoff],
  );
  const totals = useMemo(() => computeManualTotals(computedLines), [computedLines]);
  const referenceDate = new Date().toISOString().slice(0, 10);

  function updateTakeoff(mutate: (current: ManualTakeoffRecord) => ManualTakeoffRecord) {
    // Siempre sobre el store fresco (no el snapshot renderizado): robusto ante
    // hidratación tardía y cambios desde otra pestaña.
    writeManualTakeoffs(loadManualTakeoffs().map((t) => (t.id === takeoffId ? mutate(t) : t)));
  }

  function handleAddLine(line: Omit<ManualLineRecord, 'id'>) {
    handleAddLines([line]);
  }

  function handleAddLines(lines: readonly Omit<ManualLineRecord, 'id'>[]) {
    if (lines.length === 0) return;
    updateTakeoff((current) => ({
      ...current,
      lines: [...current.lines, ...lines.map((line) => ({ ...line, id: newLineId() }))],
    }));
    // Las líneas cambiaron: el plan/pedido previos quedan obsoletos.
    setPlanResult(null);
    setOrder(null);
  }

  function handleDeleteLine(lineId: string) {
    updateTakeoff((current) => ({
      ...current,
      lines: current.lines.filter((l) => l.id !== lineId),
    }));
    setPlanResult(null);
    setOrder(null);
  }

  function handleTransition(to: SteelTakeoffStatusView) {
    if (!takeoff || !canTransitionManualTakeoff(takeoff.status, to)) return;
    if (to === 'locked' && !window.confirm('¿Bloquear el takeoff? Quedará inmutable (no se puede reabrir).')) {
      return;
    }
    updateTakeoff((current) => ({ ...current, status: to }));
  }

  function handleGeneratePlan() {
    setPlanResult(buildManualCutPlan(computedLines));
    setOrder(null);
  }

  function handleGenerateOrder() {
    if (!takeoff || !planResult) return;
    setOrder(buildManualOrderDraft(takeoff.name, planResult.plan));
  }

  function handleOpenDemo() {
    const ensured = ensureDemoIntakeTakeoff(loadManualTakeoffs());
    if (ensured.created) writeManualTakeoffs(ensured.records);
    openManualTakeoff((href) => router.push(href), ensured.id);
  }

  if (!hydrated) {
    return (
      <p className="text-sm text-iconic-graphite/50">
        Leyendo el takeoff guardado en este navegador… Si este mensaje no desaparece, recarga la
        página sin caché (Ctrl+Shift+R): suele deberse a una versión anterior abierta en la
        pestaña.
      </p>
    );
  }

  if (!takeoff) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Takeoff manual no encontrado en este navegador"
        description="Los takeoffs manuales del preview F3 se guardan en localStorage: solo existen en el navegador donde se crearon. Puedes volver a la lista para crear uno, o abrir el takeoff demo de lectura asistida."
        action={
          <Button asChild variant="outline">
            <Link href="/steel/takeoffs">Volver a takeoffs</Link>
          </Button>
        }
        secondaryAction={
          <Button type="button" variant="ghost" onClick={handleOpenDemo}>
            Probar lectura asistida desde PDF/plano
          </Button>
        }
      />
    );
  }

  const canEdit = canEditManualLines(takeoff.status);

  return (
    <div>
      <PageHeader
        title={takeoff.name}
        breadcrumb={
          <Link href="/steel/takeoffs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Takeoffs
          </Link>
        }
        description={`${takeoff.projectName} · ${takeoff.scopeLabel} · takeoff manual local`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SteelStatusBadge kind="takeoff" status={takeoff.status} />
            {MANUAL_TAKEOFF_STATUS_TRANSITIONS[takeoff.status].map((to) => (
              <Button
                key={to}
                type="button"
                size="sm"
                variant={to === 'locked' ? 'destructive' : 'outline'}
                onClick={() => handleTransition(to)}
              >
                {MANUAL_TAKEOFF_TRANSITION_LABEL[to]}
              </Button>
            ))}
          </div>
        }
      />

      <InlineCallout tone="tip" title="Flujo manual F3 — sin persistencia real" className="mb-4">
        Las líneas se interpretan con <code>parseSteelDescription</code>, se calculan con{' '}
        <code>calculateSteelLine</code> y se optimizan con <code>optimizeSteelCutsFFD</code> (dominio
        real F1). El takeoff vive solo en este navegador; nada toca base de datos ni APU/BOQ reales.
      </InlineCallout>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Totales del takeoff">
        <KpiCard label="Total ml" value={formatDecimal(totals.totalMl)} />
        <KpiCard label="Total kg" value={formatDecimal(totals.totalKg)} />
        <KpiCard label="Unid. comerciales" value={formatDecimal(totals.totalCommercialUnits, 0)} hint="ceil por línea, pre-optimización" />
        <KpiCard
          label="Desperdicio asumido"
          value={`${formatDecimal(totals.estimatedWasteKg, 1)} kg`}
          hint={`${formatDecimal(totals.estimatedWasteMl)} ml`}
          tone={totals.criticalAlerts > 0 ? 'danger' : totals.warningAlerts > 0 ? 'warn' : 'default'}
        />
        <KpiCard label="Costo estimado (mock)" value={formatCop(totals.estimatedCostCop)} hint="precios de referencia" />
        <KpiCard
          label="Por revisar"
          value={totals.linesNeedingReview}
          tone={totals.linesNeedingReview > 0 ? 'warn' : 'ok'}
          hint={`${totals.criticalAlerts} críticas · ${totals.warningAlerts} advertencias`}
        />
      </div>

      <section className="mb-8" aria-label="Lectura asistida desde PDF o plano">
        <SectionTitle step={1} title="Lectura asistida desde PDF/plano (preview)" />
        <ManualPdfIntakeSection disabled={!canEdit} onAddApproved={handleAddLines} />
      </section>

      <section className="mb-8" aria-label="Agregar líneas">
        <SectionTitle step={2} title="Agregar líneas de acero (descripción original del plano)" />
        {canEdit ? (
          <ManualLineForm onAdd={handleAddLine} />
        ) : (
          <InlineCallout tone="info">
            El takeoff está en estado «{TAKEOFF_STATUS_LABEL[takeoff.status]}»: las líneas son de solo
            lectura. {takeoff.status === 'approved' ? 'Devuélvelo a revisión para editarlas.' : ''}
          </InlineCallout>
        )}
      </section>

      <section className="mb-8" aria-label="Líneas calculadas">
        <SectionTitle step={3} title={`Líneas calculadas (${computedLines.length})`} />
        {computedLines.length === 0 ? (
          <EmptyState
            title="Sin líneas todavía"
            description="Agrega la primera descripción de despiece: el parser F1 la interpreta y la calculadora obtiene ml/kg al instante."
          />
        ) : (
          <ManualLinesTable lines={computedLines} canEdit={canEdit} onDelete={handleDeleteLine} />
        )}
      </section>

      {computedLines.length > 0 && (
        <>
          <section className="mb-8" aria-label="Alertas">
            <SectionTitle step={4} title="Alertas por línea" />
            <ManualAlertsPanel lines={computedLines} />
          </section>

          <section className="mb-8" aria-label="Plan de corte">
            <SectionTitle step={5} title="Plan de corte (FFD) y banco de sobrantes" />
            <ManualCutPlanSection lines={computedLines} planResult={planResult} onGenerate={handleGeneratePlan} />
          </section>

          <section className="mb-8" aria-label="Pedido proveedor">
            <SectionTitle step={6} title="Pedido proveedor (mock)" />
            <ManualOrderSection
              order={order}
              hasPlan={planResult !== null}
              onGenerate={handleGenerateOrder}
              referenceDate={referenceDate}
            />
          </section>

          <section className="mb-8" aria-label="Export">
            <SectionTitle step={7} title="Preparación de export" />
            <ManualExportSection takeoff={takeoff} lines={computedLines} planResult={planResult} order={order} />
          </section>
        </>
      )}
    </div>
  );
}
