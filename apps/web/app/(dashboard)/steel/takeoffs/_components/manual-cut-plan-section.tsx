/**
 * manual-cut-plan-section.tsx — Envía las líneas válidas al optimizador FFD
 * REAL de F1 (`optimizeSteelCutsFFD` vía `buildManualCutPlan`) y muestra el
 * plan de corte por varilla + banco de sobrantes resultante.
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Ruler, Scissors, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineCallout } from '@/components/shared/inline-callout';
import { computeOffcutSavings, groupBarsBySpec } from '@/lib/steel/domain-bridge';
import { formatCop, formatDecimal } from '@/lib/steel/format';
import {
  buildCutPlanIndex,
  commercialLengthsInPlan,
  CUT_PLAN_VIEW_MODE_LABEL,
  EMPTY_CUT_PLAN_FILTER,
  filterCutPlanGroups,
  filterOffcuts,
  type CutPlanFilterState,
  type CutPlanViewMode,
} from '@/lib/steel/cut-plan-view';
import {
  DEFAULT_COMMERCIAL_LENGTHS_M,
  MAX_MANUAL_WASTE_PCT,
  TAKEOFF_WASTE_MODE_LABEL,
  validateCommercialLengthInput,
  validateManualWastePercentInput,
  type ManualComputedLine,
  type ManualCutPlanResult,
  type TakeoffWasteConfig,
  type TakeoffWasteMode,
} from '@/lib/steel/manual-takeoff';
import { SteelStatusBadge } from '../../_components/steel-status-badge';

/**
 * Editor de la fuente del desperdicio (F8D-E): separa el desperdicio de
 * OPTIMIZACIÓN (lo reporta el plan de corte según barras comerciales,
 * sobrantes y cortes rechazados) del FACTOR comercial/manual (editable para
 * presupuestar o decidir margen). La fuente activa queda visible siempre.
 */
