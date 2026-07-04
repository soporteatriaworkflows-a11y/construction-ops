/**
 * pdf-intake-candidates.ts — Detector puro de candidatos de acero desde
 * texto pegado de PDF/plano (F6A preview).
 *
 * Contrato (docs/STEEL_OPS_F6_PDF_INTAKE_BLUEPRINT.md):
 * - Asistente de lectura: propone candidatos revisables, nunca cantidades
 *   aprobadas (F6-S3) ni totales agregados (F6-S8).
 * - No inventa: longitud/cantidad/varilla faltante se reporta como campo
 *   faltante con explicación, jamás se completa (F6-S1).
 * - Evidencia inmutable: texto original, línea, razón de detección (F6-S5).
 * - Sin calculadora propia: la conversión entrega INPUT de F3
 *   (`ManualLineRecord` sin id) y el dominio F1 hace parser/cálculo.
 */
import { parseSteelDescription, toDecimal } from '@/modules/steel';
import type { ManualLineRecord } from './manual-takeoff';

export type PdfIntakeConfidenceLevel =
  | 'high'
  | 'medium'
  | 'low'
  | 'needs_review'
  | 'not_interpretable';

export type PdfIntakeCandidateStatus = 'pending' | 'approved' | 'discarded' | 'needs_review';

export type PdfIntakeFieldKey = 'quantity' | 'barNumber' | 'length' | 'spacing' | 'element';

/** Evidencia inmutable de dónde salió el candidato (F6-S4/F6-S5). */
export interface PdfIntakeEvidence {
  /** Fragmento exacto detectado en el texto fuente. */
  readonly originalText: string;
  /** Línea completa de la que salió el fragmento. */
  readonly lineText: string;
  /** Índice 0-based de la línea dentro del texto pegado. */
  readonly lineIndex: number;
  /** Página mock declarada por el usuario. */
  readonly pageNumber: number;
  /** Regla de detección que produjo el candidato, en lenguaje humano. */
  readonly detectionReason: string;
}

export interface PdfIntakeCandidate {
  id: string;
  evidence: PdfIntakeEvidence;
  /** Texto canónico editable que se enviaría a F1/F3 (parte del fragmento). */
  candidateText: string;
  /** Elemento/ubicación detectado en la misma línea (VC-01, PILOTE P-03…). */
  elementLabel?: string;
  detectedFields: readonly PdfIntakeFieldKey[];
  missingFields: readonly PdfIntakeFieldKey[];
  warnings: readonly string[];
  suggestedInterpretation: string;
  confidenceLevel: PdfIntakeConfidenceLevel;
  /** Score 0–1 como string decimal (paridad F1). */
  confidenceScore: string;
  confidenceReason: string;
  /** true solo si `candidateText` es parseable por F1 sin datos faltantes. */
  f1Ready: boolean;
  status: PdfIntakeCandidateStatus;
}

export interface PdfIntakeDetectOptions {
  pageNumber?: number;
  fileName?: string;
}

// ---------------------------------------------------------------------------
// Reglas de detección (orden = prioridad; los solapes los gana la primera)
// ---------------------------------------------------------------------------

type RuleId =
  | 'encoded'
  | 'explicit_length'
  | 'segmented'
  | 'natural'
  | 'natural_no_qty'
  | 'spacing_spec'
  | 'bar_mention'
  | 'mesh'
  | 'spacing_orphan';

interface RawMatch {
  rule: RuleId;
  start: number;
  end: number;
  text: string;
  groups: RegExpMatchArray;
}

