/**
 * element-evidence-linking.ts — Vinculación de evidencia por elemento (F6E, puro).
 *
 * Problema real: un elemento estructural (VC-01, Z-01, COLUMNA C-02…) necesita
 * VARIAS fuentes para cuantificarse: ubicación desde planta/ejes, refuerzo
 * desde despiece, sección desde detalle/corte, repeticiones desde tabla y
 * notas generales. Este módulo agrupa candidatos (F6A/F6B/F6C) y menciones
 * (F6B) por CÓDIGO de elemento — pareo textual, jamás relación inventada — y
 * deriva estados de completitud honestos para revisión humana.
 *
 * Reglas duras (espejo F6-S1…S10 del blueprint):
 * - No fusiona datos: los candidatos siguen siendo filas separadas por fuente.
 * - No resuelve contradicciones: un conflicto se marca y exige humano.
 * - No aprueba nada solo: aprobar un grupo es una acción humana y solo toca
 *   los candidatos ya convertibles (los parciales quedan como están).
 * - No calcula: cero ml/kg/costo aquí — F1 sigue siendo la única calculadora.
 * - No persiste: sin DB, sin Supabase, sin storage, sin red. Funciones puras.
 */
import { parseSteelDescription } from '@/modules/steel';
import { canApprovePdfIntakeCandidate, type PdfIntakeCandidate } from './pdf-intake-candidates';
import { elementGroupKey, type ElementMention } from './pdf-plan-set';
import type { PlanSourceType } from './pdf-text-extract';
import type {
  ManualLineEvidence,
  ManualLineEvidenceMethod,
  ManualLineRecord,
} from './manual-takeoff';

// ---------------------------------------------------------------------------
// Evidencia por elemento
// ---------------------------------------------------------------------------

/** Tipo de fuente de un item de evidencia; `sin_clasificar` = página sin tipo. */
export type ElementEvidenceKind = PlanSourceType | 'sin_clasificar';

export const ELEMENT_EVIDENCE_KIND_LABEL: Record<ElementEvidenceKind, string> = {
  ubicacion_ejes: 'Ubicacion/ejes',
  refuerzo_despiece: 'Refuerzo/despiece',
  detalle_corte: 'Detalle/corte',
  tabla_cuadro: 'Tabla/cuadro',
  notas: 'Notas',
  otro: 'Otro',
  sin_clasificar: 'Sin clasificar',
};

export const ELEMENT_EVIDENCE_METHOD_LABEL: Record<ManualLineEvidenceMethod, string> = {
  native_text: 'Texto nativo',
  ocr: 'OCR',
  manual: 'Texto pegado/manual',
  dxf: 'Entidad DXF (CAD)',
};

/**
 * Un item de evidencia dentro del grupo de un elemento. Puede nacer de un
 * candidato de acero (F6A/F6C) o de una mención sin acero (F6B: el elemento
 * aparece en una planta/cuadro/nota). Una mención NUNCA es una cantidad.
 */
export interface ElementEvidenceItem {
  id: string;
  origin: 'candidate' | 'mention';
  /** Presente solo cuando el item proviene de un candidato de acero. */
  candidateId?: string;
  kind: ElementEvidenceKind;
  /** Método de lectura (solo candidatos; una mención no registra método). */
  method?: ManualLineEvidenceMethod;
  fileName?: string;
  pageNumber: number;
  lineIndex: number;
  lineText: string;
  /** true si el candidato asociado fue descartado por el humano. */
  discarded: boolean;
}

/** Conflicto entre fuentes del mismo elemento. Nunca se resuelve solo. */
export interface ElementEvidenceConflict {
  candidateIds: readonly string[];
  description: string;
}

export type ElementMissingKind = 'ubicacion' | 'refuerzo' | 'detalle';

export const ELEMENT_MISSING_LABEL: Record<ElementMissingKind, string> = {
  ubicacion: 'Falta ubicacion (planta/ejes): vincula la fuente donde el elemento esta localizado.',
  refuerzo: 'Falta refuerzo (despiece/tabla): no hay candidatos de acero para este elemento.',
  detalle: 'Falta detalle/corte o tabla/cuadro: la seccion/estribos requieren confirmar detalle.',
};

