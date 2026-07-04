/**
 * pdf-plan-set.ts — Paquete de planos fuente del takeoff (F6B, puro).
 *
 * Un takeoff real se alimenta de VARIOS planos: planta de cimentación
 * (ubicación por ejes), cuadros (dimensiones/refuerzo), despieces (acero) y
 * cortes/detalles (recubrimientos/ganchos). Este módulo organiza esa
 * evidencia SIN inventar relaciones entre planos:
 * - Las menciones de un elemento en una planta/cuadro son EVIDENCIA de
 *   ubicación/detalle, no cantidades.
 * - La agrupación por elemento es un pareo TEXTUAL por código (VC-01 = VC-01),
 *   presentado como sugerencia; los candidatos siguen separados por fuente y
 *   la unión definitiva la decide el humano.
 * - Si falta una fuente (ubicación o refuerzo), se dice explícitamente.
 */
import {
  detectPdfIntakeCandidatesFromPages,
  extractElementMentionsFromLine,
  type PdfIntakeCandidate,
} from './pdf-intake-candidates';
import type { PlanSourceType } from './pdf-text-extract';

/** Referencia mínima a una fuente del plan set. */
export interface PlanSourceRef {
  fileName?: string;
  pageNumber: number;
  sourceType?: PlanSourceType;
}

/**
 * Mención de un elemento en una página (línea que trae el código del elemento
 * pero puede no traer acero). Es evidencia de ubicación/contexto — jamás una
 * cantidad.
 */
export interface ElementMention extends PlanSourceRef {
  elementLabel: string;
  lineText: string;
  lineIndex: number;
}

/**
 * Recorre las páginas del plan set y recoge menciones de elementos línea a
 * línea. No filtra por tipo de fuente: quien resume decide qué significa cada
 * mención según el tipo de la página donde apareció.
 */
export function collectElementMentions(
  pages: readonly { pageNumber: number; text: string; sourceType?: PlanSourceType }[],
  options: { fileName?: string } = {},
): ElementMention[] {
  const mentions: ElementMention[] = [];
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    lines.forEach((line, lineIndex) => {
      if (line.trim().length === 0) return;
      for (const elementLabel of extractElementMentionsFromLine(line)) {
        mentions.push({
          elementLabel,
          lineText: line.trim(),
          lineIndex,
          pageNumber: page.pageNumber,
          fileName: options.fileName,
          sourceType: page.sourceType,
        });
      }
    });
  }
  return mentions;
}

/** Clave de agrupación textual: solo el CÓDIGO del elemento (VC-01), sin la palabra. */
export function elementGroupKey(elementLabel: string): string {
  const code = elementLabel.match(/[A-Z]{1,4}-\d{1,3}[A-Z]?/);
  return (code ? code[0] : elementLabel).toUpperCase().trim();
}

export interface ElementEvidenceGroup {
  /** Código normalizado que agrupa (pareo textual, no relación inventada). */
  elementKey: string;
  /** Etiqueta más descriptiva vista (p. ej. "PILOTE P-03" sobre "P-03"). */
  elementLabel: string;
  /** Ids de candidatos de acero asociados por código. */
  candidateIds: string[];
  /** Fuentes que aportaron candidatos de acero (despieces, tablas…). */
  steelSources: PlanSourceRef[];
  /** Fuentes de ubicación/ejes donde el elemento aparece mencionado. */
  locationSources: PlanSourceRef[];
  /** Fuentes de detalle/corte o tabla/cuadro donde aparece mencionado. */
  detailSources: PlanSourceRef[];
  /** Qué falta para considerar la evidencia completa — copy honesto. */
  missingHints: string[];
}

const HINT_NEEDS_LOCATION =
  'Requiere vincular fuente de ubicacion (planta/ejes): el acero aparece sin ubicacion confirmada.';
const HINT_NEEDS_STEEL =
  'Requiere fuente de refuerzo/despiece: el elemento aparece ubicado pero sin acero detectado.';

function refKey(ref: PlanSourceRef): string {
  return `${ref.fileName ?? ''}·${ref.pageNumber}·${ref.sourceType ?? ''}`;
}

function pushUniqueRef(list: PlanSourceRef[], ref: PlanSourceRef): void {
  if (!list.some((existing) => refKey(existing) === refKey(ref))) list.push(ref);
}