function WasteModeEditor({
  wasteConfig,
  canEdit,
  onChange,
}: {
  wasteConfig: TakeoffWasteConfig;
  canEdit: boolean;
  onChange: (next: TakeoffWasteConfig) => void;
}) {
  const [draftPct, setDraftPct] = useState(wasteConfig.manualWastePercent ?? '5');
  const [error, setError] = useState<string | null>(null);

  function handleMode(mode: TakeoffWasteMode) {
    setError(null);
    if (mode === 'calculated') {
      onChange({ mode: 'calculated' });
      return;
    }
    const validated = validateManualWastePercentInput(draftPct);
    if (!validated.ok) {
      setError(validated.reason);
      return;
    }
    onChange({ mode: 'manual', manualWastePercent: validated.pct });
  }

  function handleApplyPct() {
    const validated = validateManualWastePercentInput(draftPct);
    if (!validated.ok) {
      setError(validated.reason);
      return;
    }
    setError(null);
    onChange({ mode: 'manual', manualWastePercent: validated.pct });
  }

  return (
    <div className="mb-3 rounded-lg border border-iconic-soft-blue/40 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        Desperdicio: fuente y factor
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        <strong>Calculado por optimización</strong>: el optimizador FFD reporta el desperdicio real
        según barras comerciales, sobrantes y cortes rechazados. <strong>Factor manual</strong>:
        porcentaje comercial editable ({0}–{MAX_MANUAL_WASTE_PCT}%) para presupuestar o decidir
        margen. Son conceptos distintos; el porcentaje calculado no se confunde con el margen manual.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(Object.keys(TAKEOFF_WASTE_MODE_LABEL) as TakeoffWasteMode[]).map((mode) => (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant={wasteConfig.mode === mode ? 'default' : 'outline'}
            aria-pressed={wasteConfig.mode === mode}
            disabled={!canEdit}
            onClick={() => handleMode(mode)}
          >
            {TAKEOFF_WASTE_MODE_LABEL[mode]}
          </Button>
        ))}
        {wasteConfig.mode === 'manual' && (
          <span className="flex items-end gap-2">
            <span className="w-24">
              <Label htmlFor="manual-waste-pct-input">Factor (%)</Label>
              <Input
                id="manual-waste-pct-input"
                type="number"
                min="0"
                max={MAX_MANUAL_WASTE_PCT}
                step="0.5"
                value={draftPct}
                disabled={!canEdit}
                onChange={(event) => setDraftPct(event.target.value)}
                className="mt-1 h-8"
              />
            </span>
            <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={handleApplyPct}>
              Aplicar factor
            </Button>
          </span>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
      <p className="mt-1.5 text-[11px] text-iconic-graphite/60">
        Fuente activa: <strong>{TAKEOFF_WASTE_MODE_LABEL[wasteConfig.mode]}</strong>
        {wasteConfig.mode === 'manual' && wasteConfig.manualWastePercent
          ? ` (${wasteConfig.manualWastePercent}% aplicado a las líneas)`
          : ' (el % por línea es solo estimación pre-optimización)'}
        . El Excel exportado indica esta fuente.
      </p>
    </div>
  );
}

/**
 * Editor de longitudes comerciales del takeoff (F7.1): chips + alta/baja con
 * validación. El mercado cambia (proveedor/disponibilidad/desperdicio
 * asumido), así que 6/9/12 es solo el default — no una constante.
 */
function CommercialLengthsEditor({
  lengths,
  canEdit,
  onChange,
}: {
  lengths: readonly string[];
  canEdit: boolean;
  onChange: (next: readonly string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDefault =
    lengths.length === DEFAULT_COMMERCIAL_LENGTHS_M.length &&
    lengths.every((length, index) => length === DEFAULT_COMMERCIAL_LENGTHS_M[index]);

  function handleAdd() {
    const result = validateCommercialLengthInput(draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (lengths.includes(result.lengthM)) {
      setError(`La longitud ${result.lengthM} m ya está en la lista.`);
      return;
    }
    setError(null);
    setDraft('');
    onChange([...lengths, result.lengthM].sort((a, b) => Number(a) - Number(b)));
  }

  function handleRemove(length: string) {
    if (lengths.length <= 1) {
      setError('Debe quedar al menos una longitud comercial disponible.');
      return;
    }
    setError(null);
    onChange(lengths.filter((l) => l !== length));
  }

  return (
    <div className="mb-3 rounded-lg border border-iconic-soft-blue/40 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
        Longitudes comerciales
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        Longitudes de barra disponibles para el plan de corte y el pedido. Editables por takeoff:
        hoy 6/9/12 m, mañana puede cambiar por proveedor, disponibilidad o decisión de asumir
        desperdicio. Se guardan en este navegador.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lengths.map((length) => (
          <Badge key={length} variant="secondary" className="gap-1">
            {formatDecimal(length)} m
            {canEdit && (
              <button
                type="button"
                onClick={() => handleRemove(length)}
                aria-label={`Quitar longitud comercial ${length} m`}
                className="ml-0.5 rounded hover:text-red-600"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </Badge>
        ))}
        {isDefault && <span className="text-[11px] text-iconic-graphite/50">(default del preview)</span>}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-32">
            <Label htmlFor="commercial-length-input">Agregar (m)</Label>
            <Input
              id="commercial-length-input"
              type="number"
              min="0.5"
              step="0.5"
              value={draft}
              placeholder="7.5"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              className="mt-1"
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar longitud
          </Button>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function ManualCutPlanSection({
  lines,
  planResult,
  commercialLengths,
  canEditLengths,
  wasteConfig,
  onChangeCommercialLengths,
  onChangeWasteConfig,
  onGenerate,
}: {
  lines: readonly ManualComputedLine[];
  planResult: ManualCutPlanResult | null;
  commercialLengths: readonly string[];
  canEditLengths: boolean;
  wasteConfig: TakeoffWasteConfig;
  onChangeCommercialLengths: (next: readonly string[]) => void;
  onChangeWasteConfig: (next: TakeoffWasteConfig) => void;
  onGenerate: () => void;
}) {
  const eligibleCount = lines.filter((l) => l.cutPlanEligible).length;
  const savings = planResult ? computeOffcutSavings([planResult.plan]) : null;

  // F8C-A: compresión de la revisión — filtros, índice y grupos colapsables.
  const [filter, setFilter] = useState<CutPlanFilterState>(EMPTY_CUT_PLAN_FILTER);
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});

  const allGroups = useMemo(() => (planResult ? groupBarsBySpec(planResult.plan) : []), [planResult]);
  const descriptionsByLineId = useMemo(
    () => new Map(lines.map((line) => [line.record.id, line.record.originalDescription])),
    [lines],
  );
  const visibleGroups = useMemo(
    () => filterCutPlanGroups(allGroups, filter, descriptionsByLineId),
    [allGroups, filter, descriptionsByLineId],
  );
  const visibleOffcuts = useMemo(
    () => (planResult ? filterOffcuts(planResult.plan.offcuts, filter) : []),
    [planResult, filter],
  );
  const planIndex = useMemo(
    () =>
      planResult
        ? buildCutPlanIndex(allGroups, planResult.plan.rejectedCuts.length, planResult.plan.offcuts.length)
        : [],
    [planResult, allGroups],
  );
  const availableLengths = useMemo(() => commercialLengthsInPlan(allGroups), [allGroups]);

  // Con muchos grupos, solo el primero abre por defecto (menos scroll).
  function isCollapsed(specId: string, index: number): boolean {
    const override = collapsedOverrides[specId];
    if (override !== undefined) return override;
    return allGroups.length > 3 && index > 0;
  }

  function toggleGroup(specId: string, index: number) {
    setCollapsedOverrides((current) => ({ ...current, [specId]: !isCollapsed(specId, index) }));
  }

  function toggleSpec(specId: string) {
    setFilter((current) => ({
      ...current,
      specIds: current.specIds.includes(specId)
        ? current.specIds.filter((id) => id !== specId)
        : [...current.specIds, specId],
    }));
  }

  return (
    <div>
      <CommercialLengthsEditor
        lengths={commercialLengths}
        canEdit={canEditLengths}
        onChange={onChangeCommercialLengths}
      />

      <WasteModeEditor wasteConfig={wasteConfig} canEdit={canEditLengths} onChange={onChangeWasteConfig} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onGenerate} disabled={eligibleCount === 0}>
          <Scissors className="h-4 w-4" aria-hidden="true" />
          {planResult
            ? `Recalcular plan de corte (${eligibleCount} líneas válidas)`
            : `Enviar ${eligibleCount} línea(s) válida(s) al plan de corte`}
        </Button>
        {eligibleCount === 0 && (
          <span className="text-xs text-iconic-graphite/50">
            No hay líneas elegibles: cada línea necesita interpretación válida, longitud, cantidad y
            número de varilla.
          </span>
        )}
      </div>

      {planResult && planResult.excluded.length > 0 && (
        <InlineCallout tone="warning" title={`${planResult.excluded.length} línea(s) quedaron fuera del plan`} className="mb-3">
          <ul role="list" className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto">
            {planResult.excluded.map((item) => (
              <li key={item.lineId}>
                <code className="font-mono">{item.originalDescription}</code> — {item.reason}
              </li>
            ))}
          </ul>
        </InlineCallout>
      )}

      {planResult && (
        <>
          <InlineCallout tone="info" className="mb-3">
            Optimización FFD (first-fit decreasing) con longitudes comerciales{' '}
            {commercialLengths.map((l) => formatDecimal(l)).join(' / ')} m: heurística buena, no
            necesariamente el óptimo absoluto. Desperdicio final del plan:{' '}
            {formatDecimal(planResult.plan.totalWasteM)} m (calculado por optimización — barras
            comerciales, sobrantes y cortes rechazados).
          </InlineCallout>

          {/* F8C-A: barra de filtros — reduce lo visible, jamás borra datos */}
          <div className="mb-3 rounded-lg border border-iconic-soft-blue/40 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-iconic-graphite/70">Ver:</span>
              {(Object.keys(CUT_PLAN_VIEW_MODE_LABEL) as CutPlanViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={filter.mode === mode ? 'default' : 'outline'}
                  aria-pressed={filter.mode === mode}
                  onClick={() => setFilter((current) => ({ ...current, mode }))}
                >
                  {CUT_PLAN_VIEW_MODE_LABEL[mode]}
                </Button>
              ))}
              <label className="ml-1 flex items-center gap-1" htmlFor="cut-plan-length-filter">
                <span className="text-iconic-graphite/50">Long. comercial:</span>
                <select
                  id="cut-plan-length-filter"
                  className="rounded border border-gray-300 bg-white px-1.5 py-1 dark:border-line dark:bg-surface-soft"
                  value={filter.commercialLengthM}
                  onChange={(event) => setFilter((current) => ({ ...current, commercialLengthM: event.target.value }))}
                >
                  <option value="">Todas</option>
                  {availableLengths.map((length) => (
                    <option key={length} value={length}>
                      {formatDecimal(length)} m
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative flex items-center" htmlFor="cut-plan-search">
                <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-iconic-graphite/40" aria-hidden="true" />
                <Input
                  id="cut-plan-search"
                  type="search"
                  placeholder="Buscar barra/corte/descripción"
                  value={filter.search}
                  onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
                  className="h-8 w-56 pl-7 text-xs"
                />
              </label>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-iconic-graphite/50">Varilla:</span>
              {allGroups.map((group) => (
                <Button
                  key={group.specId}
                  type="button"
                  size="sm"
                  variant={filter.specIds.length === 0 || filter.specIds.includes(group.specId) ? 'default' : 'outline'}
                  aria-pressed={filter.specIds.includes(group.specId)}
                  onClick={() => toggleSpec(group.specId)}
                >
                  {group.specLabel.replace(/^Varilla corrugada\s+/i, '')}
                </Button>
              ))}
              {(filter.specIds.length > 0 || filter.search || filter.commercialLengthM || filter.mode !== 'todo') && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setFilter(EMPTY_CUT_PLAN_FILTER)}>
                  Limpiar filtros
                </Button>
              )}
            </div>
            {/* Índice compacto de navegación */}
            {planIndex.length > 0 && (
              <nav aria-label="Índice del plan de corte" className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-iconic-graphite/50">Ir a:</span>
                {planIndex.map((entry) => (
                  <a
                    key={entry.anchorId}
                    href={`#${entry.anchorId}`}
                    className="rounded-full border border-iconic-soft-blue/50 px-2 py-0.5 text-[11px] hover:bg-brand-50"
                  >
                    {entry.label} ({entry.count})
                  </a>
                ))}
              </nav>
            )}
          </div>

          {planResult.plan.rejectedCuts.length > 0 && filter.mode !== 'solo_sobrantes' && (
            <div id="plan-rechazados">
              <InlineCallout tone="warning" title={`Cortes rechazados por el optimizador (${planResult.plan.rejectedCuts.length})`} className="mb-3">
                <ul role="list" className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto">
                  {planResult.plan.rejectedCuts.map((cut) => (
                    <li key={cut.cutId}>{cut.reason}</li>
                  ))}
                </ul>
              </InlineCallout>
            </div>
          )}

          <div className="space-y-3">
            {visibleGroups.map((group, index) => {
              const collapsed = isCollapsed(group.specId, index);
              return (
                <div key={group.specId} id={`plan-group-${group.specId}`}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.specId, index)}
                    aria-expanded={!collapsed}
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60 hover:text-iconic-ink"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {group.specLabel} · {group.bars.length} barra(s) comercial(es)
                  </button>
                  {!collapsed && (
                    <div className="max-h-72 overflow-auto rounded-xl border border-iconic-soft-blue/40">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="sticky top-0 z-10 bg-brand-50 text-left text-xs uppercase tracking-wide text-iconic-graphite/60 dark:bg-surface-soft">
                          <tr>
                            <th scope="col" className="px-3 py-2">Barra</th>
                            <th scope="col" className="px-3 py-2 text-right">Long. comercial (m)</th>
                            <th scope="col" className="px-3 py-2">Cortes asignados (m)</th>
                            <th scope="col" className="px-3 py-2 text-right">Sobrante (m)</th>
                            <th scope="col" className="px-3 py-2">Destino del sobrante</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-iconic-soft-blue/20">
                          {group.bars.map((bar) => (
                            <tr key={bar.id}>
                              <td className="px-3 py-2 font-medium text-iconic-ink">{bar.id}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(bar.commercialLengthM)}</td>
                              <td className="px-3 py-2 font-mono text-xs text-iconic-graphite/80">
                                {bar.assignments.map((a) => formatDecimal(a.lengthM)).join(' + ')}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(bar.remainingLengthM)}</td>
                              <td className="px-3 py-2">
                                <SteelStatusBadge kind="offcut" status={bar.offcutStatus} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {filter.mode === 'todo' && visibleGroups.length === 0 && allGroups.length > 0 && (
              <p className="text-xs text-iconic-graphite/50">
                Ningún grupo coincide con los filtros actuales. Los datos siguen completos — limpia los
                filtros para verlos todos.
              </p>
            )}
          </div>

          {filter.mode !== 'solo_rechazados' && (
            <div className="mt-4" id="plan-sobrantes">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
                Banco de sobrantes del plan
              </h4>
              {planResult.plan.offcuts.length === 0 ? (
                <p className="text-xs text-iconic-graphite/50">
                  El plan no dejó sobrantes reutilizables (≥ mínimo útil configurado).
                </p>
              ) : (
                <>
                  <div className="max-h-72 overflow-auto rounded-xl border border-iconic-soft-blue/40">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="sticky top-0 z-10 bg-brand-50 text-left text-xs uppercase tracking-wide text-iconic-graphite/60 dark:bg-surface-soft">
                        <tr>
                          <th scope="col" className="px-3 py-2">Sobrante</th>
                          <th scope="col" className="px-3 py-2 text-right">Longitud (m)</th>
                          <th scope="col" className="px-3 py-2">Estado</th>
                          <th scope="col" className="px-3 py-2">Barra origen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-iconic-soft-blue/20">
                        {visibleOffcuts.map((offcut) => (
                          <tr key={offcut.id}>
                            <td className="px-3 py-2 font-medium text-iconic-ink">{offcut.id}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatDecimal(offcut.lengthM)}</td>
                            <td className="px-3 py-2">
                              <SteelStatusBadge kind="offcut" status={offcut.status} />
                            </td>
                            <td className="px-3 py-2 text-xs text-iconic-graphite/60">
                              {offcut.sourceCutPlanBarId ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visibleOffcuts.length < planResult.plan.offcuts.length && (
                    <p className="mt-1 text-[11px] text-iconic-graphite/50">
                      Mostrando {visibleOffcuts.length} de {planResult.plan.offcuts.length} sobrantes (filtro
                      activo; nada se borra).
                    </p>
                  )}
                  {savings && (
                    <p className="mt-2 text-xs text-iconic-graphite/60">
                      Reutilizar los sobrantes disponibles ahorraría ≈ {formatDecimal(savings.totalMl)} ml ·{' '}
                      {formatDecimal(savings.totalKg, 1)} kg · {formatCop(savings.totalCop)} (precio COP de
                      referencia mock, no aprobado).
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
