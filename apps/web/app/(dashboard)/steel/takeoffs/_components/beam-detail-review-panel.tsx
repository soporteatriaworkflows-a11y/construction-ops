/**
 * beam-detail-review-panel.tsx — Panel lateral "Ver detalle" de una viga
 * (F8D-B). El listado compacto no puede cargar todo el contenido en celdas
 * angostas: este panel muestra el detalle COMPLETO — resumen, superior,
 * inferior, estribos con el contrato zonas vs resumen (y la decisión humana
 * cuando hay desfase), cálculo legible y evidencia CAD. Nada se autoaprueba.
 */
'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import { computeManualLine, type ManualLineRecord } from '@/lib/steel/manual-takeoff';
import { explainSteelCalculation } from '@/lib/steel/steel-calculation-explanation';
import {
  buildBeamTakeoffDispatch,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { BEAM_SCHEDULE_STATUS_LABEL } from '@/lib/steel/dxf/beam-schedule';
import { DXF_VIEW_TYPE_LABEL } from '@/lib/steel/dxf/dxf-view-segmentation';
import {
  STIRRUP_COMPARISON_STATUS_LABEL,
  STIRRUP_TAKEOFF_CHOICE_LABEL,
  type StirrupComparisonStatus,
  type StirrupTakeoffChoice,
} from '@/lib/steel/dxf/stirrup-summary-contract';

const STATUS_VARIANT: Record<BeamDetail['status'], 'success' | 'warning' | 'secondary'> = {
  ok: 'success',
  missing_location: 'secondary',
  requires_review: 'warning',
};

const COMPARISON_VARIANT: Record<StirrupComparisonStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  match: 'success',
  mismatch: 'warning',
  unverified: 'secondary',
  ambiguous: 'destructive',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-4 border-b border-iconic-soft-blue/30 pb-1 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
      {children}
    </h4>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-xs">
      <dt className="inline text-iconic-graphite/50">{label}: </dt>
      <dd className="inline">{value ?? '—'}</dd>
    </div>
  );
}