/**
 * Agrupa la evidencia por elemento (pareo textual por código) y deriva los
 * estados honestos "requiere vincular fuente de ubicación" / "requiere fuente
 * de refuerzo". Los candidatos NUNCA se fusionan aquí: siguen siendo filas
 * separadas por fuente; esto es un resumen para revisión humana.
 */
export function summarizeElementEvidence(
  candidates: readonly PdfIntakeCandidate[],
  mentions: readonly ElementMention[] = [],
): ElementEvidenceGroup[] {
  const groups = new Map<string, ElementEvidenceGroup>();

  const getGroup = (label: string): ElementEvidenceGroup => {
    const key = elementGroupKey(label);
    let group = groups.get(key);
    if (!group) {
      group = {
        elementKey: key,
        elementLabel: label,
        candidateIds: [],
        steelSources: [],
        locationSources: [],
        detailSources: [],
        missingHints: [],
      };
      groups.set(key, group);
    }
    if (label.length > group.elementLabel.length) group.elementLabel = label;
    return group;
  };

  for (const candidate of candidates) {
    if (!candidate.elementLabel) continue;
    const group = getGroup(candidate.elementLabel);
    group.candidateIds.push(candidate.id);
    const ref: PlanSourceRef = {
      fileName: candidate.evidence.fileName,
      pageNumber: candidate.evidence.pageNumber,
      sourceType: candidate.evidence.sourceType,
    };
    if (candidate.evidence.sourceType === 'ubicacion_ejes') {
      pushUniqueRef(group.locationSources, ref);
    } else {
      pushUniqueRef(group.steelSources, ref);
    }
  }

  for (const mention of mentions) {
    const group = getGroup(mention.elementLabel);
    const ref: PlanSourceRef = {
      fileName: mention.fileName,
      pageNumber: mention.pageNumber,
      sourceType: mention.sourceType,
    };
    if (mention.sourceType === 'ubicacion_ejes') {
      pushUniqueRef(group.locationSources, ref);
    } else if (mention.sourceType === 'detalle_corte' || mention.sourceType === 'tabla_cuadro') {
      pushUniqueRef(group.detailSources, ref);
    }
    // Menciones en despiece/notas/otro sin candidato no crean evidencia de
    // acero: una mención no es una cantidad (no se inventa).
  }

  for (const group of groups.values()) {
    if (group.steelSources.length > 0 && group.locationSources.length === 0) {
      group.missingHints.push(HINT_NEEDS_LOCATION);
    }
    if (group.steelSources.length === 0) {
      group.missingHints.push(HINT_NEEDS_STEEL);
    }
  }

  return [...groups.values()].sort((a, b) => a.elementKey.localeCompare(b.elementKey));
}

// ---------------------------------------------------------------------------
// Detección sobre el plan set completo
// ---------------------------------------------------------------------------

export interface PlanSetPageInput {
  pageNumber: number;
  text: string;
  sourceType?: PlanSourceType;
  /** ¿La página participa en la detección de candidatos? */
  included: boolean;
}

export interface PlanSetSourceInput {
  fileName: string;
  pages: readonly PlanSetPageInput[];
}

/**
 * Corre el detector F6A sobre todas las páginas incluidas de todas las
 * fuentes, con ids únicos por fuente, y recoge menciones de elementos de
 * TODAS las páginas con texto (una planta no incluida para detección sigue
 * siendo evidencia de ubicación). No calcula nada; no une planos.
 */
export function detectPlanSetCandidates(sources: readonly PlanSetSourceInput[]): {
  candidates: PdfIntakeCandidate[];
  mentions: ElementMention[];
} {
  const candidates = sources.flatMap((source, index) =>
    detectPdfIntakeCandidatesFromPages(
      source.pages.filter((page) => page.included && page.text.trim().length > 0),
      { fileName: source.fileName },
    ).map((candidate) => ({ ...candidate, id: `src${index + 1}-${candidate.id}` })),
  );

  const mentions = sources.flatMap((source) =>
    collectElementMentions(
      source.pages.filter((page) => page.text.trim().length > 0),
      { fileName: source.fileName },
    ),
  );

  return { candidates, mentions };
}
