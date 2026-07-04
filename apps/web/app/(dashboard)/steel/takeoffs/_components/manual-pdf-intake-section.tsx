/**
 * manual-pdf-intake-section.tsx — Lectura asistida desde PDF/plano (F6A+F6B).
 *
 * F6B = PLAN SET: un takeoff real se alimenta de varios planos (planta de
 * cimentación, cuadros, despieces, cortes/detalles, notas). Cada PDF se lee
 * EN el navegador (pdfjs-dist por import dinámico, solo capa de texto
 * seleccionable) y jamás se sube, persiste o envía a servidor. Las páginas se
 * clasifican por tipo de fuente (corregible); los candidatos conservan
 * archivo/página/tipo; la evidencia se agrupa por elemento SIN inventar
 * relaciones entre planos (pareo textual por código + revisión humana).
 * No se interpreta geometría, escala ni cotas visuales: la escala escrita es
 * solo contexto. La detección es F6A; la conversión entrega INPUT de F3 y F1
 * hace todo el cálculo.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, Copy, FileText, Layers, Search, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  canApprovePdfIntakeCandidate,
  detectPdfIntakeCandidates,
  pdfIntakeCandidatesToManualLines,
  reevaluatePdfIntakeCandidateText,
  type PdfIntakeCandidate,
  type PdfIntakeCandidateStatus,
  type PdfIntakeConfidenceLevel,
  type PdfIntakeFieldKey,
} from '@/lib/steel/pdf-intake-candidates';
import {
  detectPlanSetCandidates,
  summarizeElementEvidence,
  type ElementMention,
  type PlanSourceRef,
} from '@/lib/steel/pdf-plan-set';
import {
  classifyPdfExtraction,
  isAcceptablePdfFile,
  joinPagesForClipboard,
  PDF_NO_TEXT_MESSAGE,
  PLAN_SOURCE_TYPE_LABEL,
  PLAN_SOURCE_TYPES,
  shapeExtractedPage,
  suggestSourceTypeFromText,
  type ExtractedPdfPage,
  type PdfIntakeFileStatus,
  type PlanSourceType,
} from '@/lib/steel/pdf-text-extract';
import type { ManualLineRecord } from '@/lib/steel/manual-takeoff';

const SAMPLE_TEXT = [
  'VC-01 5#5600',
  'PILOTE P-03 74E#3200',
  '240 varillas #4 de 62 cm',
  'Estribos #3 @15 revisar luz',
  'barras longitudinales #5',
  '15 + 35 + 15 = 65 cm',
].join('\n');

const CONFIDENCE_LABEL: Record<PdfIntakeConfidenceLevel, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  needs_review: 'Requiere revision',
  not_interpretable: 'No interpretable',
};

const CONFIDENCE_VARIANT: Record<
  PdfIntakeConfidenceLevel,
  'success' | 'warning' | 'secondary' | 'destructive'
> = {
  high: 'success',
  medium: 'warning',
  low: 'secondary',
  needs_review: 'warning',
  not_interpretable: 'destructive',
};

const STATUS_LABEL: Record<PdfIntakeCandidateStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  discarded: 'Descartado',
  needs_review: 'Requiere revision',
};

const STATUS_VARIANT: Record<PdfIntakeCandidateStatus, 'default' | 'success' | 'secondary' | 'warning'> = {
  pending: 'default',
  approved: 'success',
  discarded: 'secondary',
  needs_review: 'warning',
};

const FIELD_LABEL: Record<PdfIntakeFieldKey, string> = {
  quantity: 'cantidad',
  barNumber: 'varilla #',
  length: 'longitud',
  spacing: 'separacion',
  element: 'elemento',
};

const FILE_STATUS_LABEL: Record<PdfIntakeFileStatus, string> = {
  pending: 'Pendiente',
  reading: 'Leyendo…',
  extracted: 'Texto extraido',
  no_text: 'Sin texto seleccionable',
  error: 'Error de lectura',
};

const FILE_STATUS_VARIANT: Record<PdfIntakeFileStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  pending: 'default',
  reading: 'default',
  extracted: 'success',
  no_text: 'warning',
  error: 'destructive',
};

interface EditablePdfPage extends ExtractedPdfPage {
  included: boolean;
  sourceType: PlanSourceType;
  suggestionReason?: string;
}

interface PdfSourceState {
  id: string;
  status: PdfIntakeFileStatus;
  fileName: string;
  sizeKb: number;
  pageCount: number;
  truncated: boolean;
  pages: EditablePdfPage[];
  error?: string;
}

function approvedCount(candidates: readonly PdfIntakeCandidate[]): number {
  return candidates.filter((candidate) => candidate.status === 'approved').length;
}

function sourceRefLabel(ref: PlanSourceRef): string {
  const type = ref.sourceType ? PLAN_SOURCE_TYPE_LABEL[ref.sourceType] : 'Fuente';
  return `${type}: ${ref.fileName ?? 'texto pegado'} p.${ref.pageNumber}`;
}

export function ManualPdfIntakeSection({
  disabled,
  onAddApproved,
}: {
  disabled?: boolean;
  onAddApproved: (lines: readonly Omit<ManualLineRecord, 'id'>[]) => void;
}) {
  const [sources, setSources] = useState<PdfSourceState[]>([]);
  const [mentions, setMentions] = useState<readonly ElementMention[]>([]);
  const [pageNumber, setPageNumber] = useState('1');
  const [sourceText, setSourceText] = useState('');
  const [candidates, setCandidates] = useState<readonly PdfIntakeCandidate[]>([]);
  const [hasDetected, setHasDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const nextSourceId = useRef(0);

  const manualPage = Math.max(1, Number(pageNumber) || 1);
  const approved = approvedCount(candidates);
  const readySources = sources.filter((source) => source.status === 'extracted');
  const includedPagesCount = readySources.reduce(
    (acc, source) => acc + source.pages.filter((page) => page.included && page.text.trim().length > 0).length,
    0,
  );
  const elementGroups = useMemo(
    () => (hasDetected ? summarizeElementEvidence(candidates, mentions) : []),
    [hasDetected, candidates, mentions],
  );

  async function handleFileSelected(file: File | null) {
    setCopied(false);
    if (!file) return;
    const id = `src-${++nextSourceId.current}`;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const check = isAcceptablePdfFile({ name: file.name, type: file.type, size: file.size });
    if (!check.ok) {
      setSources((current) => [
        ...current,
        { id, status: 'error', fileName: file.name, sizeKb, pageCount: 0, truncated: false, pages: [], error: check.reason },
      ]);
      return;
    }
    setSources((current) => [
      ...current,
      { id, status: 'reading', fileName: file.name, sizeKb, pageCount: 0, truncated: false, pages: [] },
    ]);
    try {
      const data = await file.arrayBuffer();
      // pdfjs-dist se carga aquí, bajo demanda, solo en el navegador.
      const { extractPdfTextInBrowser } = await import('@/lib/steel/pdf-text-extract-client');
      const result = await extractPdfTextInBrowser(data);
      const summary = classifyPdfExtraction(result.pages);
      setSources((current) =>
        current.map((source) =>
          source.id === id
            ? {
                ...source,
                status: summary.status,
                pageCount: result.pageCount,
                truncated: result.truncated,
                pages: result.pages.map((page) => {
                  const suggestion = suggestSourceTypeFromText(page.text);
                  return {
                    ...page,
                    included: page.hasText,
                    sourceType: suggestion?.type ?? 'otro',
                    suggestionReason: suggestion?.reason,
                  };
                }),
              }
            : source,
        ),
      );
    } catch {
      setSources((current) =>
        current.map((source) =>
          source.id === id
            ? {
                ...source,
                status: 'error',
                error: 'No se pudo leer el PDF (dañado, protegido o no compatible). No se envio a ningun servidor.',
              }
            : source,
        ),
      );
    }
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  function patchPage(sourceId: string, page: number, mutate: (current: EditablePdfPage) => EditablePdfPage) {
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? { ...source, pages: source.pages.map((p) => (p.pageNumber === page ? mutate(p) : p)) }
          : source,
      ),
    );
  }

  function handlePageTextEdit(sourceId: string, page: number, nextText: string) {
    patchPage(sourceId, page, (current) => ({
      ...shapeExtractedPage(current.pageNumber, nextText),
      included: current.included,
      sourceType: current.sourceType,
      suggestionReason: current.suggestionReason,
    }));
  }

  function handleDetectFromPlanSet() {
    if (includedPagesCount === 0) return;
    const result = detectPlanSetCandidates(
      readySources.map((source) => ({ fileName: source.fileName, pages: source.pages })),
    );
    setCandidates(result.candidates);
    setMentions(result.mentions);
    setHasDetected(true);
  }

  async function handleCopyExtracted() {
    const blocks = readySources
      .map((source) => {
        const included = source.pages.filter((page) => page.included && page.text.trim().length > 0);
        return included.length === 0 ? '' : `== ${source.fileName} ==\n${joinPagesForClipboard(included)}`;
      })
      .filter((block) => block.length > 0);
    if (blocks.length === 0) return;
    try {
      await navigator.clipboard.writeText(blocks.join('\n\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Portapapeles bloqueado: sin efecto (el texto sigue visible/editable).
    }
  }

  function handleDetectManual() {
    setCandidates(detectPdfIntakeCandidates(sourceText, { pageNumber: manualPage }));
    setMentions([]);
    setHasDetected(true);
  }

  function patchCandidate(id: string, mutate: (candidate: PdfIntakeCandidate) => PdfIntakeCandidate) {
    setCandidates((current) => current.map((candidate) => (candidate.id === id ? mutate(candidate) : candidate)));
  }

  function setStatus(id: string, status: PdfIntakeCandidateStatus) {
    patchCandidate(id, (candidate) => ({ ...candidate, status }));
  }

  function handleApprove(candidate: PdfIntakeCandidate) {
    if (!canApprovePdfIntakeCandidate(candidate).ok) return;
    setStatus(candidate.id, 'approved');
  }

  function handleAddApproved() {
    const lines = pdfIntakeCandidatesToManualLines(candidates);
    if (lines.length === 0) return;
    onAddApproved(lines);
    setCandidates((current) =>
      current.map((candidate) => (candidate.status === 'approved' ? { ...candidate, status: 'discarded' } : candidate)),
    );
  }

  return (
    <div className="rounded-xl border border-iconic-soft-blue/40 bg-white p-4 shadow-sm dark:border-line dark:bg-surface">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-iconic-ink dark:text-content">
            <FileText className="h-4 w-4 text-iconic-primary" aria-hidden="true" />
            Lectura asistida desde PDF/plano
          </h3>
          <p className="mt-1 text-xs text-iconic-graphite/70 dark:text-content-muted">
            Lectura asistida preliminar. No reemplaza revision tecnica.
          </p>
        </div>
        <Badge variant="secondary">Preview local F6A/F6B</Badge>
      </div>

      <InlineCallout tone="warning" className="mb-4" title="Solo texto seleccionable — sin OCR ni persistencia">
        No se aprueban cantidades automaticamente. Solo se extrae texto seleccionable del PDF.
        El sistema no interpreta geometria, escala ni cotas visuales en esta fase: si el plano
        (p. ej. exportado de AutoCAD) trae la escala escrita, se muestra como contexto pero jamas
        se usa para calcular longitudes. Los PDF quedan en tu navegador: no se suben, no se
        guardan y no se envian a servidor.
      </InlineCallout>

      <div>
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Fuentes del takeoff (plan set)
        </h4>
        <p className="mt-1 text-[11px] text-iconic-graphite/60">
          Un takeoff real usa varios planos: planta de cimentacion (ubicacion por ejes), cuadros de
          zapatas/columnas, despieces de vigas y cortes/detalles. Sube cada PDF y clasifica sus
          paginas; el sistema NO une planos automaticamente — la agrupacion por elemento es un
          pareo textual por codigo que tu revisas.
        </p>
        <Label htmlFor="pdf-intake-file" className="mt-2 block">
          Agregar PDF al plan set (se lee en tu navegador)
        </Label>
        <Input
          id="pdf-intake-file"
          type="file"
          accept="application/pdf"
          className="mt-1"
          disabled={disabled}
          onChange={(event) => {
            void handleFileSelected(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </div>

      {sources.length > 0 && (
        <ul className="mt-3 space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="rounded-lg border border-iconic-soft-blue/40 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={FILE_STATUS_VARIANT[source.status]}>{FILE_STATUS_LABEL[source.status]}</Badge>
                <span className="font-medium">{source.fileName}</span>
                <span className="text-iconic-graphite/50">{source.sizeKb} KB</span>
                {source.pageCount > 0 && (
                  <span className="text-iconic-graphite/50">
                    {source.pageCount} pagina(s){source.truncated ? ' (limite de preview aplicado)' : ''}
                  </span>
                )}
                <span className="grow" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSource(source.id)}
                  disabled={disabled}
                  aria-label={`Quitar fuente ${source.fileName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Quitar
                </Button>
              </div>

              {source.status === 'error' && (
                <InlineCallout tone="warning" className="mt-2" title="No se pudo leer el PDF">
                  {source.error}
                </InlineCallout>
              )}
              {source.status === 'no_text' && (
                <InlineCallout tone="warning" className="mt-2" title="Este PDF no contiene texto seleccionable suficiente">
                  {PDF_NO_TEXT_MESSAGE} No se inventan cantidades desde lineas dibujadas.
                </InlineCallout>
              )}

              {source.status === 'extracted' && source.pages.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {source.pages.map((page) => (
                    <li key={page.pageNumber} className="rounded-md border border-iconic-soft-blue/30 p-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={page.included}
                            onChange={(event) =>
                              patchPage(source.id, page.pageNumber, (current) => ({
                                ...current,
                                included: event.target.checked,
                              }))
                            }
                            disabled={disabled}
                            aria-label={`Incluir pagina ${page.pageNumber} de ${source.fileName}`}
                          />
                          <span className="font-medium">Pagina {page.pageNumber}</span>
                        </label>
                        <Select
                          value={page.sourceType}
                          onChange={(event) =>
                            patchPage(source.id, page.pageNumber, (current) => ({
                              ...current,
                              sourceType: event.target.value as PlanSourceType,
                              suggestionReason: undefined,
                            }))
                          }
                          disabled={disabled}
                          aria-label={`Tipo de fuente de la pagina ${page.pageNumber} de ${source.fileName}`}
                          className="w-44 text-xs"
                        >
                          {PLAN_SOURCE_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {PLAN_SOURCE_TYPE_LABEL[type]}
                            </option>
                          ))}
                        </Select>
                        {page.suggestionReason && (
                          <span className="text-[11px] text-iconic-graphite/50">sugerido: {page.suggestionReason}</span>
                        )}
                        <span className="text-iconic-graphite/50">{page.charCount} caracteres</span>
                        {!page.hasText && <Badge variant="warning">sin texto seleccionable</Badge>}
                        {page.scaleNotes.map((note) => (
                          <Badge key={note} variant="secondary">
                            Escala anotada {note} — solo contexto, no se usa para calcular
                          </Badge>
                        ))}
                      </div>
                      {page.hasText && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-iconic-graphite/60">
                            Ver/editar texto de la pagina
                          </summary>
                          <textarea
                            value={page.text}
                            onChange={(event) => handlePageTextEdit(source.id, page.pageNumber, event.target.value)}
                            className="mt-1 min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-line dark:bg-surface-soft dark:text-content"
                            disabled={disabled}
                            aria-label={`Texto extraido de la pagina ${page.pageNumber} de ${source.fileName}`}
                          />
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {readySources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={handleDetectFromPlanSet} disabled={disabled || includedPagesCount === 0}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Detectar candidatos del plan set
          </Button>
          <Button type="button" variant="outline" onClick={handleCopyExtracted} disabled={disabled || includedPagesCount === 0}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? 'Copiado' : 'Copiar texto extraido'}
          </Button>
        </div>
      )}

      <div className="mt-4">
        <Label htmlFor="pdf-intake-text">O pega texto manualmente (fallback siempre disponible)</Label>
        <textarea
          id="pdf-intake-text"
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          className="mt-1 min-h-32 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line dark:bg-surface-soft dark:text-content"
          placeholder="Pega aqui texto copiado del PDF, por ejemplo: VC-01 5#5600, 240 varillas #4 de 62 cm, Estribos #3 @15"
          disabled={disabled}
        />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-24">
            <Label htmlFor="pdf-intake-page">Pagina</Label>
            <Input
              id="pdf-intake-page"
              type="number"
              min="1"
              step="1"
              value={pageNumber}
              onChange={(event) => setPageNumber(event.target.value)}
              className="mt-1"
              disabled={disabled}
            />
          </div>
          <Button type="button" onClick={handleDetectManual} disabled={disabled || sourceText.trim().length === 0}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Detectar candidatos
          </Button>
          <Button type="button" variant="outline" onClick={() => setSourceText(SAMPLE_TEXT)} disabled={disabled}>
            Cargar ejemplo
          </Button>
          <span className="text-xs text-iconic-graphite/50">
            {candidates.length} candidato(s), {approved} aprobado(s)
          </span>
        </div>
      </div>

      {hasDetected && candidates.length === 0 && (
        <InlineCallout tone="info" className="mt-4">
          No hay informacion suficiente para cantidad automatica; se requiere seleccion, calibracion o revision manual.
        </InlineCallout>
      )}

      {elementGroups.length > 0 && (
        <div className="mt-4 rounded-lg border border-iconic-soft-blue/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
            Evidencia por elemento (pareo textual por codigo — revisa antes de confiar)
          </h4>
          <ul className="mt-2 space-y-2">
            {elementGroups.map((group) => (
              <li key={group.elementKey} className="rounded-md border border-iconic-soft-blue/30 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-iconic-ink">{group.elementLabel}</span>
                  <span className="text-iconic-graphite/50">
                    {group.candidateIds.length} candidato(s) de acero
                  </span>
                  {group.steelSources.map((ref) => (
                    <Badge key={`s-${sourceRefLabel(ref)}`} variant="success">
                      {sourceRefLabel(ref)}
                    </Badge>
                  ))}
                  {group.locationSources.map((ref) => (
                    <Badge key={`l-${sourceRefLabel(ref)}`} variant="secondary">
                      {sourceRefLabel(ref)}
                    </Badge>
                  ))}
                  {group.detailSources.map((ref) => (
                    <Badge key={`d-${sourceRefLabel(ref)}`} variant="secondary">
                      {sourceRefLabel(ref)}
                    </Badge>
                  ))}
                </div>
                {group.missingHints.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
                    {group.missingHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-iconic-soft-blue/40">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-iconic-graphite/60">
              <tr>
                <th scope="col" className="px-3 py-2">Texto candidato</th>
                <th scope="col" className="px-3 py-2">Interpretacion y campos</th>
                <th scope="col" className="px-3 py-2">Evidencia</th>
                <th scope="col" className="px-3 py-2">Confianza</th>
                <th scope="col" className="px-3 py-2">Estado</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iconic-soft-blue/20">
              {candidates.map((candidate) => {
                const approval = canApprovePdfIntakeCandidate(candidate);
                return (
                  <tr key={candidate.id} className={candidate.status === 'discarded' ? 'opacity-60' : undefined}>
                    <td className="w-52 px-3 py-2 align-top">
                      <Input
                        value={candidate.candidateText}
                        onChange={(event) =>
                          patchCandidate(candidate.id, (current) =>
                            reevaluatePdfIntakeCandidateText(current, event.target.value),
                          )
                        }
                        className="font-mono text-xs"
                        disabled={disabled || candidate.status === 'discarded'}
                        aria-label={`Texto candidato ${candidate.evidence.originalText}`}
                      />
                      {candidate.elementLabel && (
                        <p className="mt-1 text-[11px] text-iconic-graphite/60">
                          Elemento: <span className="font-medium">{candidate.elementLabel}</span>
                        </p>
                      )}
                    </td>
                    <td className="max-w-sm px-3 py-2 align-top text-xs text-iconic-graphite/70">
                      <p className="line-clamp-3">{candidate.suggestedInterpretation}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {candidate.detectedFields.map((field) => (
                          <Badge key={`det-${field}`} variant="success">
                            {FIELD_LABEL[field]}
                          </Badge>
                        ))}
                        {candidate.missingFields.map((field) => (
                          <Badge key={`mis-${field}`} variant="destructive">
                            falta {FIELD_LABEL[field]}
                          </Badge>
                        ))}
                      </div>
                      {candidate.warnings.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
                          {candidate.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="max-w-52 px-3 py-2 align-top text-xs">
                      {candidate.evidence.fileName && (
                        <p className="truncate font-medium text-iconic-graphite/70" title={candidate.evidence.fileName}>
                          {candidate.evidence.fileName}
                        </p>
                      )}
                      <p>
                        Pag. {candidate.evidence.pageNumber}, linea {candidate.evidence.lineIndex + 1}
                        {candidate.evidence.sourceType && (
                          <span className="text-iconic-graphite/50">
                            {' '}
                            · {PLAN_SOURCE_TYPE_LABEL[candidate.evidence.sourceType]}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-iconic-graphite/70">
                        “{candidate.evidence.originalText}”
                      </p>
                      <p className="mt-1 text-[11px] text-iconic-graphite/50">
                        {candidate.evidence.detectionReason}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant={CONFIDENCE_VARIANT[candidate.confidenceLevel]}>
                        {CONFIDENCE_LABEL[candidate.confidenceLevel]} · {(Number(candidate.confidenceScore) * 100).toFixed(0)}%
                      </Badge>
                      <p className="mt-1 max-w-40 text-[11px] text-iconic-graphite/50">
                        {candidate.confidenceReason}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={candidate.status}
                        onChange={(event) => {
                          const next = event.target.value as PdfIntakeCandidateStatus;
                          if (next === 'approved' && !canApprovePdfIntakeCandidate(candidate).ok) return;
                          setStatus(candidate.id, next);
                        }}
                        disabled={disabled}
                        aria-label={`Estado de ${candidate.evidence.originalText}`}
                      >
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value} disabled={value === 'approved' && !approval.ok}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <div className="mt-1">
                        <Badge variant={STATUS_VARIANT[candidate.status]}>{STATUS_LABEL[candidate.status]}</Badge>
                      </div>
                      {!approval.ok && candidate.status !== 'discarded' && (
                        <p className="mt-1 max-w-40 text-[11px] text-iconic-graphite/50">{approval.reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleApprove(candidate)}
                          disabled={disabled || !approval.ok}
                          aria-label={`Aprobar ${candidate.evidence.originalText}`}
                          title={approval.ok ? 'Aprobar' : approval.reason}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setStatus(candidate.id, 'discarded')}
                          disabled={disabled}
                          aria-label={`Descartar ${candidate.evidence.originalText}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setStatus(candidate.id, 'pending')}
                          disabled={disabled || candidate.status !== 'discarded'}
                          aria-label={`Restaurar ${candidate.evidence.originalText}`}
                        >
                          <Undo2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-iconic-graphite/60">
            Los aprobados entran como lineas nuevas del takeoff manual; F1 hace el parser y el calculo despues.
            Los candidatos con campos faltantes no se pueden aprobar: el sistema no inventa cantidades.
          </p>
          <Button type="button" onClick={handleAddApproved} disabled={disabled || approved === 0}>
            Enviar aprobados al takeoff manual
          </Button>
        </div>
      )}
    </div>
  );
}
