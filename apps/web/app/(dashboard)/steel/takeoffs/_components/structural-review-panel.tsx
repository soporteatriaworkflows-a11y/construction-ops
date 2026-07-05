/**
 * structural-review-panel.tsx — "Revisión técnica del plano" (F7).
 *
 * Muestra lo que el sistema ENTIENDE del plan set: regiones por página,
 * elementos detectados con su evidencia, nomenclaturas resueltas/no
 * resueltas y hallazgos técnicos (contradicciones, faltantes, desfases de
 * conteo, pérdidas de símbolo OCR).
 *
 * No bloquea el flujo F6 existente: lo complementa. Las acciones son de
 * revisión humana (marcar revisado / ignorar / vincular a elemento) y viven
 * solo en memoria del navegador — sin DB, sin persistencia, sin cálculo.
 */
'use client';

import { useMemo, useState } from 'react';
import { Check, EyeOff, Link2, Microscope, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  PAGE_REGION_TYPE_LABEL,
  type PageRegionType,
} from '@/lib/steel/drawing-page-regions';
import { ELEMENT_REVIEW_STATUS_LABEL, type ElementReviewStatus } from '@/lib/steel/drawing-element-registry';
import {
  STRUCTURAL_FINDING_TYPE_LABEL,
  type StructuralFinding,
  type StructuralFindingSeverity,
} from '@/lib/steel/structural-review-findings';
import type { StructuralDrawingAnalysis } from '@/lib/steel/structural-drawing-analysis';

const SEVERITY_LABEL: Record<StructuralFindingSeverity, string> = {
  critical: 'Critico',
  warning: 'Advertencia',
  info: 'Informativo',
};

const SEVERITY_VARIANT: Record<StructuralFindingSeverity, 'destructive' | 'warning' | 'secondary'> = {
  critical: 'destructive',
  warning: 'warning',
  info: 'secondary',
};

const STATUS_VARIANT: Record<ElementReviewStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  completo: 'success',
  falta_ubicacion: 'warning',
  falta_refuerzo: 'warning',
  conflicto: 'destructive',
  requiere_revision: 'warning',
};

const REGION_VARIANT: Partial<Record<PageRegionType, 'success' | 'warning' | 'secondary' | 'default'>> = {
  unknown: 'secondary',
};

type FindingReviewState = 'pendiente' | 'revisado' | 'ignorado';

