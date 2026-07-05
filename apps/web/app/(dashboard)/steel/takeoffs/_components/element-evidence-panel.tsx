/**
 * element-evidence-panel.tsx — Sección "Evidencia por elemento" (F6E).
 *
 * Estación de revisión por ELEMENTO estructural: agrupa candidatos (F6A/F6C)
 * y menciones (F6B) por código (VC-01, Z-01, PILOTE P-03…) usando el modelo
 * puro `element-evidence-linking`. Muestra fuentes asociadas, qué falta,
 * conflictos y candidatos del grupo, con acciones humanas: aprobar grupo,
 * descartar evidencia y marcar requiere revisión. Nada se aprueba ni se
 * fusiona automáticamente; nada se calcula aquí (F1 es la única calculadora).
 */
'use client';

import { useMemo } from 'react';
import { Boxes, Check, Flag, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildElementEvidenceLinks,
  canApproveElementGroup,
  ELEMENT_EVIDENCE_KIND_LABEL,
  ELEMENT_EVIDENCE_METHOD_LABEL,
  ELEMENT_LINK_STATUS_LABEL,
  ELEMENT_MISSING_LABEL,
  type ElementEvidenceItem,
  type ElementEvidenceLink,
  type ElementLinkStatus,
} from '@/lib/steel/element-evidence-linking';
import type { PdfIntakeCandidate } from '@/lib/steel/pdf-intake-candidates';
import type { ElementMention } from '@/lib/steel/pdf-plan-set';

const STATUS_VARIANT: Record<ElementLinkStatus, 'success' | 'warning' | 'secondary' | 'destructive' | 'default'> = {
  conflicto_entre_fuentes: 'destructive',
  solo_candidato_parcial: 'warning',
  falta_refuerzo: 'warning',
  falta_ubicacion: 'warning',
  falta_detalle: 'warning',
  listo_para_revision: 'default',
  aprobado_para_takeoff: 'success',
};

const KIND_VARIANT: Record<ElementEvidenceItem['kind'], 'success' | 'secondary' | 'warning' | 'default'> = {
  ubicacion_ejes: 'secondary',
  refuerzo_despiece: 'success',
  detalle_corte: 'default',
  tabla_cuadro: 'default',
  notas: 'secondary',
  otro: 'secondary',
  sin_clasificar: 'secondary',
};

function evidenceRefLabel(item: ElementEvidenceItem): string {
  const file = item.fileName ?? 'texto pegado';
  return `${file} p.${item.pageNumber}, linea ${item.lineIndex + 1}`;
}

