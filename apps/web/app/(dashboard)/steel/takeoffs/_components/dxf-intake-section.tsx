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
import {
  BEAM_SCHEDULE_STATUS_LABEL,
  type BeamScheduleRow,
} from '@/lib/steel/dxf/beam-schedule';
import {
  assembleBeamDetails,
  beamDetailToManualLines,
  summarizeMarkersForQuality,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import {
  DXF_FILTER_MODE_LABEL,
  matchesDxfFilter,
  type DxfEntityFilter,
  type DxfFilterMode,
} from '@/lib/steel/dxf/dxf-entity-filter';

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
  /** F8C: cada corte de viga como elemento compuesto (embebe la fila F8B). */
  beamDetails: readonly BeamDetail[];
}

const BEAM_STATUS_VARIANT: Record<BeamScheduleRow['status'], 'success' | 'warning' | 'secondary'> = {
  ok: 'success',
  missing_location: 'secondary',
  requires_review: 'warning',
};

function barLabel(bar: BeamDetail['topLongitudinalBars'][number]): string {
  const qty = bar.quantityFromGraphic !== undefined ? `${bar.quantityFromGraphic}×` : '¿?×';
  return `${qty}${bar.description}`;
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
  // F8B: filtro manual de lectura por capa/color (solo cambia lo VISIBLE).
  const [filterMode, setFilterMode] = useState<DxfFilterMode>('all');
  const [selectedLayers, setSelectedLayers] = useState<ReadonlySet<string>>(new Set());
  const [selectedColors, setSelectedColors] = useState<ReadonlySet<number>>(new Set());
  const [includeTitleBlock, setIncludeTitleBlock] = useState(true);
  const [beamSentKey, setBeamSentKey] = useState<string | null>(null);

  const comparison = useMemo(() => {
    if (!loaded || !pdfAnalysis) return null;
    return compareDxfWithPdfAnalysis(loaded.extraction.elements, pdfAnalysis);
  }, [loaded, pdfAnalysis]);

  const activeFilter = useMemo<DxfEntityFilter>(
    () => ({
      mode: filterMode,
      layers: [...selectedLayers],
      colorIndexes: [...selectedColors],
      includeTitleBlock,
    }),
    [filterMode, selectedLayers, selectedColors, includeTitleBlock],
  );

  const visibleElements = useMemo(
    () =>
      (loaded?.extraction.elements ?? []).filter((element) =>
        matchesDxfFilter({ layer: element.sourceLayer, colorIndex: element.colorIndex }, activeFilter),
      ),
    [loaded, activeFilter],
  );

  const visibleBeams = useMemo(
    () =>
      (loaded?.beamDetails ?? []).filter((detail) =>
        matchesDxfFilter({ layer: detail.sourceLayer, colorIndex: detail.sourceColor }, activeFilter),
      ),
    [loaded, activeFilter],
  );

  const availableColors = useMemo(() => {
    const colors = new Set<number>();
    for (const entity of loaded?.parse.entities ?? []) {
      if (entity.colorIndex !== undefined) colors.add(entity.colorIndex);
    }
    return [...colors].sort((a, b) => a - b);
  }, [loaded]);

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
    const beamDetails = assembleBeamDetails(parse, extraction);
    setLoaded({
      fileName: file.name,
      parse,
      extraction,
      quality: buildCadQualityReport(parse, extraction, {
        markers: summarizeMarkersForQuality(beamDetails),
      }),
      detection: detectDxfNotationCandidates(parse, file.name),
      beamDetails,
    });
    setFilterMode('all');
    setSelectedLayers(new Set());
    setSelectedColors(new Set());
    setIncludeTitleBlock(true);
    setBeamSentKey(null);
  }

  function toggleLayer(layer: string) {
    setSelectedLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  function toggleColor(color: number) {
    setSelectedColors((current) => {
      const next = new Set(current);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  function handleSendBeamDetail(detail: BeamDetail) {
    if (!loaded) return;
    const lines = beamDetailToManualLines(detail, loaded.fileName);
    if (lines.length === 0) return;
    onAddApproved(lines);
    setBeamSentKey(`${detail.beamKey}:${lines.length}`);
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
              {loaded.quality.markersDetectedByShape !== undefined && (
                <>
                  <div><dt className="inline text-iconic-graphite/50">Marcadores (forma): </dt><dd className="inline">{loaded.quality.markersDetectedByShape}</dd></div>
                  <div><dt className="inline text-iconic-graphite/50">Marcadores (capa/color): </dt><dd className="inline">{loaded.quality.markersDetectedByLayerColor}</dd></div>
                  <div><dt className="inline text-iconic-graphite/50">Marcadores ambiguos: </dt><dd className="inline">{loaded.quality.ambiguousMarkers}</dd></div>
                  <div><dt className="inline text-iconic-graphite/50">Confianza marcadores: </dt><dd className="inline">{loaded.quality.markerConfidence ?? '—'}</dd></div>
                </>
              )}
            </dl>
            {loaded.quality.notes.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[11px] text-iconic-graphite/60">
                {loaded.quality.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Filtro manual por capa/color (F8B): solo cambia lo visible */}
          <div className="rounded border border-iconic-soft-blue/30 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Filtrar entidades CAD:</span>
              {(Object.keys(DXF_FILTER_MODE_LABEL) as DxfFilterMode[]).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={filterMode === mode ? 'default' : 'outline'}
                  onClick={() => setFilterMode(mode)}
                  aria-pressed={filterMode === mode}
                >
                  {DXF_FILTER_MODE_LABEL[mode]}
                </Button>
              ))}
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={includeTitleBlock}
                  onChange={(event) => setIncludeTitleBlock(event.target.checked)}
                />
                Incluir rótulo
              </label>
            </div>
            {filterMode === 'custom' && (
              <div className="mt-1.5 space-y-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-iconic-graphite/50">Capas:</span>
                  {loaded.parse.layers.map((layer) => (
                    <label key={layer} className="flex items-center gap-1">
                      <input type="checkbox" checked={selectedLayers.has(layer)} onChange={() => toggleLayer(layer)} />
                      {layer}
                    </label>
                  ))}
                </div>
                {availableColors.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-iconic-graphite/50">Color ACI:</span>
                    {availableColors.map((color) => (
                      <label key={color} className="flex items-center gap-1">
                        <input type="checkbox" checked={selectedColors.has(color)} onChange={() => toggleColor(color)} />
                        {color === 1 ? '1 (rojo)' : color}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1 text-[11px] text-iconic-graphite/50">
              El filtro cambia la lista visible ({visibleElements.length} de {loaded.extraction.elements.length}{' '}
              elementos); no borra datos. Capa y color son señales, no verdad absoluta.
            </p>
          </div>

          {/* Listado de vigas detectadas (F8C — Beam Detail Assembly) */}
          {visibleBeams.length > 0 && (
            <div className="rounded border border-iconic-soft-blue/30 p-2">
              <p className="font-semibold">Listado de vigas detectadas ({visibleBeams.length})</p>
              <div className="mt-1 max-h-96 overflow-auto">
                <table className="w-full min-w-[980px] text-left text-[11px]">
                  <caption className="sr-only">Listado de vigas detectadas en el DXF (elemento compuesto)</caption>
                  <thead className="sticky top-0 z-10 bg-white dark:bg-surface-soft">
                    <tr className="border-b border-iconic-soft-blue/30 text-iconic-graphite/50">
                      <th scope="col" className="py-1 pr-2">Viga</th>
                      <th scope="col" className="py-1 pr-2">Eje/Ubicación</th>
                      <th scope="col" className="py-1 pr-2">Sección</th>
                      <th scope="col" className="py-1 pr-2">Superior</th>
                      <th scope="col" className="py-1 pr-2">Inferior</th>
                      <th scope="col" className="py-1 pr-2">Estribos/Flejado</th>
                      <th scope="col" className="py-1 pr-2">Cant. gráfica</th>
                      <th scope="col" className="py-1 pr-2">Capa/Color</th>
                      <th scope="col" className="py-1 pr-2">Confianza</th>
                      <th scope="col" className="py-1 pr-2">Estado</th>
                      <th scope="col" className="py-1">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBeams.map((detail) => (
                      <tr key={detail.beamDetailId} className="border-b border-iconic-soft-blue/15 align-top">
                        <td className="py-1 pr-2 font-medium">{detail.beamKey}</td>
                        <td className="py-1 pr-2">{detail.locationText ?? '—'}</td>
                        <td className="py-1 pr-2">{detail.sectionSpec ?? '—'}</td>
                        <td className="py-1 pr-2">
                          {detail.topLongitudinalBars.length === 0
                            ? '—'
                            : detail.topLongitudinalBars.map((bar) => (
                                <div key={`${bar.sourceText}-${bar.description}`}>
                                  <code>{barLabel(bar)}</code>
                                  {bar.sourceText !== bar.description && (
                                    <span className="text-iconic-graphite/50"> (“{bar.sourceText}”)</span>
                                  )}
                                </div>
                              ))}
                        </td>
                        <td className="py-1 pr-2">
                          {detail.bottomLongitudinalBars.length === 0
                            ? '—'
                            : detail.bottomLongitudinalBars.map((bar) => (
                                <div key={`${bar.sourceText}-${bar.description}`}>
                                  <code>{barLabel(bar)}</code>
                                </div>
                              ))}
                        </td>
                        <td className="py-1 pr-2">
                          {detail.stirrupZones.length > 0 && (
                            <div className="text-iconic-graphite/70">
                              {detail.stirrupZones.map((zone) => zone.sourceText).join(' · ')}
                              {detail.stirrupZonesTotal !== undefined && (
                                <div className="font-medium">Subtotal zonas: {detail.stirrupZonesTotal}</div>
                              )}
                            </div>
                          )}
                          {detail.stirrupSummary && (
                            <div>
                              Resumen: <code>{detail.stirrupSummary.normalized}</code>
                            </div>
                          )}
                          {detail.zoneComparison && (
                            <div
                              className={
                                detail.zoneComparison.status === 'match'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }
                            >
                              {detail.zoneComparison.message}
                            </div>
                          )}
                          {detail.segmentCheck && (
                            <div className="text-iconic-graphite/60">{detail.segmentCheck.message}</div>
                          )}
                          {detail.stirrupZones.length === 0 && !detail.stirrupSummary && '—'}
                        </td>
                        <td className="py-1 pr-2">
                          {detail.crossSectionMarkers.status === 'unavailable' ? (
                            <Badge variant="secondary">sin marcadores</Badge>
                          ) : (
                            <>
                              <div>↑ {detail.crossSectionMarkers.top} · ↓ {detail.crossSectionMarkers.bottom}</div>
                              <div className="text-iconic-graphite/50">
                                {detail.crossSectionMarkers.byShape} por forma · conf. {detail.crossSectionMarkers.confidence}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          {detail.sourceLayer}
                          {detail.sourceColor !== undefined ? ` · c${detail.sourceColor}` : ''}
                        </td>
                        <td className="py-1 pr-2">{(detail.confidence * 100).toFixed(0)}%</td>
                        <td className="py-1 pr-2">
                          <Badge variant={BEAM_STATUS_VARIANT[detail.status]}>
                            {BEAM_SCHEDULE_STATUS_LABEL[detail.status]}
                          </Badge>
                          {detail.statusReasons.length > 0 && (
                            <div className="mt-0.5 max-w-56 text-[10px] text-iconic-graphite/50">
                              {detail.statusReasons[0]}
                            </div>
                          )}
                        </td>
                        <td className="py-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendBeamDetail(detail)}
                            disabled={disabled || beamDetailToManualLines(detail, loaded.fileName).length === 0}
                          >
                            Enviar al takeoff
                          </Button>
                          {beamSentKey?.startsWith(`${detail.beamKey}:`) && (
                            <Badge variant="success" className="ml-1">
                              {beamSentKey.split(':')[1]} línea(s)
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-iconic-graphite/50">
                Fuente: DXF ({loaded.fileName}). Cada fila es el CORTE COMPLETO de la viga. “Enviar al
                takeoff” agrega SOLO lo verificable: el resumen de estribos interpretable por F1 y los
                longitudinales cuya cantidad viene del conteo gráfico de marcadores — jamás del primer
                dígito del texto. Nada se aprueba solo.
              </p>
            </div>
          )}

          {/* Elementos detectados */}
          {visibleElements.length > 0 && (
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
                  {visibleElements.map((element) => (
                    <tr key={element.elementKey} className="border-b border-iconic-soft-blue/15 align-top">
                      <td className="py-1 pr-2 font-medium">{element.elementKey}</td>
                      <td className="py-1 pr-2">{ELEMENT_TYPE_LABEL[element.elementType] ?? element.elementType}</td>
                      <td className="py-1 pr-2">{element.sectionSpec ?? element.diameter ?? '—'}</td>
                      <td className="py-1 pr-2">
                        {element.sourceLayer}
                        {element.colorIndex !== undefined ? ` · c${element.colorIndex}` : ''}
                        {element.redSignal ? ' 🔴' : ''}
                      </td>
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
