/**
 * drawing-element-registry.ts — Registro técnico de elementos (F7, puro).
 *
 * F6 solo reconocía códigos `PREFIJO-##` (VC-01, Z-01). Los planos reales
 * traen `VC-EJE-1`, `VC EJE 1`, `VIGA CIM 1`, `Z1`, `PILOTE Ø60`, `C-02`…
 * Este módulo amplía el reconocimiento y construye un registro único por
 * takeoff con alias CONSERVADORES:
 * - Variantes tipográficas del MISMO código (espacio/guion/puntos) se agrupan
 *   bajo una clave canónica y quedan como alias.
 * - Códigos DISTINTOS jamás se fusionan: `VC-1` y `VC-01` solo se AVISAN como
 *   similares (regla F6E: parecidos se avisan, no se fusionan).
 *
 * El registro clasifica evidencia por tipo de región y deriva estados de
 * revisión honestos (completo / falta_ubicacion / falta_refuerzo / conflicto /
 * requiere_revision). No calcula nada; no aprueba nada.
 */
import type { PageRegionType } from './drawing-page-regions';
import { normalizeDrawingText, type SpatialBBox, type SpatialTextMethod } from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Reconocimiento de menciones
// ---------------------------------------------------------------------------

export type ElementKind =
  | 'viga'
  | 'zapata'
  | 'columna'
  | 'pilote'
  | 'muro'
  | 'losa'
  | 'otro';

const ELEMENT_WORD_KIND: Record<string, ElementKind> = {
  VIGA: 'viga',
  VIGUETA: 'viga',
  ZAPATA: 'zapata',
  COLUMNA: 'columna',
  PILOTE: 'pilote',
  MURO: 'muro',
  PANTALLA: 'muro',
  LOSA: 'losa',
  PLACA: 'losa',
  DINTEL: 'otro',
  PEDESTAL: 'otro',
  CAISSON: 'pilote',
  RIOSTRA: 'viga',
  ESCALERA: 'otro',
  CIMIENTO: 'zapata',
};

const PREFIX_KIND: Record<string, ElementKind> = {
  VC: 'viga',
  V: 'viga',
  VG: 'viga',
  Z: 'zapata',
  ZC: 'zapata',
  C: 'columna',
  COL: 'columna',
  P: 'pilote',
  PIL: 'pilote',
  M: 'muro',
};

/** Mención de elemento reconocida en una línea. */
export interface ElementMentionMatch {
  /** Texto tal como aparece ("VC EJE 1", "PILOTE Ø60"). */
  rawLabel: string;
  /** Clave canónica de agrupación ("VC-EJE-1", "PILOTE-Ø60"). */
  elementKey: string;
  kind?: ElementKind;
}

interface MentionRule {
  id: string;
  pattern: RegExp;
  toMatch: (m: RegExpMatchArray) => ElementMentionMatch | undefined;
}