const RULE_PATTERNS: readonly { rule: RuleId; pattern: RegExp; reason: string }[] = [
  {
    rule: 'encoded',
    // 5#5600 · 74E#3200 · 2X65E#3182 · 10#7205 @ 15CM
    pattern: /(?:\d+\s*[xX]\s*)?\d+\s*E?\s*#\s*\d{2,5}(?:\s*@\s*\d+(?:[.,]\d+)?\s*CM)?/gi,
    reason: 'Notacion compacta de despiece (cantidad[E]#varilla+longitud)',
  },
  {
    rule: 'explicit_length',
    // #4 L=0.62 · COLUMNA C-02 #5 L=2.40 (el fragmento arranca en #)
    pattern: /#\s*\d{1,2}\s*[^#\n]{0,20}?\bL\s*=\s*\d+(?:[.,]\d+)?(?:\s*(?:CM|MTS?|M))?/gi,
    reason: 'Varilla con longitud explicita L=',
  },
  {
    rule: 'segmented',
    // 15 + 35 + 15 · 15 + 35 + 15 = 65 cm
    pattern:
      /\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)+(?:\s*=\s*(\d+(?:[.,]\d+)?))?(?:\s*(cm|mts?|m)\b)?/gi,
    reason: 'Suma de segmentos de doblez/tramo',
  },
  {
    rule: 'natural',
    // 240 varillas #4 de 62 cm · 12 estribos #3 de 1.82 m
    pattern:
      /(\d+)\s+(varillas?|barras?|estribos?|flejes?|ganchos?)\s+(?:[a-záéíóúñ]+\s+)*#\s*(\d{1,2})\s*(?:de|x|×)\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|mts?|m)?\b/gi,
    reason: 'Despiece en lenguaje natural (cantidad + #varilla + longitud)',
  },
  {
    rule: 'natural_no_qty',
    // varillas #4 de 62 cm (sin cantidad al frente): parcial honesto
    pattern:
      /(?:varillas?|barras?|estribos?|flejes?|ganchos?)\s+(?:[a-záéíóúñ]+\s+)*#\s*(\d{1,2})\s*(?:de|x|×)\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|mts?|m)?\b/gi,
    reason: 'Varilla con longitud pero sin cantidad',
  },
  {
    rule: 'spacing_spec',
    // #3 @ 0.15 · Estribos #3 @15 · E#3 cada 15 cm
    pattern:
      /(?:\b(?:estribos?|flejes?|E)\s*)?#\s*(\d{1,2})\s*(?:@|cada)\s*(\d+(?:[.,]\d+)?)\s*(cm|mts?|m)?\b/gi,
    reason: 'Especificacion de separacion sin luz ni cantidad',
  },
  {
    rule: 'bar_mention',
    // barras longitudinales #5 · refuerzo #4 (sin datos de cantidad/longitud)
    pattern:
      /(?:varillas?|barras?|estribos?|refuerzos?|flejes?|ganchos?|bastones?)(?:\s+[a-záéíóúñ]+)*\s*#\s*\d{1,2}\b(?!\s*(?:@|cada|de\s*\d|[xX×]\s*\d|L\s*=|\d))/gi,
    reason: 'Mencion de varilla sin cantidad ni longitud',
  },
  {
    rule: 'mesh',
    // malla electrosoldada (con o sin referencia)
    pattern: /mallas?\s+electrosoldadas?(?:\s+[A-Z0-9.\-x×]{2,12})?/gi,
    reason: 'Mencion de malla electrosoldada',
  },
  {
    rule: 'spacing_orphan',
    // @15CM suelto: hay algo con forma de separacion, sin estructura
    pattern: /@\s*\d+(?:[.,]\d+)?\s*(?:cm|mts?|m)?\b/gi,
    reason: 'Separacion suelta sin varilla asociada',
  },
];

const RULE_REASON: Record<RuleId, string> = Object.fromEntries(
  RULE_PATTERNS.map((entry) => [entry.rule, entry.reason]),
) as Record<RuleId, string>;

// Palabras de elemento estructural reconocidas para el prefijo del código.
const ELEMENT_WORDS = new Set([
  'zapata',
  'viga',
  'vigueta',
  'columna',
  'pilote',
  'muro',
  'losa',
  'pantalla',
  'dintel',
  'pedestal',
  'caisson',
  'riostra',
  'escalera',
  'placa',
  'cimiento',
]);