export function ElementEvidencePanel({
  candidates,
  mentions,
  disabled,
  onApproveGroup,
  onMarkGroupNeedsReview,
  onDiscardCandidate,
  onRestoreCandidate,
}: {
  candidates: readonly PdfIntakeCandidate[];
  mentions: readonly ElementMention[];
  disabled?: boolean;
  onApproveGroup: (link: ElementEvidenceLink) => void;
  onMarkGroupNeedsReview: (link: ElementEvidenceLink) => void;
  onDiscardCandidate: (candidateId: string) => void;
  onRestoreCandidate: (candidateId: string) => void;
}) {
  const links = useMemo(() => buildElementEvidenceLinks(candidates, mentions), [candidates, mentions]);
  const candidateById = useMemo(() => {
    const map = new Map<string, PdfIntakeCandidate>();
    for (const candidate of candidates) map.set(candidate.id, candidate);
    return map;
  }, [candidates]);

  if (links.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-iconic-soft-blue/40 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
        Evidencia por elemento
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        Agrupacion por pareo textual del codigo (VC-01 = VC-01): no se inventan relaciones ni se
        fusionan datos entre fuentes. Aprobar un grupo solo aprueba sus candidatos convertibles;
        lo que falta se dice, jamas se completa solo.
      </p>

      <ul className="mt-2 space-y-3">
        {links.map((link) => {
          const approval = canApproveElementGroup(link);
          return (
            <li key={link.elementKey} className="rounded-md border border-iconic-soft-blue/30 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-iconic-ink dark:text-content">{link.elementLabel}</span>
                <Badge variant={STATUS_VARIANT[link.status]}>{ELEMENT_LINK_STATUS_LABEL[link.status]}</Badge>
                <span className="text-iconic-graphite/50">
                  {link.activeCandidateIds.length} candidato(s) vigente(s) · {link.evidence.length} evidencia(s)
                </span>
                <span className="grow" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onApproveGroup(link)}
                  disabled={disabled || !approval.ok}
                  title={approval.ok ? 'Aprobar los candidatos convertibles del grupo' : approval.reason}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Aprobar grupo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onMarkGroupNeedsReview(link)}
                  disabled={disabled || link.activeCandidateIds.length === 0}
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  Marcar requiere revision
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-iconic-graphite/60">{link.statusReason}</p>

              {link.similarElementKeys.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Codigos parecidos detectados ({link.similarElementKeys.join(', ')}): podrian ser el
                  mismo elemento, pero NO se fusionan automaticamente — verifica contra el plano.
                </p>
              )}

              {link.conflicts.length > 0 && (
                <ul className="mt-1.5 space-y-1 rounded border border-red-300/60 bg-red-50/50 p-2 text-[11px] text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {link.conflicts.map((conflict, index) => (
                    <li key={index}>{conflict.description}</li>
                  ))}
                </ul>
              )}

              {link.missing.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
                  {link.missing.map((kind) => (
                    <li key={kind}>{ELEMENT_MISSING_LABEL[kind]}</li>
                  ))}
                </ul>
              )}

              <div className="mt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-iconic-graphite/50">
                  Fuentes asociadas
                </p>
                <ul className="mt-1 space-y-1">
                  {link.evidence.map((item) => (
                    <li key={item.id} className={`flex flex-wrap items-center gap-1.5 ${item.discarded ? 'opacity-50' : ''}`}>
                      <Badge variant={KIND_VARIANT[item.kind]}>{ELEMENT_EVIDENCE_KIND_LABEL[item.kind]}</Badge>
                      {item.method && (
                        <Badge variant={item.method === 'ocr' ? 'warning' : 'secondary'}>
                          {ELEMENT_EVIDENCE_METHOD_LABEL[item.method]}
                        </Badge>
                      )}
                      <span className="text-iconic-graphite/60">{evidenceRefLabel(item)}</span>
                      <span className="max-w-96 truncate font-mono text-[11px] text-iconic-graphite/70" title={item.lineText}>
                        “{item.lineText}”
                      </span>
                      {item.origin === 'mention' && (
                        <span className="text-[10px] text-iconic-graphite/50">mencion (contexto, no cantidad)</span>
                      )}
                      {item.candidateId && !item.discarded && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onDiscardCandidate(item.candidateId!)}
                          disabled={disabled}
                          aria-label={`Descartar evidencia ${item.lineText}`}
                          title="Descartar esta evidencia (descarta el candidato asociado)"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      {item.candidateId && item.discarded && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onRestoreCandidate(item.candidateId!)}
                          disabled={disabled}
                          aria-label={`Restaurar evidencia ${item.lineText}`}
                          title="Restaurar el candidato descartado"
                        >
                          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {link.activeCandidateIds.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-iconic-graphite/50">
                    Candidatos del elemento
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {link.activeCandidateIds.map((candidateId) => {
                      const candidate = candidateById.get(candidateId);
                      if (!candidate) return null;
                      return (
                        <li key={candidateId} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">{candidate.candidateText}</span>
                          <Badge
                            variant={
                              candidate.status === 'approved'
                                ? 'success'
                                : candidate.status === 'needs_review'
                                  ? 'warning'
                                  : 'default'
                            }
                          >
                            {candidate.status === 'approved'
                              ? 'Aprobado'
                              : candidate.status === 'needs_review'
                                ? 'Requiere revision'
                                : 'Pendiente'}
                          </Badge>
                          {!candidate.f1Ready && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400">
                              parcial: faltan datos, no aprobable
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