/** Estado de completitud del grupo — derivado, nunca aprobación automática. */
export type ElementLinkStatus =
  | 'conflicto_entre_fuentes'
  | 'solo_candidato_parcial'
  | 'falta_refuerzo'
  | 'falta_ubicacion'
  | 'falta_detalle'
  | 'listo_para_revision'
  | 'aprobado_para_takeoff';

export const ELEMENT_LINK_STATUS_LABEL: Record<ElementLinkStatus, string> = {
  conflicto_entre_fuentes: 'Conflicto entre fuentes',
  solo_candidato_parcial: 'Solo candidato parcial',
  falta_refuerzo: 'Falta refuerzo',
  falta_ubicacion: 'Falta ubicacion',
  falta_detalle: 'Falta detalle',
  listo_para_revision: 'Listo para revision',
  aprobado_para_takeoff: 'Aprobado para enviar a takeoff',
};

/** Grupo de evidencia de un elemento estructural (pareo textual por código). */
export interface ElementEvidenceLink {
  /** Código normalizado que agrupa (VC-01). Pareo textual exacto. */
  elementKey: string;
  /** Etiqueta más descriptiva vista (p. ej. "VIGA VC-01"). */
  elementLabel: string;
  evidence: readonly ElementEvidenceItem[];
  /** Ids de TODOS los candidatos asociados al elemento (incluye descartados). */
  candidateIds: readonly string[];
  /** Candidatos vigentes (no descartados). */
  activeCandidateIds: readonly string[];
  /** Vigentes que pasan la compuerta de aprobación y aún no están aprobados. */
  approvableCandidateIds: readonly string[];
  approvedCandidateIds: readonly string[];
  /** Vigentes NO convertibles (faltan datos): jamás se aprueban ni completan. */
  partialCandidateIds: readonly string[];
  conflicts: readonly ElementEvidenceConflict[];
  missing: readonly ElementMissingKind[];
  /**
   * Códigos de otros grupos que PARECEN el mismo elemento (VC-1 vs VC-01).
   * Se avisa, pero NUNCA se fusionan: decidir es del humano.
   */
  similarElementKeys: readonly string[];
  status: ElementLinkStatus;
  statusReason: string;
}

// ---------------------------------------------------------------------------
// Construcción de grupos
// ---------------------------------------------------------------------------

/** Método efectivo de lectura de un candidato: sin archivo ⇒ texto pegado. */
export function candidateReadingMethod(
  candidate: Pick<PdfIntakeCandidate, 'evidence'>,
): ManualLineEvidenceMethod {
  if (!candidate.evidence.fileName) return 'manual';
  return candidate.evidence.method;
}

function evidenceKindOf(sourceType: PlanSourceType | undefined): ElementEvidenceKind {
  return sourceType ?? 'sin_clasificar';
}

/**
 * Nº de varilla REAL leído por el parser F1 (solo lectura, cero cálculo):
 * en notación compacta `5#5600` la varilla es #5, no el token "56" que
 * capturaría una regex ingenua. Sin varilla interpretable ⇒ sin firma.
 */
function barNumberOf(candidate: PdfIntakeCandidate): number | undefined {
  const parsed = parseSteelDescription(candidate.candidateText);
  return parsed.steelFamily === 'rebar' ? parsed.barNumber : undefined;
}

function normalizedText(candidate: PdfIntakeCandidate): string {
  return candidate.candidateText.toUpperCase().replace(/\s+/g, '');
}

interface MutableLink {
  elementKey: string;
  elementLabel: string;
  evidence: ElementEvidenceItem[];
  candidates: PdfIntakeCandidate[];
}

/**
 * Detecta contradicciones OCR↔nativo dentro del grupo SIN resolverlas:
 * mismo elemento y misma varilla leídos con texto distinto por métodos
 * distintos. Incluye los conflictos ya marcados por la comparación híbrida
 * F6C (`crossCheck === 'conflict'`).
 */