/** Canónico: mayúsculas, separadores (espacio/punto/guion) → guion único. */
function canonicalKey(raw: string): string {
  return normalizeDrawingText(raw)
    .replace(/[.\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function kindFromWord(word: string | undefined): ElementKind | undefined {
  if (!word) return undefined;
  return ELEMENT_WORD_KIND[normalizeDrawingText(word).replace(/S$/, '')];
}

function kindFromPrefix(prefix: string): ElementKind | undefined {
  return PREFIX_KIND[prefix.toUpperCase()];
}

/** Códigos de eje puros ("EJE A", "EJE 1"): ubicación, no elemento. */
const PURE_AXIS_PATTERN = /^EJES?[-\s][A-Z0-9]{1,3}$/;

const ELEMENT_WORDS_SOURCE = Object.keys(ELEMENT_WORD_KIND).join('|');

const MENTION_RULES: readonly MentionRule[] = [
  {
    // VC-EJE-1 · VC EJE A · V.C.-EJE-2 (código con EJE embebido)
    id: 'code_with_axis',
    pattern: /\b([A-ZÑ]{1,4}(?:\.[A-ZÑ]{1,4})*)[-.\s]+EJE[-.\s]+([A-Z0-9]{1,3})\b/g,
    toMatch: (m) => {
      const prefix = (m[1] ?? '').replace(/\./g, '');
      const axis = m[2] ?? '';
      if (!prefix || !axis) return undefined;
      return {
        rawLabel: m[0] ?? '',
        elementKey: `${prefix}-EJE-${axis}`,
        kind: kindFromPrefix(prefix),
      };
    },
  },
  {
    // VIGA CIM 1 · VIGA DE CIMENTACION 2 (palabra de elemento + calificador + número)
    id: 'word_qualifier_number',
    pattern: new RegExp(
      `\\b(${ELEMENT_WORDS_SOURCE})S?\\s+(CIM(?:ENTACION)?|DE\\s+CIMENTACION|AEREA?|AMARRE)\\s+(\\d{1,3})\\b`,
      'gi',
    ),
    toMatch: (m) => {
      const word = m[1] ?? '';
      const qualifier = (m[2] ?? '').replace(/\s+/g, '-');
      const num = m[3] ?? '';
      if (!word || !num) return undefined;
      return {
        rawLabel: m[0] ?? '',
        elementKey: canonicalKey(`${word} ${qualifier} ${num}`),
        kind: kindFromWord(word),
      };
    },
  },
  {
    // PILOTE Ø60 · PILOTES Ø 60 (elemento identificado por diámetro)
    id: 'word_diameter',
    pattern: new RegExp(`\\b(${ELEMENT_WORDS_SOURCE})S?\\s*[ØøΦφ⌀]\\s*(\\d{2,4})\\b`, 'gi'),
    toMatch: (m) => {
      const word = m[1] ?? '';
      const diameter = m[2] ?? '';
      if (!word || !diameter) return undefined;
      return {
        rawLabel: m[0] ?? '',
        elementKey: `${normalizeDrawingText(word).replace(/S$/, '')}-Ø${diameter}`,
        kind: kindFromWord(word),
      };
    },
  },
  {
    // ZAPATA Z1 · COLUMNA C2 · PILOTE P-03 · VC-01 · VC 01 · Z-1 · C-02A
    // (palabra opcional + código prefijo/número con separador -, ., espacio o pegado)
    id: 'word_code',
    pattern: new RegExp(
      `(?:\\b(${ELEMENT_WORDS_SOURCE})S?\\s+)?\\b([A-ZÑ]{1,4})[-.\\s]?(\\d{1,3})([A-Z]?)\\b`,
      'gi',
    ),
    toMatch: (m) => {
      const word = m[1];
      const prefix = (m[2] ?? '').toUpperCase();
      const digits = m[3] ?? '';
      const suffix = (m[4] ?? '').toUpperCase();
      if (!prefix || !digits) return undefined;
      const raw = (m[0] ?? '').trim();
      // Sin palabra de elemento, un código pegado tipo "Z1"/"C2" o un prefijo
      // de una letra es demasiado ambiguo (¿zona?, ¿nota?): solo se acepta
      // pegado/una letra cuando la palabra confirma (ZAPATA Z1). Los códigos
      // con separador y prefijo ≥2 letras (VC-01, VC 01) sí son elementos.
      const hasSeparator = /[-.\s]/.test(raw.replace(word ?? '', '').trim());
      if (!word && (!hasSeparator || prefix.length < 2)) return undefined;
      if (PURE_AXIS_PATTERN.test(canonicalKey(raw))) return undefined;
      if (prefix === 'EJE' || prefix === 'EJES') return undefined;
      return {
        rawLabel: raw,
        elementKey: `${prefix}-${digits}${suffix}`,
        kind: kindFromWord(word) ?? kindFromPrefix(prefix),
      };
    },
  },
];

/**
 * Extrae TODAS las menciones de elementos de una línea con la nomenclatura
 * ampliada F7. Los solapes los gana la regla más específica (orden del array).
 */
export function extractElementMentions(lineText: string): ElementMentionMatch[] {
  const normalized = normalizeDrawingText(lineText);
  const found: { start: number; end: number; match: ElementMentionMatch }[] = [];

  for (const rule of MENTION_RULES) {
    rule.pattern.lastIndex = 0;
    for (const m of normalized.matchAll(rule.pattern)) {
      const parsed = rule.toMatch(m);
      if (!parsed) continue;
      const start = m.index ?? 0;
      const end = start + (m[0]?.length ?? 0);
      if (found.some((prev) => start < prev.end && end > prev.start)) continue;
      found.push({ start, end, match: parsed });
    }
  }

  return found.sort((a, b) => a.start - b.start).map((entry) => entry.match);
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/** Mención con su origen (para trazabilidad completa). */
export interface ElementSourceMention {
  elementKey: string;
  rawLabel: string;
  sourceFileName?: string;
  pageNumber: number;
  lineId?: string;
  lineText: string;
  method: SpatialTextMethod;
  regionType?: PageRegionType;
  bbox?: SpatialBBox;
}

export type ElementReviewStatus =
  | 'completo'
  | 'falta_ubicacion'
  | 'falta_refuerzo'
  | 'conflicto'
  | 'requiere_revision';

export const ELEMENT_REVIEW_STATUS_LABEL: Record<ElementReviewStatus, string> = {
  completo: 'Evidencia completa',
  falta_ubicacion: 'Falta ubicacion',
  falta_refuerzo: 'Falta refuerzo',
  conflicto: 'Conflicto entre fuentes',
  requiere_revision: 'Requiere revision',
};

export interface ElementRecord {
  elementKey: string;
  /** Etiqueta más descriptiva vista. */
  displayLabel: string;
  kind?: ElementKind;
  /** Formas distintas vistas del mismo código (variantes tipográficas). */
  aliases: readonly string[];
  sourceMentions: readonly ElementSourceMention[];
  /** Tipos de región donde el elemento aparece (evidencia disponible). */
  evidenceTypes: readonly PageRegionType[];
  /** Qué evidencia falta, en lenguaje humano. */
  missingEvidence: readonly string[];
  /** Conflictos declarados por quien construye el registro (no se resuelven). */
  conflicts: readonly string[];
  /** Claves que PARECEN el mismo elemento (VC-1 vs VC-01): aviso, no fusión. */
  similarElementKeys: readonly string[];
  reviewStatus: ElementReviewStatus;
  reviewStatusReason: string;
}

const SIMILAR_KEY_PATTERN = /^([A-ZÑ]{1,4})-(\d{1,3})([A-Z]?)$/;

/** Claves numéricamente equivalentes pero escritas distinto (VC-1 vs VC-01). */
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
      (otherMatch[3] ?? '') === (suffix ?? '')
    );
  });
}