// Código de elemento en mayúsculas: VC-01, P-03, Z-1, C-02A…
const ELEMENT_CODE_PATTERN = /(?:\b([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,12})\s+)?\b([A-Z]{1,4}-\d{1,3}[A-Z]?)\b/;

// Mezclas letra/dígito típicas de mala lectura (O/0, l/1, I/1).
const OCR_SUSPECT_PATTERN = /\d[OoIl]|[OoIl]\d/;

const MISSING_FIELD_LABEL: Record<PdfIntakeFieldKey, string> = {
  quantity: 'cantidad',
  barNumber: 'numero de varilla',
  length: 'longitud',
  spacing: 'separacion',
  element: 'elemento',
};

// ---------------------------------------------------------------------------
// Evaluación por regla → núcleo del candidato (sin id/evidencia)
// ---------------------------------------------------------------------------

interface EvaluationCore {
  candidateText: string;
  detectedFields: PdfIntakeFieldKey[];
  missingFields: PdfIntakeFieldKey[];
  warnings: string[];
  suggestedInterpretation: string;
  confidenceLevel: PdfIntakeConfidenceLevel;
  confidenceScore: string;
  confidenceReason: string;
  f1Ready: boolean;
  status: PdfIntakeCandidateStatus;
}

function notInterpretableCore(candidateText: string, reason: string): EvaluationCore {
  return {
    candidateText,
    detectedFields: [],
    missingFields: ['quantity', 'barNumber', 'length'],
    warnings: [],
    suggestedInterpretation:
      'No hay informacion suficiente para cantidad automatica; se requiere seleccion, calibracion o revision manual.',
    confidenceLevel: 'not_interpretable',
    confidenceScore: '0',
    confidenceReason: reason,
    f1Ready: false,
    status: 'needs_review',
  };
}

/** Fragmentos que F1 parsea directo (notacion compacta / L= / segmentos). */
function evaluateF1Fragment(fragment: string): EvaluationCore {
  const parsed = parseSteelDescription(fragment);
  if (parsed.steelFamily === 'other') {
    return notInterpretableCore(fragment, parsed.explanation);
  }

  if (parsed.barNumber !== undefined && (parsed.barNumber < 2 || parsed.barNumber > 18)) {
    return {
      ...notInterpretableCore(fragment, `Numero de varilla #${parsed.barNumber} fuera del rango soportado (#2–#18).`),
      detectedFields: ['barNumber'],
      confidenceLevel: 'needs_review',
      confidenceScore: '0.2',
      suggestedInterpretation: `F1 leyo varilla #${parsed.barNumber}, que no existe en el catalogo #2–#18: revisa el texto original.`,
    };
  }

  if (parsed.cutLengthM !== undefined && toDecimal(parsed.cutLengthM).lte(0)) {
    return {
      ...notInterpretableCore(fragment, 'Longitud derivada cero o negativa.'),
      confidenceLevel: 'needs_review',
      confidenceScore: '0.2',
      suggestedInterpretation: `F1 derivo una longitud no valida (${parsed.cutLengthM} m): revisa el texto original.`,
    };
  }

  const score = Number(parsed.confidenceScore);
  const detected: PdfIntakeFieldKey[] = [];
  if (parsed.barNumber !== undefined) detected.push('barNumber');
  if (parsed.cutLengthM !== undefined) detected.push('length');
  if (parsed.lengthSource === 'encoded_cm') detected.push('quantity');
  if (parsed.spacingCm !== undefined) detected.push('spacing');

  const missing: PdfIntakeFieldKey[] = [];
  const warnings: string[] = [];
  if (parsed.barNumber === undefined) {
    missing.push('barNumber');
    warnings.push(
      'Sin numero de varilla: F1 calcula la longitud pero no el peso; asigna la varilla manual al convertir.',
    );
  }

  if (parsed.needsReview) {
    return {
      candidateText: fragment,
      detectedFields: detected,
      missingFields: missing,
      warnings,
      suggestedInterpretation: parsed.explanation,
      confidenceLevel: 'medium',
      confidenceScore: parsed.confidenceScore,
      confidenceReason:
        'Patron F1 reconocido, pero el propio parser pide revision (separacion/convencion).',
      f1Ready: true,
      status: 'needs_review',
    };
  }

  if (missing.length > 0) {
    return {
      candidateText: fragment,
      detectedFields: detected,
      missingFields: missing,
      warnings,
      suggestedInterpretation: parsed.explanation,
      confidenceLevel: 'medium',
      confidenceScore: score > 0.75 ? '0.75' : parsed.confidenceScore,
      confidenceReason: 'Longitud valida pero falta el numero de varilla.',
      f1Ready: true,
      status: 'needs_review',
    };
  }

  if (score >= 0.85) {
    return {
      candidateText: fragment,
      detectedFields: detected,
      missingFields: missing,
      warnings,
      suggestedInterpretation: parsed.explanation,
      confidenceLevel: 'high',
      confidenceScore: parsed.confidenceScore,
      confidenceReason: 'Patron F1 completo con varilla y longitud explicitas.',
      f1Ready: true,
      status: 'pending',
    };
  }

  return {
    candidateText: fragment,
    detectedFields: detected,
    missingFields: missing,
    warnings,
    suggestedInterpretation: parsed.explanation,
    confidenceLevel: 'medium',
    confidenceScore: parsed.confidenceScore,
    confidenceReason: 'Patron F1 reconocido con convencion compacta (asuncion de unidad cm).',
    f1Ready: true,
    status: 'pending',
  };
}