function detectConflicts(candidates: readonly PdfIntakeCandidate[]): ElementEvidenceConflict[] {
  const active = candidates.filter((candidate) => candidate.status !== 'discarded');
  const conflicts: ElementEvidenceConflict[] = [];

  // Conflicto marcado por la comparación híbrida F6C. Solo sigue vivo si
  // quedan al menos DOS lecturas vigentes: descartar la lectura incorrecta
  // (decisión humana) resuelve el conflicto.
  const crossChecked = active.filter((candidate) => candidate.crossCheck === 'conflict');
  if (crossChecked.length >= 2) {
    conflicts.push({
      candidateIds: crossChecked.map((candidate) => candidate.id),
      description:
        'Conflicto nativo vs OCR marcado en la comparacion hibrida: la misma lectura difiere segun el metodo. Verifica contra el plano y descarta la lectura incorrecta.',
    });
  }

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]!;
      const b = active[j]!;
      const barA = barNumberOf(a);
      const barB = barNumberOf(b);
      if (barA === undefined || barA !== barB) continue;
      if (normalizedText(a) === normalizedText(b)) continue;
      const methodA = candidateReadingMethod(a);
      const methodB = candidateReadingMethod(b);
      const isOcrVsOther = (methodA === 'ocr') !== (methodB === 'ocr');
      if (!isOcrVsOther) continue;
      // Ya cubierto por el marcado F6C ⇒ no duplicar la entrada.
      if (a.crossCheck === 'conflict' && b.crossCheck === 'conflict') continue;
      conflicts.push({
        candidateIds: [a.id, b.id],
        description: `Lecturas contradictorias para la varilla #${barA}: "${a.candidateText}" (${ELEMENT_EVIDENCE_METHOD_LABEL[methodA]}) vs "${b.candidateText}" (${ELEMENT_EVIDENCE_METHOD_LABEL[methodB]}). No se resuelve automaticamente.`,
      });
    }
  }

  return conflicts;
}

const SIMILAR_KEY_PATTERN = /^([A-Z]{1,4})-(\d{1,3})([A-Z]?)$/;

/**
 * Códigos que PARECEN el mismo elemento (VC-1 vs VC-01: mismo prefijo, mismo
 * número, distinta escritura). Solo se avisan — fusionarlos sería inventar
 * una relación.
 */
function findSimilarKeys(key: string, allKeys: readonly string[]): string[] {
  const match = key.match(SIMILAR_KEY_PATTERN);
  if (!match) return [];
  const [, prefix, digits, suffix] = match;
  return allKeys.filter((other) => {
    if (other === key) return false;
    const otherMatch = other.match(SIMILAR_KEY_PATTERN);
    if (!otherMatch) return false;
    return (
      otherMatch[1] === prefix &&
      Number(otherMatch[2]) === Number(digits) &&
      otherMatch[3] === suffix
    );
  });
}

function deriveStatus(params: {
  conflicts: readonly ElementEvidenceConflict[];
  missing: readonly ElementMissingKind[];
  activeCount: number;
  approvableCount: number;
  approvedCount: number;
  partialCount: number;
}): { status: ElementLinkStatus; statusReason: string } {
  const { conflicts, missing, activeCount, approvableCount, approvedCount, partialCount } = params;

  if (conflicts.length > 0) {
    return {
      status: 'conflicto_entre_fuentes',
      statusReason:
        'Hay lecturas contradictorias entre fuentes/metodos: requiere revision humana antes de continuar.',
    };
  }
  if (activeCount === 0) {
    return {
      status: 'falta_refuerzo',
      statusReason:
        'El elemento aparece mencionado pero sin candidatos de acero vigentes: falta la fuente de refuerzo/despiece.',
    };
  }
  if (approvableCount === 0 && approvedCount === 0) {
    return {
      status: 'solo_candidato_parcial',
      statusReason:
        'Solo hay candidatos parciales (faltan datos como cantidad o longitud): no se inventa lo que falta.',
    };
  }
  if (approvedCount > 0 && approvableCount === 0 && partialCount === 0) {
    return {
      status: 'aprobado_para_takeoff',
      statusReason: 'Todos los candidatos vigentes del grupo fueron aprobados por revision humana.',
    };
  }
  if (missing.includes('ubicacion')) {
    return {
      status: 'falta_ubicacion',
      statusReason: ELEMENT_MISSING_LABEL.ubicacion,
    };
  }
  if (missing.includes('detalle')) {
    return {
      status: 'falta_detalle',
      statusReason: ELEMENT_MISSING_LABEL.detalle,
    };
  }
  return {
    status: 'listo_para_revision',
    statusReason: 'Evidencia de ubicacion, refuerzo y detalle presente: lista para revision humana.',
  };
}