export interface BuildElementRegistryInput {
  mentions: readonly ElementSourceMention[];
  /** Claves de elementos con candidatos de acero vigentes (refuerzo). */
  keysWithSteelCandidates?: ReadonlySet<string>;
  /** Claves con conflicto declarado aguas arriba (F6C/F6E). */
  conflictsByKey?: ReadonlyMap<string, readonly string[]>;
  /** Claves con contexto de ubicación derivado de la grilla (F7B). */
  keysWithGridLocation?: ReadonlySet<string>;
}

const LOCATION_REGIONS: readonly PageRegionType[] = ['plan_grid'];
const REINFORCEMENT_REGIONS: readonly PageRegionType[] = ['reinforcement_callout', 'table', 'detail'];

/**
 * Construye el registro de elementos desde menciones ya extraídas. La
 * completitud se deriva de la evidencia disponible; nada se aprueba ni se
 * inventa: un elemento sin refuerzo queda `falta_refuerzo` con razón.
 */
export function buildElementRegistry(input: BuildElementRegistryInput): ElementRecord[] {
  const groups = new Map<string, ElementSourceMention[]>();
  for (const mention of input.mentions) {
    const list = groups.get(mention.elementKey) ?? [];
    list.push(mention);
    groups.set(mention.elementKey, list);
  }

  const allKeys = [...groups.keys()];

  return allKeys
    .map((elementKey): ElementRecord => {
      const mentions = groups.get(elementKey)!;
      const aliases = [...new Set(mentions.map((m) => normalizeDrawingText(m.rawLabel)))];
      const displayLabel = aliases.reduce((best, alias) => (alias.length > best.length ? alias : best), aliases[0] ?? elementKey);
      const kinds = new Set(
        mentions
          .map((m) => extractElementMentions(m.rawLabel).find((e) => e.elementKey === elementKey)?.kind)
          .filter((k): k is ElementKind => k !== undefined),
      );
      const evidenceTypes = [...new Set(
        mentions.map((m) => m.regionType).filter((r): r is PageRegionType => r !== undefined),
      )];

      const hasGridLocation = input.keysWithGridLocation?.has(elementKey) ?? false;
      // Mención textual de eje = "EJE(S) <etiqueta>" con espacio: el EJE
      // embebido en el propio código (VC-EJE-1) NO es evidencia de ubicación.
      const hasLocationEvidence =
        hasGridLocation ||
        evidenceTypes.some((r) => LOCATION_REGIONS.includes(r)) ||
        mentions.some((m) => /\bEJES?\s+[A-Z0-9]{1,3}\b/.test(normalizeDrawingText(m.lineText)));
      const hasSteel = input.keysWithSteelCandidates?.has(elementKey) ?? false;
      const hasReinforcementEvidence =
        hasSteel || evidenceTypes.some((r) => REINFORCEMENT_REGIONS.includes(r));

      const missingEvidence: string[] = [];
      if (!hasLocationEvidence) {
        missingEvidence.push(
          'Ubicacion: el elemento no aparece en planta/grilla ni junto a un eje; vincula la fuente de ubicacion.',
        );
      }
      if (!hasReinforcementEvidence) {
        missingEvidence.push(
          'Refuerzo: no hay despiece, tabla ni candidato de acero asociado a este elemento.',
        );
      }

      const conflicts = [...(input.conflictsByKey?.get(elementKey) ?? [])];
      if (kinds.size > 1) {
        conflicts.push(
          `El mismo codigo aparece como ${[...kinds].join(' y ')}: verificar si son elementos distintos con codigo repetido.`,
        );
      }

      let reviewStatus: ElementReviewStatus;
      let reviewStatusReason: string;
      if (conflicts.length > 0) {
        reviewStatus = 'conflicto';
        reviewStatusReason = conflicts[0]!;
      } else if (!hasReinforcementEvidence) {
        reviewStatus = 'falta_refuerzo';
        reviewStatusReason = 'Sin evidencia de refuerzo (despiece/tabla/candidato).';
      } else if (!hasLocationEvidence) {
        reviewStatus = 'falta_ubicacion';
        reviewStatusReason = 'Con refuerzo pero sin evidencia de ubicacion (planta/ejes).';
      } else if (mentions.every((m) => m.method === 'ocr')) {
        reviewStatus = 'requiere_revision';
        reviewStatusReason = 'Toda la evidencia proviene de OCR: verificar contra el plano original.';
      } else {
        reviewStatus = 'completo';
        reviewStatusReason = 'Evidencia de ubicacion y refuerzo presente. La aprobacion sigue siendo humana.';
      }

      return {
        elementKey,
        displayLabel,
        kind: kinds.size === 1 ? [...kinds][0] : undefined,
        aliases,
        sourceMentions: mentions,
        evidenceTypes,
        missingEvidence,
        conflicts,
        similarElementKeys: findSimilarKeys(elementKey, allKeys),
        reviewStatus,
        reviewStatusReason,
      };
    })
    .sort((a, b) => a.elementKey.localeCompare(b.elementKey));
}