function evaluateSegmented(match: RegExpMatchArray): EvaluationCore {
  const fragment = match[0] ?? '';
  const statedTotal = match[1];
  const unit = match[2]?.toLowerCase();

  // Texto canónico = solo los segmentos (F1 no acepta "= total" ni unidad).
  const canonical = fragment
    .replace(/\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|mts?|m)?\s*$/i, '')
    .replace(/\s*(?:cm|mts?|m)\s*$/i, '')
    .trim();

  if (unit && unit !== 'cm') {
    const core = notInterpretableCore(canonical, RULE_REASON.segmented);
    return {
      ...core,
      candidateText: canonical,
      detectedFields: ['length'],
      missingFields: ['barNumber'],
      confidenceLevel: 'needs_review',
      confidenceScore: '0.3',
      confidenceReason:
        'Los segmentos parecen estar en metros; F1 interpreta segmentos en cm. Revisa las unidades antes de convertir.',
      warnings: ['Unidad declarada distinta de cm: no se convierte sin revision.'],
      suggestedInterpretation: `Vi segmentos ${canonical}, pero la unidad declarada (${unit}) no es la convencion cm de F1.`,
      f1Ready: false,
      status: 'needs_review',
    };
  }

  const core = evaluateF1Fragment(canonical);
  if (!core.f1Ready) return core;

  if (statedTotal) {
    const sumCm = canonical
      .split('+')
      .reduce((acc, segment) => acc.plus(toDecimal(segment.trim().replace(',', '.'))), toDecimal('0'));
    const stated = toDecimal(statedTotal.replace(',', '.'));
    if (!sumCm.eq(stated)) {
      return {
        ...core,
        warnings: [
          ...core.warnings,
          `El total declarado (${statedTotal}) no coincide con la suma de segmentos (${sumCm.toString()}); no se corrige automaticamente.`,
        ],
        confidenceLevel: 'needs_review',
        confidenceScore: '0.4',
        confidenceReason: 'Contradiccion interna entre segmentos y total declarado.',
        status: 'needs_review',
      };
    }
    return {
      ...core,
      suggestedInterpretation: `${core.suggestedInterpretation} El total declarado (${statedTotal} cm) coincide con la suma.`,
    };
  }

  return core;
}