function LongitudinalRows({ bars }: { bars: BeamDetail['topLongitudinalBars'] }) {
  if (bars.length === 0) return <p className="text-xs text-iconic-graphite/50">Sin barras detectadas en esta banda.</p>;
  return (
    <table className="mt-1 w-full text-left text-[11px]">
      <thead>
        <tr className="text-iconic-graphite/50">
          <th scope="col" className="py-0.5 pr-2">Texto original</th>
          <th scope="col" className="py-0.5 pr-2">Normalizado</th>
          <th scope="col" className="py-0.5 pr-2">Cant. gráfica</th>
          <th scope="col" className="py-0.5">Fuente cantidad</th>
        </tr>
      </thead>
      <tbody>
        {bars.map((bar) => (
          <tr key={`${bar.sourceText}-${bar.description}`} className="border-t border-iconic-soft-blue/15 align-top">
            <td className="py-1 pr-2 font-mono">{bar.sourceText}</td>
            <td className="py-1 pr-2 font-mono">{bar.description}</td>
            <td className="py-1 pr-2">{bar.quantityFromGraphic ?? '¿?'}</td>
            <td className="py-1">
              {bar.quantityStatus === 'from_markers' ? (
                <Badge variant="success">conteo gráfico de marcadores</Badge>
              ) : (
                <Badge variant="warning">requiere revisión</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BeamDetailReviewPanel({
  detail,
  fileName,
  disabled,
  onClose,
  onAddLines,
}: {
  detail: BeamDetail;
  fileName: string;
  disabled?: boolean;
  onClose: () => void;
  onAddLines: (lines: readonly Omit<ManualLineRecord, 'id'>[]) => void;
}) {
  const contract = detail.stirrupContract;
  const [stirrupDecision, setStirrupDecision] = useState<StirrupTakeoffChoice | null>(null);
  const [sentInfo, setSentInfo] = useState<string | null>(null);

  // F8E: el envío es UNO solo — superior + inferior + estribo (según decisión).
  const dispatch = useMemo(
    () => buildBeamTakeoffDispatch(detail, fileName, { stirrupChoice: stirrupDecision ?? undefined }),
    [detail, fileName, stirrupDecision],
  );

  // "Ver cálculo": explicación F1 de cada línea candidata (sin persistir nada).
  const explanations = useMemo(
    () =>
      dispatch.lines.map((line) =>
        explainSteelCalculation(computeManualLine({ ...line, id: `preview-${line.originalDescription}` })),
      ),
    [dispatch],
  );

  function handleSendDefault() {
    if (dispatch.lines.length === 0) return;
    onAddLines(dispatch.lines);
    setSentInfo(
      `${dispatch.lines.length} línea(s) enviadas: ${dispatch.topCount} superior, ${dispatch.bottomCount} inferior, ${dispatch.stirrupIncluded ? 1 : 0} estribo.`,
    );
  }

  // La decisión humana SOLO fija qué estribo entrará en el envío (no envía).
  function handleStirrupChoice(choice: StirrupTakeoffChoice) {
    setStirrupDecision(choice);
    setSentInfo(null);
  }

  const needsDecision = contract && (contract.comparisonStatus === 'mismatch' || contract.comparisonStatus === 'unverified');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Detalle de la viga ${detail.beamKey}`}>
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-4 shadow-xl dark:bg-surface-soft">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-iconic-ink">Detalle de viga {detail.beamKey}</h3>
            <p className="text-[11px] text-iconic-graphite/60">
              Fuente: DXF ({fileName}) · cada dato lleva su evidencia. Nada se aprueba solo.
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar panel">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* 1. Resumen */}
        <SectionHeading>1 · Resumen</SectionHeading>
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
          <Field label="Viga" value={detail.beamKey} />
          <Field label="Ubicación" value={detail.locationText} />
          <Field label="Sección" value={detail.sectionSpec} />
          <Field
            label="Estado"
            value={<Badge variant={STATUS_VARIANT[detail.status]}>{BEAM_SCHEDULE_STATUS_LABEL[detail.status]}</Badge>}
          />
          <Field label="Confianza" value={`${(detail.confidence * 100).toFixed(0)}%`} />
          <Field
            label="Vista DXF"
            value={detail.viewId ? `${detail.viewId} (${detail.viewType ? DXF_VIEW_TYPE_LABEL[detail.viewType] : '—'})` : 'sin vista segmentada'}
          />
          <Field label="Superior" value={`${detail.topLongitudinalBars.length} items`} />
          <Field label="Inferior" value={`${detail.bottomLongitudinalBars.length} items`} />
          <Field
            label="Estribos"
            value={`${detail.stirrupSummary ? 1 : 0} resumen + ${detail.stirrupZones.length} zonas`}
          />
          {detail.unclassifiedLongitudinalBars.length > 0 && (
            <Field label="Sin clasificar" value={`${detail.unclassifiedLongitudinalBars.length} items`} />
          )}
        </dl>
        {detail.statusReasons.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
            {detail.statusReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        {/* 2/3. Longitudinales — lista COMPLETA en secuencia, jamás truncada */}
        <SectionHeading>2 · Refuerzo superior ({detail.topLongitudinalBars.length} items)</SectionHeading>
        <LongitudinalRows bars={detail.topLongitudinalBars} />
        <SectionHeading>3 · Refuerzo inferior ({detail.bottomLongitudinalBars.length} items)</SectionHeading>
        <LongitudinalRows bars={detail.bottomLongitudinalBars} />
        {detail.unclassifiedLongitudinalBars.length > 0 && (
          <>
            <SectionHeading>
              Sin clasificar / revisar ({detail.unclassifiedLongitudinalBars.length} items)
            </SectionHeading>
            <InlineCallout tone="warning" className="mt-1" title="Textos longitudinales sin banda clara">
              Estos textos se detectaron dentro de la vista pero no quedó clara su banda
              superior/inferior: no se envían al takeoff sin revisión.
            </InlineCallout>
            <LongitudinalRows bars={detail.unclassifiedLongitudinalBars} />
          </>
        )}

        {/* 4. Estribos/flejado — contrato zonas vs resumen */}
        <SectionHeading>4 · Estribos / flejado</SectionHeading>
        {!contract ? (
          <p className="text-xs text-iconic-graphite/50">Sin zonas ni resumen de estribos detectados en esta vista.</p>
        ) : (
          <div className="text-xs">
            {contract.zones.length > 0 && (
              <p className="font-mono text-[11px] text-iconic-graphite/70">
                Zonas: {contract.zones.map((zone) => zone.sourceText).join(' · ')}
              </p>
            )}
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              <Field label="Subtotal por zonas" value={contract.zoneTotalPerRepetition ?? 'sin zonas'} />
              <Field label="Resumen declarado" value={contract.declaredSummary ? <code>{contract.declaredSummary}</code> : 'no encontrado'} />
              <Field label="Diferencia" value={contract.difference ?? '—'} />
              <Field label="Valor sugerido" value={contract.suggestedPerRepetition ?? 'requiere decisión'} />
              <Field
                label="Estado"
                value={
                  <Badge variant={COMPARISON_VARIANT[contract.comparisonStatus]}>
                    {STIRRUP_COMPARISON_STATUS_LABEL[contract.comparisonStatus]}
                  </Badge>
                }
              />
            </dl>
            <p className="mt-1 text-[11px] text-iconic-graphite/60">{contract.message}</p>
            {contract.comparisonStatus === 'ambiguous' && (
              <InlineCallout tone="warning" className="mt-2" title="Posible mezcla de detalles contiguos">
                Revisar segmentación antes de enviar: este estribo no se envía al takeoff ni con elección manual.
              </InlineCallout>
            )}
            {needsDecision && (
              <div className="mt-2 rounded border border-amber-300/60 p-2">
                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  Requiere decisión humana — el estribo NO entra al envío hasta elegir:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(['declared_summary', 'zone_total', 'mark_for_review'] as const).map((choice) => (
                    <Button
                      key={choice}
                      type="button"
                      size="sm"
                      variant={stirrupDecision === choice ? 'default' : choice === 'mark_for_review' ? 'ghost' : 'outline'}
                      disabled={disabled}
                      aria-pressed={stirrupDecision === choice}
                      onClick={() => handleStirrupChoice(choice)}
                    >
                      {STIRRUP_TAKEOFF_CHOICE_LABEL[choice]}
                    </Button>
                  ))}
                </div>
                {stirrupDecision && (
                  <p className="mt-1 text-[11px] text-iconic-graphite/60">
                    Decisión: {STIRRUP_TAKEOFF_CHOICE_LABEL[stirrupDecision]} — se aplica al usar
                    “Enviar al takeoff”.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. Cálculo */}
        <SectionHeading>5 · Cálculo (fórmulas F1)</SectionHeading>
        {explanations.length === 0 ? (
          <p className="text-xs text-iconic-graphite/50">
            No hay líneas verificables listas para calcular (cantidades sin conteo gráfico o estribos sin coincidencia).
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {explanations.map((explanation) => (
              <li key={explanation.originalDescription} className="rounded border border-iconic-soft-blue/25 p-2 text-[11px]">
                <p><code className="font-semibold">{explanation.originalDescription}</code> — {explanation.interpretation}</p>
                <p className="mt-0.5 text-iconic-graphite/70">{explanation.quantityText}</p>
                <p className="text-iconic-graphite/70">{explanation.mlFormula}</p>
                <p className="text-iconic-graphite/70">{explanation.kgFormula}</p>
                {explanation.commercialFormula && <p className="text-iconic-graphite/70">{explanation.commercialFormula}</p>}
                <p className="text-iconic-graphite/60">{explanation.wasteText}</p>
              </li>
            ))}
          </ul>
        )}

        {/* 6. Evidencia */}
        <SectionHeading>6 · Evidencia CAD</SectionHeading>
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
          <Field label="Archivo" value={fileName} />
          <Field label="Capa" value={detail.sourceLayer} />
          <Field label="Color ACI" value={detail.sourceColor !== undefined ? `c${detail.sourceColor}` : undefined} />
          <Field
            label="Coordenadas"
            value={detail.coordinates ? `(${detail.coordinates.x.toFixed(1)}, ${detail.coordinates.y.toFixed(1)})` : undefined}
          />
          <Field label="Entidades (handles)" value={detail.sourceEntityHandles.slice(0, 8).join(', ') || undefined} />
          <Field label="Excluidas de otras vistas" value={detail.crossViewExcludedCount} />
          <Field label="Excluidas por ambigüedad" value={detail.ambiguousExcludedCount} />
        </dl>
        {detail.sourceFragments.length > 0 && (
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-iconic-soft-blue/20 p-1.5">
            <p className="text-[11px] font-medium text-iconic-graphite/60">Fragmentos originales:</p>
            <ul className="list-disc pl-4 font-mono text-[11px] text-iconic-graphite/70">
              {detail.sourceFragments.map((fragment) => (
                <li key={fragment}>{fragment}</li>
              ))}
            </ul>
          </div>
        )}
        {detail.warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
            {detail.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {/* Acciones — preview honesto de lo que entra y lo que queda fuera */}
        <div className="mt-4 border-t border-iconic-soft-blue/30 pt-3">
          <p className="text-[11px] font-medium text-iconic-ink">{dispatch.previewText}</p>
          {dispatch.explanations.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
              {dispatch.explanations.map((explanation) => (
                <li key={explanation}>{explanation}</li>
              ))}
            </ul>
          )}
          {dispatch.skippedBars.length > 0 && (
            <ul className="mt-1 list-disc pl-4 font-mono text-[11px] text-iconic-graphite/60">
              {dispatch.skippedBars.map((bar) => (
                <li key={`${bar.position}-${bar.description}-${bar.sourceText}`}>
                  {bar.description} ({bar.position}) — {bar.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={handleSendDefault} disabled={disabled || dispatch.lines.length === 0}>
              Enviar al takeoff ({dispatch.lines.length} línea(s))
            </Button>
            {sentInfo && <Badge variant="success">{sentInfo}</Badge>}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-iconic-graphite/50">
          Se envía cada barra superior/inferior con cantidad por conteo gráfico y UNA línea de
          estribos: el resumen sugerido cuando zonas y resumen coinciden, o la opción elegida arriba
          cuando hay desfase. Lo ambiguo y lo que requiere definir cantidad NO entra al takeoff.
        </p>
      </div>
    </div>
  );
}