/**
 * Agrupa candidatos y menciones por elemento (pareo textual por código).
 * Candidatos sin código de elemento NO entran a ningún grupo: relacionarlos
 * sería inventar. Nada se fusiona; nada se aprueba; nada se calcula.
 */
export function buildElementEvidenceLinks(
  candidates: readonly PdfIntakeCandidate[],
  mentions: readonly ElementMention[] = [],
): ElementEvidenceLink[] {
  const groups = new Map<string, MutableLink>();

  const getGroup = (label: string): MutableLink => {
    const key = elementGroupKey(label);
    let group = groups.get(key);
    if (!group) {
      group = { elementKey: key, elementLabel: label, evidence: [], candidates: [] };
      groups.set(key, group);
    }
    if (label.length > group.elementLabel.length) group.elementLabel = label;
    return group;
  };

  for (const candidate of candidates) {
    if (!candidate.elementLabel) continue;
    const group = getGroup(candidate.elementLabel);
    group.candidates.push(candidate);
    group.evidence.push({
      id: `cand-${candidate.id}`,
      origin: 'candidate',
      candidateId: candidate.id,
      kind: evidenceKindOf(candidate.evidence.sourceType),
      method: candidateReadingMethod(candidate),
      fileName: candidate.evidence.fileName,
      pageNumber: candidate.evidence.pageNumber,
      lineIndex: candidate.evidence.lineIndex,
      lineText: candidate.evidence.lineText,
      discarded: candidate.status === 'discarded',
    });
  }

  mentions.forEach((mention, index) => {
    const group = getGroup(mention.elementLabel);
    const duplicate = group.evidence.some(
      (item) =>
        item.origin === 'mention' &&
        item.fileName === mention.fileName &&
        item.pageNumber === mention.pageNumber &&
        item.lineIndex === mention.lineIndex &&
        item.kind === evidenceKindOf(mention.sourceType),
    );
    if (duplicate) return;
    group.evidence.push({
      id: `mention-${index}`,
      origin: 'mention',
      kind: evidenceKindOf(mention.sourceType),
      fileName: mention.fileName,
      pageNumber: mention.pageNumber,
      lineIndex: mention.lineIndex,
      lineText: mention.lineText,
      discarded: false,
    });
  });

  const allKeys = [...groups.keys()];

  return [...groups.values()]
    .map((group): ElementEvidenceLink => {
      const active = group.candidates.filter((candidate) => candidate.status !== 'discarded');
      const approved = active.filter((candidate) => candidate.status === 'approved');
      const approvable = active.filter(
        (candidate) =>
          candidate.status !== 'approved' && canApprovePdfIntakeCandidate(candidate).ok,
      );
      const partial = active.filter(
        (candidate) => candidate.status !== 'approved' && !canApprovePdfIntakeCandidate(candidate).ok,
      );

      const missing: ElementMissingKind[] = [];
      const hasKind = (kind: ElementEvidenceKind): boolean =>
        group.evidence.some((item) => item.kind === kind && !item.discarded);
      if (!hasKind('ubicacion_ejes')) missing.push('ubicacion');
      if (active.length === 0) missing.push('refuerzo');
      if (!hasKind('detalle_corte') && !hasKind('tabla_cuadro')) missing.push('detalle');

      const conflicts = detectConflicts(group.candidates);
      const derived = deriveStatus({
        conflicts,
        missing,
        activeCount: active.length,
        approvableCount: approvable.length,
        approvedCount: approved.length,
        partialCount: partial.length,
      });

      return {
        elementKey: group.elementKey,
        elementLabel: group.elementLabel,
        evidence: group.evidence,
        candidateIds: group.candidates.map((candidate) => candidate.id),
        activeCandidateIds: active.map((candidate) => candidate.id),
        approvableCandidateIds: approvable.map((candidate) => candidate.id),
        approvedCandidateIds: approved.map((candidate) => candidate.id),
        partialCandidateIds: partial.map((candidate) => candidate.id),
        conflicts,
        missing,
        similarElementKeys: findSimilarKeys(group.elementKey, allKeys),
        status: derived.status,
        statusReason: derived.statusReason,
      };
    })
    .sort((a, b) => a.elementKey.localeCompare(b.elementKey));
}