function evaluateNatural(match: RegExpMatchArray): EvaluationCore {
  const fragment = match[0] ?? '';
  const quantityToken = match[1] ?? '';
  const kindWord = (match[2] ?? '').toLowerCase();
  const barToken = match[3] ?? '';
  const lengthToken = (match[4] ?? '').replace(',', '.');
  const unit = match[5]?.toLowerCase();

  const barNumber = Number(barToken);
  const quantity = Number(quantityToken);
  const isStirrup = kindWord.startsWith('estribo') || kindWord.startsWith('fleje');
  const detected: PdfIntakeFieldKey[] = ['quantity', 'barNumber', 'length'];

  if (barNumber < 2 || barNumber > 18) {
    return {
      ...notInterpretableCore(fragment, RULE_REASON.natural),
      detectedFields: detected,
      missingFields: [],
      confidenceLevel: 'needs_review',
      confidenceScore: '0.2',
      confidenceReason: `Numero de varilla #${barNumber} fuera del rango soportado (#2–#18).`,
      suggestedInterpretation: `Vi ${quantity} ${kindWord} #${barNumber}, pero #${barNumber} no es una varilla valida.`,
      status: 'needs_review',
    };
  }

  const warnings: string[] = [];
  let unitAssumed = false;
  let lengthCm = toDecimal(lengthToken);
  if (unit === 'm' || unit === 'mt' || unit === 'mts') {
    lengthCm = lengthCm.times(100);
  } else if (unit === 'mm') {
    lengthCm = lengthCm.div(10);
  } else if (!unit) {
    unitAssumed = true;
    warnings.push('Unidad de longitud no indicada: asumi centimetros. Verifica contra el plano.');
  }

  if (!lengthCm.isInteger() || lengthCm.lte(0)) {
    return {
      candidateText: fragment,
      detectedFields: detected,
      missingFields: [],
      warnings: [
        ...warnings,
        'La longitud no es un numero entero de cm: no es transferible a notacion compacta. Digita la linea en el formulario manual.',
      ],
      suggestedInterpretation: `Vi ${quantity} ${isStirrup ? 'estribos' : 'barras'} #${barNumber} de ${lengthToken} ${unit ?? 'cm'}, pero no puedo normalizarla sin perder precision.`,
      confidenceLevel: 'needs_review',
      confidenceScore: '0.4',
      confidenceReason: 'Longitud con decimales de cm: requiere digitacion manual.',
      f1Ready: false,
      status: 'needs_review',
    };
  }

  const canonical = `${quantity}${isStirrup ? 'E' : ''}#${barNumber}${lengthCm.toString()}`;
  const parsed = parseSteelDescription(canonical);
  const roundTripOk =
    parsed.steelFamily === 'rebar' &&
    parsed.barNumber === barNumber &&
    parsed.quantityPerUnit === String(quantity) &&
    parsed.cutLengthM !== undefined &&
    toDecimal(parsed.cutLengthM).eq(lengthCm.div(100)) &&
    (parsed.steelShape === 'stirrup') === isStirrup;

  if (!roundTripOk) {
    return {
      candidateText: fragment,
      detectedFields: detected,
      missingFields: [],
      warnings: [
        ...warnings,
        'La verificacion de ida y vuelta contra F1 fallo: no se propone conversion automatica.',
      ],
      suggestedInterpretation: `Vi ${quantity} ${isStirrup ? 'estribos' : 'barras'} #${barNumber} de ${lengthCm.toString()} cm, pero F1 no reproduce la misma lectura.`,
      confidenceLevel: 'needs_review',
      confidenceScore: '0.4',
      confidenceReason: 'Normalizacion no verificable contra el parser F1.',
      f1Ready: false,
      status: 'needs_review',
    };
  }

  return {
    candidateText: canonical,
    detectedFields: detected,
    missingFields: [],
    warnings,
    suggestedInterpretation: `${parsed.explanation} Normalizado desde lenguaje natural ("${fragment.trim()}") y verificado ida y vuelta contra F1.`,
    confidenceLevel: 'medium',
    confidenceScore: parsed.confidenceScore,
    confidenceReason: unitAssumed
      ? 'Lenguaje natural normalizado a notacion F1, con unidad asumida (cm).'
      : 'Lenguaje natural normalizado a notacion F1 y verificado.',
    f1Ready: true,
    status: unitAssumed ? 'needs_review' : 'pending',
  };
}

