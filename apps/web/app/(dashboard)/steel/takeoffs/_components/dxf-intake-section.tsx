/**
 * dxf-intake-section.tsx — "Fuentes CAD / DXF" (F8A, preview).
 *
 * Carga un .dxf y lo lee COMPLETO en el navegador (el archivo jamás sale de
 * aquí, igual que pdfjs/tesseract): entidades CAD reales, capas, bloques y
 * coordenadas. Layer-aware pero layer-resilient: capas limpias = evidencia
 * fuerte; todo en Layer 0 = texto/bloques/cercanía con confianza menor y
 * CAD Drawing Quality Report visible. Si además hay PDF analizado (F7), se
 * comparan ambos caminos. Nada se auto-aprueba; F1 sigue calculando todo.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, GitCompareArrows, Layers, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineCallout } from '@/components/shared/inline-callout';
import type { ManualLineRecord } from '@/lib/steel/manual-takeoff';
import type { StructuralDrawingAnalysis } from '@/lib/steel/structural-drawing-analysis';
import { parseDxfFile, type DxfParseSuccess } from '@/lib/steel/dxf/dxf-parser';
import {
  extractDxfStructure,
  type DxfStructuralExtraction,
} from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  buildCadQualityReport,
  CAD_QUALITY_RECOMMENDATION_LABEL,
  type CadDrawingQualityReport,
} from '@/lib/steel/dxf/dxf-quality-report';
import {
  detectDxfNotationCandidates,
  dxfCandidatesToManualLines,
  type DxfNotationDetection,
} from '@/lib/steel/dxf/dxf-to-steel-evidence';
import {
  compareDxfWithPdfAnalysis,
  DXF_COMPARISON_STATUS_LABEL,
  type DxfComparisonStatus,
} from '@/lib/steel/dxf/dxf-pdf-comparison';

const RECOMMENDATION_VARIANT: Record<CadDrawingQualityReport['recommendation'], 'success' | 'warning' | 'secondary' | 'destructive'> = {
  usable: 'success',
  usable_con_revision: 'warning',
  baja_calidad_cad: 'secondary',
  no_confiable: 'destructive',
};

const COMPARISON_VARIANT: Record<DxfComparisonStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  match: 'success',
  dxf_only: 'warning',
  pdf_only: 'secondary',
  conflict: 'destructive',
  needs_review: 'warning',
};

const ELEMENT_TYPE_LABEL: Record<string, string> = {
  beam: 'Viga',
  footing: 'Zapata',
  pile: 'Pilote',
  column: 'Columna',
  unknown: 'Sin clasificar',
};

interface LoadedDxf {
  fileName: string;
  parse: DxfParseSuccess;
  extraction: DxfStructuralExtraction;
  quality: CadDrawingQualityReport;
  detection: DxfNotationDetection;
}

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

export function DxfIntakeSection({
  disabled,
  pdfAnalysis,
  onAddApproved,
}: {
  disabled?: boolean;
  /** Análisis F7 vigente (si la usuaria cargó PDFs) para comparar. Opcional. */
  pdfAnalysis: StructuralDrawingAnalysis | null;
  onAddApproved: (lines: readonly Omit<ManualLineRecord, 'id'>[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<LoadedDxf | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<ReadonlySet<string>>(new Set());
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const comparison = useMemo(() => {
    if (!loaded || !pdfAnalysis) return null;
    return compareDxfWithPdfAnalysis(loaded.extraction.elements, pdfAnalysis);
  }, [loaded, pdfAnalysis]);

  async function handleFile(file: File | undefined) {
    setParseError(null);
    setAddedCount(null);
    setApprovedIds(new Set());
    if (!file) return;
    const content = await file.text();
    const parse = parseDxfFile(content);
    if (!parse.ok) {
      setLoaded(null);
      setParseError(parse.message);
      return;
    }
    const extraction = extractDxfStructure(parse);
    setLoaded({
      fileName: file.name,
      parse,
      extraction,
      quality: buildCadQualityReport(parse, extraction),
      detection: detectDxfNotationCandidates(parse, file.name),
    });
  }

  function toggleApproved(id: string) {
    setApprovedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddApproved() {
    if (!loaded) return;
    const withStatus: DxfNotationDetection = {
      ...loaded.detection,
      candidates: loaded.detection.candidates.map((candidate) =>
        approvedIds.has(candidate.id) ? { ...candidate, status: 'approved' as const } : candidate,
      ),
    };
    const lines = dxfCandidatesToManualLines(withStatus, loaded.fileName);
    if (lines.length === 0) return;
    onAddApproved(lines);
    setAddedCount(lines.length);
    setApprovedIds(new Set());
  }

  const approvableCandidates = loaded?.detection.candidates.filter((c) => c.f1Ready) ?? [];

  return (
    <div className="mt-4 rounded-lg border border-dashed border-iconic-soft-blue/60 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Fuentes CAD / DXF (experimental F8A)
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        Carga el DXF del plano (AutoCAD: SAVEAS → DXF ASCII; DWG: convertir con ODA File Converter).
        Se leen entidades CAD reales — textos, capas, bloques, coordenadas — EN este navegador: el
        archivo jamás se sube a ningún servidor. Si las capas no ayudan (todo en Layer 0), la
        detección usa texto y cercanía espacial con confianza menor. Nada se aprueba automáticamente.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          disabled={disabled}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          {loaded ? 'Cargar otro DXF' : 'Cargar DXF'}
        </Button>
        {loaded && <Badge variant="secondary">{loaded.fileName}</Badge>}
      </div>

      {parseError && (
        <InlineCallout tone="warning" className="mt-2" title="No se pudo leer el DXF">
          {parseError}
        </InlineCallout>
      )}

      {loaded && (
        <div className="mt-3 space-y-3 text-xs">
          {/* Resumen de entidades */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{loaded.parse.stats.totalEntities} entidades</Badge>
            <Badge variant="secondary">TEXT: {loaded.parse.stats.textCount}</Badge>
            <Badge variant="secondary">MTEXT: {loaded.parse.stats.mtextCount}</Badge>
            <Badge variant="secondary">INSERT: {loaded.parse.stats.insertCount}</Badge>
            <Badge variant="secondary">Cotas: {loaded.parse.stats.dimensionCount}</Badge>
            <Badge variant="secondary">Capas: {loaded.parse.layers.length}</Badge>
            <Badge variant="success">{loaded.extraction.elements.length} elemento(s) detectados</Badge>
          </div>

          {/* CAD Drawing Quality Report */}
          <div className="rounded border border-iconic-soft-blue/30 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">Calidad del dibujo CAD:</span>
              <Badge variant={RECOMMENDATION_VARIANT[loaded.quality.recommendation]}>
                {CAD_QUALITY_RECOMMENDATION_LABEL[loaded.quality.recommendation]}
              </Badge>
              <Badge variant="secondary">confianza {loaded.quality.confidence}</Badge>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-3">
              <div><dt className="inline text-iconic-graphite/50">Capas útiles: </dt><dd className="inline">{yesNo(loaded.quality.usefulLayers)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">Textos útiles: </dt><dd className="inline">{yesNo(loaded.quality.usefulTexts)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">Bloques/inserts: </dt><dd className="inline">{yesNo(loaded.quality.usefulInserts)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">Bloques contables: </dt><dd className="inline">{yesNo(loaded.quality.countableBlocks)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">Cotas/medidas: </dt><dd className="inline">{yesNo(loaded.quality.measurementsDetected)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">Tablas/cuadros: </dt><dd className="inline">{yesNo(loaded.quality.tablesDetected)}</dd></div>
              <div><dt className="inline text-iconic-graphite/50">% en una sola capa: </dt><dd className="inline">{loaded.quality.dominantLayerPct}%</dd></div>
            </dl>
            {loaded.quality.notes.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[11px] text-iconic-graphite/60">
                {loaded.quality.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Elementos detectados */}
          {loaded.extraction.elements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[11px]">
                <caption className="sr-only">Elementos estructurales detectados en el DXF</caption>
                <thead>
                  <tr className="border-b border-iconic-soft-blue/30 text-iconic-graphite/50">
                    <th scope="col" className="py-1 pr-2">Elemento</th>
                    <th scope="col" className="py-1 pr-2">Tipo</th>
                    <th scope="col" className="py-1 pr-2">Sección/Ø</th>
                    <th scope="col" className="py-1 pr-2">Capa</th>
                    <th scope="col" className="py-1 pr-2">Coordenadas</th>
                    <th scope="col" className="py-1 pr-2">Confianza</th>
                    <th scope="col" className="py-1">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.extraction.elements.map((element) => (
                    <tr key={element.elementKey} className="border-b border-iconic-soft-blue/15 align-top">
                      <td className="py-1 pr-2 font-medium">{element.elementKey}</td>
                      <td className="py-1 pr-2">{ELEMENT_TYPE_LABEL[element.elementType] ?? element.elementType}</td>
                      <td className="py-1 pr-2">{element.sectionSpec ?? element.diameter ?? '—'}</td>
                      <td className="py-1 pr-2">{element.sourceLayer}</td>
                      <td className="py-1 pr-2">
                        {element.coordinates ? `(${element.coordinates.x.toFixed(1)}, ${element.coordinates.y.toFixed(1)})` : '—'}
                      </td>
                      <td className="py-1 pr-2">
                        <Badge variant={element.confidence >= 0.9 ? 'success' : element.confidence >= 0.75 ? 'warning' : 'secondary'}>
                          {(element.confidence * 100).toFixed(0)}%
                        </Badge>
                      </td>
                      <td className="py-1 text-iconic-graphite/60">{element.sourceEntityType}: “{element.sourceText}”</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Hallazgos de conteo */}
          {loaded.extraction.findings.length > 0 && (
            <ul className="space-y-1">
              {loaded.extraction.findings.map((finding) => (
                <li key={`${finding.kind}-${finding.elementKey ?? 'global'}`}>
                  <InlineCallout
                    tone={finding.severity === 'critical' ? 'warning' : finding.severity === 'warning' ? 'warning' : 'info'}
                    title={finding.kind === 'count_mismatch' ? 'Conteo gráfico vs listado NO coincide' : finding.kind === 'graphic_count_unverified' ? 'Conteo gráfico sin verificar' : 'Conteo verificado'}
                  >
                    {finding.message}
                  </InlineCallout>
                </li>
              ))}
            </ul>
          )}

          {/* Comparación DXF ↔ PDF/F7 (opcional) */}
          {comparison ? (
            <div className="rounded border border-iconic-soft-blue/30 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <GitCompareArrows className="h-3.5 w-3.5 text-iconic-graphite/50" aria-hidden="true" />
                <span className="font-semibold">DXF vs PDF (F7):</span>
                <Badge variant="success">Coinciden: {comparison.summary.match}</Badge>
                <Badge variant="warning">Solo DXF: {comparison.summary.dxfOnly}</Badge>
                <Badge variant="secondary">Solo PDF: {comparison.summary.pdfOnly}</Badge>
                <Badge variant={comparison.summary.conflicts > 0 ? 'destructive' : 'secondary'}>
                  Conflictos: {comparison.summary.conflicts}
                </Badge>
                {comparison.summary.needsReview > 0 && (
                  <Badge variant="warning">Requieren revisión: {comparison.summary.needsReview}</Badge>
                )}
              </div>
              <ul className="mt-1.5 space-y-1">
                {comparison.entries.map((entry) => (
                  <li key={entry.elementKey} className="rounded border border-iconic-soft-blue/20 p-1.5">
                    <span className="mr-1.5 font-medium">{entry.elementKey}</span>
                    <Badge variant={COMPARISON_VARIANT[entry.status]}>{DXF_COMPARISON_STATUS_LABEL[entry.status]}</Badge>
                    <ul className="mt-0.5 list-disc pl-4 text-[11px] text-iconic-graphite/70">
                      {entry.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-iconic-graphite/50">
              El DXF funciona solo. Si además cargas/analizas PDFs arriba (F7), aquí aparecerá la
              comparación DXF ↔ PDF (coincide / solo DXF / solo PDF / conflicto).
            </p>
          )}

          {/* Candidatos de notación de acero → takeoff */}
          {approvableCandidates.length > 0 && (
            <div className="rounded border border-iconic-soft-blue/30 p-2">
              <p className="font-semibold">
                Notación de acero detectada en textos del DXF ({approvableCandidates.length} interpretable(s) por F1)
              </p>
              <p className="text-[11px] text-iconic-graphite/60">
                Marca las lecturas correctas y agrégalas al takeoff: entran como líneas F3 con
                evidencia <code>dxf</code> (archivo, capa, entidad, coordenadas) — visible en el
                Excel F4A.2. F1 recalcula todo; nada se aprueba solo.
              </p>
              <ul className="mt-1.5 space-y-1">
                {approvableCandidates.map((candidate) => (
                  <li key={candidate.id} className="flex items-start gap-2">
                    <input
                      id={`dxf-candidate-${candidate.id}`}
                      type="checkbox"
                      className="mt-0.5"
                      checked={approvedIds.has(candidate.id)}
                      onChange={() => toggleApproved(candidate.id)}
                      disabled={disabled}
                    />
                    <label htmlFor={`dxf-candidate-${candidate.id}`} className="cursor-pointer">
                      <code className="font-medium">{candidate.candidateText}</code>
                      {candidate.elementLabel && (
                        <span className="ml-1.5 text-iconic-graphite/50">({candidate.elementLabel})</span>
                      )}
                      <span className="ml-1.5 text-[11px] text-iconic-graphite/50">
                        {candidate.suggestedInterpretation}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={handleAddApproved} disabled={disabled || approvedIds.size === 0}>
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Agregar {approvedIds.size > 0 ? approvedIds.size : ''} al takeoff con evidencia DXF
                </Button>
                {addedCount !== null && <Badge variant="success">{addedCount} línea(s) agregadas</Badge>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