export function StructuralReviewPanel({
  analysis,
  disabled,
}: {
  analysis: StructuralDrawingAnalysis;
  disabled?: boolean;
}) {
  const [reviewState, setReviewState] = useState<Record<string, FindingReviewState>>({});
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});

  const findingState = (finding: StructuralFinding): FindingReviewState =>
    reviewState[finding.id] ?? 'pendiente';

  const setFinding = (id: string, state: FindingReviewState) =>
    setReviewState((current) => ({ ...current, [id]: state }));

  const stats = useMemo(() => {
    const pending = analysis.findings.filter((f) => (reviewState[f.id] ?? 'pendiente') === 'pendiente');
    return {
      critical: pending.filter((f) => f.severity === 'critical').length,
      warning: pending.filter((f) => f.severity === 'warning').length,
      info: pending.filter((f) => f.severity === 'info').length,
      blocking: pending.filter((f) => f.blockingForApproval).length,
    };
  }, [analysis.findings, reviewState]);

  const spatialPageCount = analysis.spatialPages.filter((page) =>
    page.lines.some((line) => line.bbox !== undefined),
  ).length;
  const unresolved = analysis.nomenclature.resolutions.filter((r) => r.kind === 'unresolved');
  const resolved = analysis.nomenclature.resolutions.filter((r) => r.kind !== 'unresolved');

  return (
    <div className="mt-4 rounded-xl border border-iconic-soft-blue/40 bg-white p-4 shadow-sm dark:border-line dark:bg-surface">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-iconic-ink dark:text-content">
            <Microscope className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
            Revision tecnica del plano
          </h3>
          <p className="mt-1 text-xs text-iconic-graphite/70 dark:text-content-muted">
            Lo que el sistema entiende del plan set: regiones, elementos, nomenclaturas y hallazgos.
            Todo es sugerencia revisable — no se aprueba ni se calcula nada automaticamente.
          </p>
        </div>
        <Badge variant="secondary">Preview local F7</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">
          {analysis.spatialPages.length} pagina(s) analizadas · {spatialPageCount} con posicion real
        </Badge>
        <Badge variant="secondary">{analysis.registry.length} elemento(s)</Badge>
        <Badge variant={stats.critical > 0 ? 'destructive' : 'secondary'}>Criticos: {stats.critical}</Badge>
        <Badge variant={stats.warning > 0 ? 'warning' : 'secondary'}>Advertencias: {stats.warning}</Badge>
        <Badge variant="secondary">Informativos: {stats.info}</Badge>
        {stats.blocking > 0 && (
          <Badge variant="destructive">{stats.blocking} hallazgo(s) por resolver antes de aprobar</Badge>
        )}
      </div>

      {/* Regiones por página */}
      {analysis.regionResults.some((result) => result.regions.length > 0) && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
            Regiones detectadas por pagina
          </summary>
          <ul className="mt-2 space-y-1.5">
            {analysis.regionResults.map((result, index) => {
              // regionResults es PARALELO a spatialPages (varias fuentes
              // pueden repetir número de página): el cruce es por índice.
              const page = analysis.spatialPages[index];
              return (
                <li key={`${page?.sourceFileName ?? ''}-${index}-${result.pageNumber}`} className="text-xs">
                  <span className="font-medium">
                    {page?.sourceFileName ? `${page.sourceFileName} · ` : ''}Pagina {result.pageNumber}:
                  </span>{' '}
                  <span className="inline-flex flex-wrap gap-1 align-middle">
                    {result.regions.map((region) => (
                      <Badge
                        key={region.regionId}
                        variant={REGION_VARIANT[region.regionType] ?? 'default'}
                        title={`${region.reason} (confianza ${region.confidence})`}
                      >
                        {PAGE_REGION_TYPE_LABEL[region.regionType]}
                        {region.titleText ? ` — ${region.titleText.slice(0, 32)}` : ''} ({region.lineIds.length})
                      </Badge>
                    ))}
                  </span>
                  {result.note && <p className="mt-0.5 text-[11px] text-iconic-graphite/50">{result.note}</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Elementos detectados */}
      {analysis.registry.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
            Elementos detectados ({analysis.registry.length})
          </summary>
          <div className="mt-2 overflow-x-auto rounded-lg border border-iconic-soft-blue/30">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-brand-50/60 text-left uppercase tracking-wide text-iconic-graphite/60">
                <tr>
                  <th scope="col" className="px-2 py-1.5">Elemento</th>
                  <th scope="col" className="px-2 py-1.5">Alias vistos</th>
                  <th scope="col" className="px-2 py-1.5">Evidencia</th>
                  <th scope="col" className="px-2 py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iconic-soft-blue/20">
                {analysis.registry.map((record) => (
                  <tr key={record.elementKey}>
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-medium">{record.displayLabel}</span>
                      {record.kind && <span className="ml-1 text-iconic-graphite/50">({record.kind})</span>}
                      {record.similarElementKeys.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                          Parecido a {record.similarElementKeys.join(', ')} — no se fusiona automaticamente.
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-iconic-graphite/70">
                      {record.aliases.join(' · ')}
                      <p className="text-[11px] text-iconic-graphite/50">
                        {record.sourceMentions.length} mencion(es) en{' '}
                        {[...new Set(record.sourceMentions.map((m) => `p.${m.pageNumber}`))].join(', ')}
                      </p>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {record.evidenceTypes.map((type) => (
                          <Badge key={type} variant="secondary">
                            {PAGE_REGION_TYPE_LABEL[type]}
                          </Badge>
                        ))}
                      </div>
                      {record.missingEvidence.map((missing) => (
                        <p key={missing} className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                          {missing}
                        </p>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <Badge variant={STATUS_VARIANT[record.reviewStatus]}>
                        {ELEMENT_REVIEW_STATUS_LABEL[record.reviewStatus]}
                      </Badge>
                      <p className="mt-0.5 max-w-52 text-[11px] text-iconic-graphite/50">
                        {record.reviewStatusReason}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Nomenclatura */}
      {(resolved.length > 0 || unresolved.length > 0) && (
        <details className="mt-3" open={unresolved.length > 0}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
            Nomenclatura del plano ({resolved.length} resueltas · {unresolved.length} sin resolver)
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {analysis.nomenclature.resolutions.map((resolution) => (
              <li key={resolution.symbol} className="flex flex-wrap items-start gap-1.5">
                <Badge
                  variant={
                    resolution.kind === 'unresolved'
                      ? 'warning'
                      : resolution.kind === 'resolved'
                        ? 'success'
                        : 'secondary'
                  }
                >
                  {resolution.symbol}
                </Badge>
                {resolution.kind === 'resolved' && (
                  <span>
                    {resolution.meaning}{' '}
                    <span className="text-iconic-graphite/50">
                      (leyenda p.{resolution.evidence.pageNumber}: “{resolution.evidence.lineText}”)
                    </span>
                  </span>
                )}
                {resolution.kind === 'builtin' && (
                  <span className="text-iconic-graphite/70">{resolution.meaning}</span>
                )}
                {resolution.kind === 'unresolved' && (
                  <span className="text-amber-700 dark:text-amber-400">{resolution.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Hallazgos técnicos */}
      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
          Hallazgos tecnicos ({analysis.findings.length})
        </h4>
        {analysis.findings.length === 0 ? (
          <InlineCallout tone="info" className="mt-2">
            Sin hallazgos tecnicos en las paginas analizadas. Esto NO valida el plano: la revision
            humana sigue siendo obligatoria.
          </InlineCallout>
        ) : (
          <ul className="mt-2 space-y-2">
            {analysis.findings.map((finding) => {
              const state = findingState(finding);
              const linkedKey = manualLinks[finding.id];
              return (
                <li
                  key={finding.id}
                  className={`rounded-lg border border-iconic-soft-blue/30 p-2.5 ${state !== 'pendiente' ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant={SEVERITY_VARIANT[finding.severity]}>{SEVERITY_LABEL[finding.severity]}</Badge>
                    <Badge variant="secondary">{STRUCTURAL_FINDING_TYPE_LABEL[finding.type]}</Badge>
                    {(finding.elementKey ?? linkedKey) && (
                      <Badge variant="default">{finding.elementKey ?? linkedKey}</Badge>
                    )}
                    {finding.pageNumber !== undefined && (
                      <span className="text-iconic-graphite/50">
                        {finding.sourceFileName ? `${finding.sourceFileName} · ` : ''}p.{finding.pageNumber}
                      </span>
                    )}
                    {finding.blockingForApproval && state === 'pendiente' && (
                      <Badge variant="destructive">Resolver antes de aprobar</Badge>
                    )}
                    {state === 'revisado' && <Badge variant="success">Revisado</Badge>}
                    {state === 'ignorado' && <Badge variant="secondary">Ignorado</Badge>}
                    <span className="grow" />
                    <span className="text-[11px] text-iconic-graphite/50">confianza {finding.confidence}</span>
                  </div>
                  <p className="mt-1 text-xs text-iconic-graphite/80 dark:text-content">{finding.explanation}</p>
                  {finding.evidence.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-iconic-graphite/60">
                      {finding.evidence.map((item) => (
                        <li key={item} className="font-mono">{item}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] text-iconic-graphite/60">
                    <span className="font-medium">Accion sugerida:</span> {finding.suggestedAction}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setFinding(finding.id, 'revisado')}
                      disabled={disabled || state === 'revisado'}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Marcar revisado
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setFinding(finding.id, 'ignorado')}
                      disabled={disabled || state === 'ignorado'}
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Ignorar
                    </Button>
                    {state !== 'pendiente' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setFinding(finding.id, 'pendiente')}
                        disabled={disabled}
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Reabrir
                      </Button>
                    )}
                    {!finding.elementKey && analysis.registry.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="h-3.5 w-3.5 text-iconic-graphite/50" aria-hidden="true" />
                        <Select
                          value={linkedKey ?? ''}
                          onChange={(event) =>
                            setManualLinks((current) => ({ ...current, [finding.id]: event.target.value }))
                          }
                          disabled={disabled}
                          aria-label={`Vincular hallazgo ${finding.id} a un elemento`}
                          className="w-44 text-xs"
                        >
                          <option value="">Vincular a elemento…</option>
                          {analysis.registry.map((record) => (
                            <option key={record.elementKey} value={record.elementKey}>
                              {record.displayLabel}
                            </option>
                          ))}
                        </Select>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[11px] text-iconic-graphite/50">
        F7 no produce cantidades, metros ni costos: detecta contexto, faltantes y contradicciones
        para que la revision humana decida. F1 sigue siendo la unica calculadora. Marcar revisado o
        ignorar vive solo en este navegador (sin persistencia en esta fase).
      </p>
    </div>
  );
}