function evaluateNaturalNoQuantity(match: RegExpMatchArray): EvaluationCore {
  const fragment = (match[0] ?? '').trim();
  const barToken = match[1] ?? '?';
  const lengthToken = match[2] ?? '';
  const unit = match[3]?.toLowerCase();

  return {
    candidateText: fragment,
    detectedFields: ['barNumber', 'length'],
    missingFields: ['quantity'],
    warnings: [],
    suggestedInterpretation: `Vi varilla #${barToken} de ${lengthToken}${unit ? ` ${unit}` : ' (unidad no indicada)'} sin cantidad: candidato parcial, no se inventa la cantidad.`,
    confidenceLevel: 'needs_review',
    confidenceScore: '0.5',
    confidenceReason: 'Varilla y longitud detectadas, pero falta la cantidad.',
    f1Ready: false,
    status: 'needs_review',
  };
}

function evaluateSpacingSpec(match: RegExpMatchArray): EvaluationCore {
  const fragment = match[0] ?? '';
  const barToken = match[1] ?? '';
  const spacingToken = match[2] ?? '';
  const unit = match[3]?.toLowerCase();

  return {
    candidateText: fragment.trim(),
    detectedFields: ['barNumber', 'spacing'],
    missingFields: ['quantity', 'length'],
    warnings: [],
    suggestedInterpretation: `Vi refuerzo #${barToken} cada ${spacingToken}${unit ? ` ${unit}` : ' (unidad no indicada)'}; falta la luz a cubrir y la cantidad, asi que no derivo cantidad automatica.`,
    confidenceLevel: 'needs_review',
    confidenceScore: '0.4',
    confidenceReason: 'Separacion detectada sin luz ni cantidad: completar antes de convertir.',
    f1Ready: false,
    status: 'needs_review',
  };
}