// ---------------------------------------------------------------------------
// Acciones de grupo (siempre iniciadas por el humano; puras)
// ---------------------------------------------------------------------------

/** Compuerta de aprobación de grupo: con conflicto o sin convertibles, no. */
export function canApproveElementGroup(link: ElementEvidenceLink): { ok: boolean; reason?: string } {
  if (link.conflicts.length > 0) {
    return {
      ok: false,
      reason:
        'Conflicto entre fuentes: verifica contra el plano y descarta la lectura incorrecta antes de aprobar el grupo.',
    };
  }
  if (link.approvableCandidateIds.length === 0) {
    return {
      ok: false,
      reason:
        link.approvedCandidateIds.length > 0
          ? 'No queda nada por aprobar en este grupo.'
          : 'No hay candidatos convertibles en este grupo: completa los datos faltantes (no se inventan cantidades).',
    };
  }
  return { ok: true };
}

/**
 * Aprueba SOLO los candidatos convertibles del grupo (los parciales y
 * descartados quedan intactos: aprobar un grupo jamás completa datos).
 */
export function approveElementGroup(
  link: ElementEvidenceLink,
  candidates: readonly PdfIntakeCandidate[],
): PdfIntakeCandidate[] {
  if (!canApproveElementGroup(link).ok) return [...candidates];
  const approvable = new Set(link.approvableCandidateIds);
  return candidates.map((candidate) =>
    approvable.has(candidate.id) ? { ...candidate, status: 'approved' } : candidate,
  );
}

/** Marca todos los candidatos vigentes del grupo como "requiere revisión". */
export function markElementGroupNeedsReview(
  link: ElementEvidenceLink,
  candidates: readonly PdfIntakeCandidate[],
): PdfIntakeCandidate[] {
  const active = new Set(link.activeCandidateIds);
  return candidates.map((candidate) =>
    active.has(candidate.id) && candidate.status !== 'discarded'
      ? { ...candidate, status: 'needs_review' }
      : candidate,
  );
}

// ---------------------------------------------------------------------------
// Puente a F3/F4A.2: la evidencia viaja con la línea manual hasta el Excel
// ---------------------------------------------------------------------------

/**
 * Evidencia de línea manual desde un candidato: fuente, página, tipo de
 * fuente, método, confianza y observación (elemento + regla de detección).
 * Nombres alineados con `ManualExcelLineEvidence` (F4A.2) para que las hojas
 * CONTROL_LECTURA/EVIDENCIAS/01_CANTIDADES la recojan sin puentes extra.
 */
export function manualLineEvidenceFromCandidate(candidate: PdfIntakeCandidate): ManualLineEvidence {
  const observationParts = [
    candidate.elementLabel ? `Elemento ${candidate.elementLabel}` : undefined,
    candidate.evidence.detectionReason,
    candidate.crossCheck === 'confirmed_by_ocr' ? 'Confirmado por OCR' : undefined,
  ].filter((part): part is string => Boolean(part));

  return {
    sourceFileName: candidate.evidence.fileName,
    pageNumber: candidate.evidence.pageNumber,
    sourceType: candidate.evidence.sourceType,
    readingMethod: candidateReadingMethod(candidate),
    confidence: candidate.confidenceScore,
    originalFragment: candidate.evidence.originalText,
    observation: observationParts.join(' · '),
  };
}

/**
 * Convierte candidatos APROBADOS y convertibles a INPUT de línea manual F3
 * CON su evidencia adjunta (F6E). Misma compuerta que F6A (aprobado +
 * f1Ready); F6E no calcula nada — F1 parsea/calcula al entrar al takeoff.
 */
export function approvedCandidatesToManualLines(
  candidates: readonly PdfIntakeCandidate[],
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  return candidates
    .filter((candidate) => candidate.status === 'approved' && candidate.f1Ready)
    .map((candidate) => ({
      originalDescription: candidate.candidateText,
      assumedWastePct,
      evidence: manualLineEvidenceFromCandidate(candidate),
    }));
}
