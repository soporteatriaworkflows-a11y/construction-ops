/**
 * manual-pdf-intake-section.tsx — Preview F6A de ingesta PDF/plano.
 *
 * Cliente puro: el archivo seleccionado no se sube, no se persiste y no se
 * envía al servidor. La detección trabaja sobre texto pegado manualmente y
 * produce candidatos revisables (lib/steel/pdf-intake-candidates.ts); la
 * conversión entrega INPUT del takeoff manual F3 y F1 hace todo el cálculo.
 */
'use client';

import { useMemo, useState } from 'react';
import { Check, FileText, Search, Trash2, Undo2 } from 'lucide-react';
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

function localFileLabel(file: File | null, fallbackName: string): string {
  if (!file) return fallbackName;
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  return `${file.name} (${sizeKb} KB, local)`;
}

function approvedCount(candidates: readonly PdfIntakeCandidate[]): number {
  return candidates.filter((candidate) => candidate.status === 'approved').length;
}

export function ManualPdfIntakeSection({
  disabled,
  onAddApproved,
}: {
  disabled?: boolean;
  onAddApproved: (lines: readonly Omit<ManualLineRecord, 'id'>[]) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mockFileName, setMockFileName] = useState('plano-estructural-preview.pdf');
  const [pageNumber, setPageNumber] = useState('1');
  const [sourceText, setSourceText] = useState('');
  const [candidates, setCandidates] = useState<readonly PdfIntakeCandidate[]>([]);
  const [hasDetected, setHasDetected] = useState(false);

  const page = Math.max(1, Number(pageNumber) || 1);
  const fileLabel = useMemo(() => localFileLabel(selectedFile, mockFileName), [mockFileName, selectedFile]);
  const approved = approvedCount(candidates);

  function handleDetect() {
    setCandidates(detectPdfIntakeCandidates(sourceText, { pageNumber: page, fileName: fileLabel }));
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
            Importar desde PDF/plano
          </h3>
          <p className="mt-1 text-xs text-iconic-graphite/70 dark:text-content-muted">
            Lectura asistida preliminar. No reemplaza revision tecnica.
          </p>
        </div>
        <Badge variant="secondary">Preview local F6A</Badge>
      </div>

      <InlineCallout tone="warning" className="mb-4" title="Sin OCR ni persistencia en esta fase">
        No se aprueban cantidades automaticamente. El sistema no infiere escala ni geometria en esta fase.
        El PDF seleccionado queda en el navegador: no se sube, no se guarda y no se envia a servidor.
      </InlineCallout>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <Label htmlFor="pdf-intake-file">PDF/plano local (referencia visual)</Label>
          <Input
            id="pdf-intake-file"
            type="file"
            accept="application/pdf"
            className="mt-1"
            disabled={disabled}
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-[11px] text-iconic-graphite/50">{fileLabel}</p>
        </div>
        <div>
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
      </div>

      <div className="mt-3">
        <Label htmlFor="pdf-intake-mock-name">Nombre mock si no seleccionas archivo</Label>
        <Input
          id="pdf-intake-mock-name"
          value={mockFileName}
          onChange={(event) => setMockFileName(event.target.value)}
          className="mt-1"
          disabled={disabled || selectedFile !== null}
        />
      </div>

      <div className="mt-3">
        <Label htmlFor="pdf-intake-text">Texto extraido manualmente del PDF/plano</Label>
        <textarea
          id="pdf-intake-text"
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          className="mt-1 min-h-32 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line dark:bg-surface-soft dark:text-content"
          placeholder="Pega aqui texto copiado del PDF, por ejemplo: VC-01 5#5600, 240 varillas #4 de 62 cm, Estribos #3 @15"
          disabled={disabled}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleDetect} disabled={disabled || sourceText.trim().length === 0}>
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
                      <p>
                        Pag. {candidate.evidence.pageNumber}, linea {candidate.evidence.lineIndex + 1}
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