function evaluateBarMention(match: RegExpMatchArray): EvaluationCore {
  const fragment = (match[0] ?? '').trim();
  const barToken = fragment.match(/#\s*(\d{1,2})/)?.[1] ?? '?';

  return {
    candidateText: fragment,
    detectedFields: ['barNumber'],
    missingFields: ['quantity', 'length'],
    warnings: [],
    suggestedInterpretation: `Vi mencion de varilla #${barToken} sin cantidad ni longitud: candidato parcial, no se inventa nada.`,
    confidenceLevel: 'needs_review',
    confidenceScore: '0.3',
    confidenceReason: 'Solo se detecto el diametro: faltan cantidad y longitud.',
    f1Ready: false,
    status: 'needs_review',
  };
}

function evaluateMesh(match: RegExpMatchArray): EvaluationCore {
  const fragment = (match[0] ?? '').trim();

  return {
    candidateText: fragment,
    detectedFields: [],
    missingFields: ['quantity', 'length'],
    warnings: ['Malla electrosoldada: el calculo de mallas no esta soportado por F1 en esta fase.'],
    suggestedInterpretation: `Vi "${fragment}". Registro la mencion como referencia; dimensiones y cantidad deben revisarse manualmente.`,
    confidenceLevel: 'low',
    confidenceScore: '0.3',
    confidenceReason: 'Malla detectada por texto, sin datos completos.',
    f1Ready: false,
    status: 'needs_review',
  };
}

function evaluateSpacingOrphan(match: RegExpMatchArray): EvaluationCore {
  const fragment = (match[0] ?? '').trim();
  const core = notInterpretableCore(fragment, RULE_REASON.spacing_orphan);
  return {
    ...core,
    detectedFields: ['spacing'],
    missingFields: ['barNumber', 'quantity', 'length'],
    confidenceReason:
      'Hay una separacion suelta sin varilla, cantidad ni luz: F1 no puede derivar cantidad ni longitud.',
  };
}

function evaluateMatch(raw: RawMatch): EvaluationCore {
  switch (raw.rule) {
    case 'encoded':
    case 'explicit_length':
      return evaluateF1Fragment(raw.text.trim());
    case 'segmented':
      return evaluateSegmented(raw.groups);
    case 'natural':
      return evaluateNatural(raw.groups);
    case 'natural_no_qty':
      return evaluateNaturalNoQuantity(raw.groups);
    case 'spacing_spec':
      return evaluateSpacingSpec(raw.groups);
    case 'bar_mention':
      return evaluateBarMention(raw.groups);
    case 'mesh':
      return evaluateMesh(raw.groups);
    case 'spacing_orphan':
      return evaluateSpacingOrphan(raw.groups);
  }
}

// ---------------------------------------------------------------------------
// Motor de detección por línea
// ---------------------------------------------------------------------------

function collectRawMatches(line: string): RawMatch[] {
  const accepted: RawMatch[] = [];

  for (const { rule, pattern } of RULE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const text = match[0];
      if (!text || text.trim().length === 0) continue;
      const start = match.index ?? 0;
      const end = start + text.length;
      const overlaps = accepted.some((prev) => start < prev.end && end > prev.start);
      if (overlaps) continue;
      accepted.push({ rule, start, end, text, groups: match });
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

function extractElementLabel(line: string): string | undefined {
  const match = line.match(ELEMENT_CODE_PATTERN);
  if (!match) return undefined;
  const word = match[1];
  const code = match[2];
  if (!code) return undefined;
  if (word && ELEMENT_WORDS.has(word.toLowerCase())) {
    return `${word} ${code}`;
  }
  return code;
}

/**
 * Sospecha de mala lectura/OCR evaluada sobre TODA la línea, no solo el
 * fragmento: un `5#56OO` corrupto produce el fragmento plausible `5#56`
 * y las letras corruptas quedan justo fuera del match (riesgo R1 del
 * blueprint F6). Solo advierte y fuerza revisión; nunca corrige.
 */
function applyOcrSuspicion(core: EvaluationCore, lineText: string): EvaluationCore {
  if (!OCR_SUSPECT_PATTERN.test(lineText)) return core;
  return {
    ...core,
    warnings: [
      ...core.warnings,
      'Posible error de lectura/OCR: hay letras (O, l, I) pegadas a numeros en esta linea. Verifica contra el original.',
    ],
    confidenceLevel: core.confidenceLevel === 'high' ? 'medium' : core.confidenceLevel,
    status: core.status === 'pending' ? 'needs_review' : core.status,
  };
}

function applyElementContext(core: EvaluationCore, elementLabel: string | undefined): EvaluationCore {
  if (!elementLabel) return core;
  const detectedFields = core.detectedFields.includes('element')
    ? core.detectedFields
    : [...core.detectedFields, 'element' as const];
  // El elemento suma contexto (factor del modelo f6-cm-1) sin cambiar nivel.
  const bumped = Math.min(0.95, Math.round((Number(core.confidenceScore) + 0.05) * 100) / 100);
  return {
    ...core,
    detectedFields,
    confidenceScore: core.confidenceLevel === 'not_interpretable' ? core.confidenceScore : String(bumped),
    confidenceReason: `${core.confidenceReason} Elemento asociado: ${elementLabel}.`,
  };
}

function stableCandidateId(pageNumber: number, index: number, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `pdf-p${pageNumber}-${index + 1}-${slug || 'candidate'}`;
}

export function detectPdfIntakeCandidates(
  text: string,
  options: PdfIntakeDetectOptions = {},
): readonly PdfIntakeCandidate[] {
  const pageNumber = Math.max(1, options.pageNumber ?? 1);
  const lines = text.split(/\r?\n/);
  const candidates: PdfIntakeCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    if (line.trim().length === 0) return;
    const elementLabel = extractElementLabel(line);
    const matches = collectRawMatches(line);

    for (const raw of matches) {
      let core = evaluateMatch(raw);
      core = applyOcrSuspicion(core, line);
      core = applyElementContext(core, elementLabel);

      candidates.push({
        id: stableCandidateId(pageNumber, candidates.length, raw.text),
        evidence: {
          originalText: raw.text.trim(),
          lineText: line.trim(),
          lineIndex,
          pageNumber,
          detectionReason: RULE_REASON[raw.rule],
        },
        candidateText: core.candidateText,
        elementLabel,
        detectedFields: core.detectedFields,
        missingFields: core.missingFields,
        warnings: core.warnings,
        suggestedInterpretation: core.suggestedInterpretation,
        confidenceLevel: core.confidenceLevel,
        confidenceScore: core.confidenceScore,
        confidenceReason: core.confidenceReason,
        f1Ready: core.f1Ready,
        status: core.status,
      });
    }
  });

  return candidates;
}

/**
 * Reevalúa un candidato tras edición humana. La evidencia original es
 * inmutable (F6-S5): solo cambia el texto canónico y su evaluación.
 */
export function reevaluatePdfIntakeCandidateText(
  candidate: PdfIntakeCandidate,
  nextText: string,
): PdfIntakeCandidate {
  const trimmed = nextText.trim();
  const matches = collectRawMatches(trimmed);
  const first = matches[0];
  let core = first ? evaluateMatch(first) : notInterpretableCore(trimmed, 'Texto editado sin patron reconocible.');
  core = applyOcrSuspicion(core, trimmed);
  core = applyElementContext(core, candidate.elementLabel);

  return {
    ...candidate,
    candidateText: trimmed,
    detectedFields: core.detectedFields,
    missingFields: core.missingFields,
    warnings: core.warnings,
    suggestedInterpretation: core.suggestedInterpretation,
    confidenceLevel: core.confidenceLevel,
    confidenceScore: core.confidenceScore,
    confidenceReason: core.confidenceReason,
    f1Ready: core.f1Ready,
    status: candidate.status === 'discarded' ? 'discarded' : core.status,
  };
}

/** Compuerta de aprobación: nunca se aprueba lo no convertible (F6-S3/S6). */
export function canApprovePdfIntakeCandidate(candidate: PdfIntakeCandidate): {
  ok: boolean;
  reason?: string;
} {
  if (candidate.status === 'discarded') {
    return { ok: false, reason: 'Candidato descartado: restauralo antes de aprobar.' };
  }
  if (candidate.confidenceLevel === 'not_interpretable') {
    return { ok: false, reason: 'No interpretable: corrige el texto o descartalo.' };
  }
  if (!candidate.f1Ready) {
    const missing = candidate.missingFields.map((field) => MISSING_FIELD_LABEL[field]).join(', ');
    return {
      ok: false,
      reason: missing
        ? `Faltan datos (${missing}): completa el texto del candidato antes de aprobar.`
        : 'El texto del candidato aun no es interpretable por F1.',
    };
  }
  return { ok: true };
}

/**
 * Convierte candidatos APROBADOS y convertibles a INPUT de línea manual F3.
 * F6A no calcula nada: F1 parsea/calcula la descripción al entrar al takeoff.
 */
export function pdfIntakeCandidatesToManualLines(
  candidates: readonly PdfIntakeCandidate[],
  options: { assumedWastePct?: string } = {},
): readonly Omit<ManualLineRecord, 'id'>[] {
  const assumedWastePct = options.assumedWastePct ?? '5';
  return candidates
    .filter((candidate) => candidate.status === 'approved' && candidate.f1Ready)
    .map((candidate) => ({
      originalDescription: candidate.candidateText,
      assumedWastePct,
    }));
}
