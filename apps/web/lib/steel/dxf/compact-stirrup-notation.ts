/**
 * compact-stirrup-notation.ts — Nomenclatura decimal compacta de estribos y
 * verificación por segmentos gráficos (F8B, puro).
 *
 * Problema real (plano "Refuerzo Vigas de Cimentación"): el despiece trae
 * `2x153E#318.4`. El token decimal `18.4` después del diámetro NO son
 * 18.4 cm: es la longitud de corte compacta en centímetros con punto tipográfico
 * ⇒ `184 cm`. Regla explícita:
 *
 *   E#318.4 → E#3, L = 184 cm      E#321.0 → E#3, L = 210 cm
 *   E#315.6 → E#3, L = 156 cm
 *
 * Guardas de honestidad:
 * - Solo aplica en contexto de estribo/fleje (token E#) y con contexto
 *   estructural declarado por el caller (viga/estribo/plan de despiece).
 * - Solo con EXACTAMENTE un dígito decimal; sin decimal no se toca nada.
 * - Si el resultado es absurdo (fuera de 30–600 cm) no se aplica.
 * - Siempre se preserva el texto original, se muestra el normalizado y se
 *   agrega la advertencia con la conversión. En duda ⇒ requiresReview.
 *
 * También evalúa la SUMA DE SEGMENTOS del gráfico del estribo (50-30-12 con
 * simetría ⇒ 50+30+12+12+30+50 = 184 cm) contra la longitud declarada.
 * Jamás inventa: sin segmentos suficientes o sin regla de simetría aplicable
 * el veredicto es `unverified`.
 */

// ---------------------------------------------------------------------------
// P1 — Normalización de longitud decimal compacta
// ---------------------------------------------------------------------------

/** E#<bar><int>.<1 decimal> — con prefijos de cantidad opcionales intactos. */
const COMPACT_DECIMAL_STIRRUP_PATTERN = /(E\s*#\s*)(\d)(\d{1,2})\.(\d)(?!\d)/gi;

/** Longitud de corte plausible para un estribo/fleje (cm). */
const MIN_PLAUSIBLE_STIRRUP_CM = 30;
const MAX_PLAUSIBLE_STIRRUP_CM = 600;

export interface CompactStirrupInterpretation {
  /** Token original ("E#318.4"). */
  raw: string;
  /** Token normalizado ("E#3184"). */
  normalized: string;
  barNumber: number;
  lengthCm: number;
}

export interface CompactStirrupNormalization {
  originalText: string;
  /** Texto con los tokens normalizados (igual al original si no aplicó). */
  normalizedText: string;
  /** true si al menos un token se normalizó. */
  applied: boolean;
  /** true cuando la lectura debe pasar por revisión humana. */
  requiresReview: boolean;
  warnings: readonly string[];
  interpretations: readonly CompactStirrupInterpretation[];
}

export interface CompactStirrupOptions {
  /**
   * ¿El texto viene de un contexto estructural de viga/estribo (línea o
   * vecindad con VC/VIGA/ESTRIBO/FLEJE, o plano con vigas detectadas)?
   * Fuera de contexto la regla NO se aplica y se marca requiresReview.
   */
  structuralContext?: boolean;
}

/**
 * Normaliza la longitud decimal compacta de estribos. No toca nada sin
 * decimal (`E#318` se queda como esté) ni fuera del patrón E#.
 */
export function normalizeCompactStirrupNotation(
  text: string,
  options: CompactStirrupOptions = {},
): CompactStirrupNormalization {
  const structuralContext = options.structuralContext ?? false;
  const warnings: string[] = [];
  const interpretations: CompactStirrupInterpretation[] = [];
  let requiresReview = false;
  let applied = false;

  COMPACT_DECIMAL_STIRRUP_PATTERN.lastIndex = 0;
  const normalizedText = text.replace(
    COMPACT_DECIMAL_STIRRUP_PATTERN,
    (raw, prefix: string, bar: string, intPart: string, decimal: string) => {
      const lengthCm = Number.parseInt(`${intPart}${decimal}`, 10);
      const plausible = lengthCm >= MIN_PLAUSIBLE_STIRRUP_CM && lengthCm <= MAX_PLAUSIBLE_STIRRUP_CM;

      if (!plausible) {
        requiresReview = true;
        warnings.push(
          `Longitud decimal compacta "${intPart}.${decimal}" produciría ${lengthCm} cm (fuera de rango plausible 30–600 cm): no se normalizó; revisar contra el plano.`,
        );
        return raw;
      }
      if (!structuralContext) {
        requiresReview = true;
        warnings.push(
          `"${raw.trim()}" parece longitud decimal compacta de estribo (${intPart}.${decimal} → ${lengthCm} cm), pero está fuera de contexto de viga/estribo: requiere revisión, no se normalizó automáticamente.`,
        );
        return raw;
      }

      applied = true;
      const normalizedToken = `${prefix.replace(/\s+/g, '')}${bar}${intPart}${decimal}`;
      interpretations.push({
        raw: raw.trim(),
        normalized: normalizedToken,
        barNumber: Number.parseInt(bar, 10),
        lengthCm,
      });
      warnings.push(
        `Longitud decimal compacta interpretada como centímetros: ${intPart}.${decimal} → ${lengthCm} cm.`,
      );
      return normalizedToken;
    },
  );

  return {
    originalText: text,
    normalizedText: applied ? normalizedText : text,
    applied,
    requiresReview,
    warnings,
    interpretations,
  };
}

// ---------------------------------------------------------------------------
// F8C — Longitudinales con longitud compacta ("6#6 33 L" ⇒ 6#6330)
// ---------------------------------------------------------------------------

/** "6#6 33 L" / "6#6 33L": dígitos separados + sufijo L ⇒ longitud ×10 en cm. */
const COMPACT_LONGITUDINAL_L_PATTERN = /(\d)\s*#\s*(\d)\s+(\d{1,2})\s*L\b/gi;
/** Token corto "6#635": SOLO 2 dígitos de longitud tras el código ⇒ ×10. */
const COMPACT_LONGITUDINAL_SHORT_PATTERN = /\b(\d)#(\d)(\d{2})\b(?!\d)/g;

const MIN_PLAUSIBLE_LONGITUDINAL_CM = 50;
const MAX_PLAUSIBLE_LONGITUDINAL_CM = 1200;

export interface CompactLongitudinalInterpretation {
  raw: string;
  /** Token normalizado ("6#6330"). */
  normalized: string;
  /** Código/diámetro de la varilla (el 2.º dígito; el 1.º JAMÁS es cantidad). */
  barCode: number;
  lengthCm: number;
}

export interface CompactLongitudinalNormalization {
  originalText: string;
  normalizedText: string;
  applied: boolean;
  requiresReview: boolean;
  warnings: readonly string[];
  interpretations: readonly CompactLongitudinalInterpretation[];
}

/**
 * Normaliza longitudes compactas de refuerzo LONGITUDINAL en detalles de
 * viga: `6#6 33 L` ⇒ `6#6330` (330 cm) y `6#635` ⇒ `6#6350` (350 cm) cuando
 * el contexto es longitudinal. Tokens de 3+ dígitos (`6#6840`) no se tocan.
 * Fuera de contexto o fuera de rango plausible ⇒ requiresReview sin cambio.
 * OJO: el primer dígito es notación del plano, NO cantidad automática — la
 * cantidad sale del conteo gráfico (círculos/markers) o de revisión humana.
 */
export function normalizeCompactLongitudinalNotation(
  text: string,
  options: CompactStirrupOptions = {},
): CompactLongitudinalNormalization {
  const structuralContext = options.structuralContext ?? false;
  const warnings: string[] = [];
  const interpretations: CompactLongitudinalInterpretation[] = [];
  let requiresReview = false;
  let applied = false;

  const applyToken = (raw: string, first: string, bar: string, lengthDigits: string): string => {
    const lengthCm = Number.parseInt(lengthDigits, 10) * 10;
    if (lengthCm < MIN_PLAUSIBLE_LONGITUDINAL_CM || lengthCm > MAX_PLAUSIBLE_LONGITUDINAL_CM) {
      requiresReview = true;
      warnings.push(
        `"${raw.trim()}" produciría ${lengthCm} cm (fuera de rango plausible ${MIN_PLAUSIBLE_LONGITUDINAL_CM}–${MAX_PLAUSIBLE_LONGITUDINAL_CM} cm): no se normalizó; revisar contra el plano.`,
      );
      return raw;
    }
    if (!structuralContext) {
      requiresReview = true;
      warnings.push(
        `"${raw.trim()}" parece longitud compacta de refuerzo longitudinal (→ ${lengthCm} cm), pero falta contexto de viga/despiece: requiere revisión, no se normalizó automáticamente.`,
      );
      return raw;
    }
    applied = true;
    const normalized = `${first}#${bar}${lengthCm}`;
    interpretations.push({ raw: raw.trim(), normalized, barCode: Number.parseInt(bar, 10), lengthCm });
    warnings.push(`Longitud compacta interpretada como centímetros: ${lengthDigits} → ${lengthCm} cm.`);
    return normalized;
  };

  COMPACT_LONGITUDINAL_L_PATTERN.lastIndex = 0;
  let normalizedText = text.replace(COMPACT_LONGITUDINAL_L_PATTERN, (raw, first: string, bar: string, len: string) =>
    applyToken(raw, first, bar, len),
  );
  COMPACT_LONGITUDINAL_SHORT_PATTERN.lastIndex = 0;
  normalizedText = normalizedText.replace(
    COMPACT_LONGITUDINAL_SHORT_PATTERN,
    (raw, first: string, bar: string, len: string) => applyToken(raw, first, bar, len),
  );

  return {
    originalText: text,
    normalizedText: applied ? normalizedText : text,
    applied,
    requiresReview,
    warnings,
    interpretations,
  };
}

// ---------------------------------------------------------------------------
// P2 — Verificación por segmentos gráficos del estribo
// ---------------------------------------------------------------------------

export type StirrupSegmentStatus = 'confirmed' | 'segment_sum_mismatch' | 'graphic_segment_sum_unverified';

export interface StirrupSegmentEvaluation {
  status: StirrupSegmentStatus;
  declaredLengthCm: number;
  /** Suma computada (con simetría aplicada si corresponde). */
  computedCm?: number;
  /** Segmentos completos usados (espejados si se asumió simetría). */
  segmentsUsed?: readonly number[];
  symmetryApplied: boolean;
  message: string;
}

export interface StirrupSegmentOptions {
  /**
   * ¿Se puede asumir simetría (el detalle muestra media vuelta y la otra
   * mitad es espejo)? Sin esta regla, segmentos que no suman exacto quedan
   * `unverified`, jamás mismatch inventado.
   */
  assumeSymmetry?: boolean;
}

/**
 * Compara la suma de segmentos gráficos del estribo contra la longitud
 * declarada por nomenclatura.
 */
export function evaluateStirrupSegmentSum(
  segments: readonly number[],
  declaredLengthCm: number,
  options: StirrupSegmentOptions = {},
): StirrupSegmentEvaluation {
  const assumeSymmetry = options.assumeSymmetry ?? false;
  const valid = segments.filter((s) => Number.isFinite(s) && s > 0);

  if (valid.length < 2 || !Number.isFinite(declaredLengthCm) || declaredLengthCm <= 0) {
    return {
      status: 'graphic_segment_sum_unverified',
      declaredLengthCm,
      symmetryApplied: false,
      message: 'No hay segmentos gráficos suficientes para verificar la longitud del estribo.',
    };
  }

  const directSum = valid.reduce((acc, s) => acc + s, 0);
  if (directSum === declaredLengthCm) {
    return {
      status: 'confirmed',
      declaredLengthCm,
      computedCm: directSum,
      segmentsUsed: valid,
      symmetryApplied: false,
      message: `Longitud de estribo confirmada por segmentos gráficos: ${directSum} cm (${valid.join(' + ')}).`,
    };
  }

  if (assumeSymmetry) {
    const mirrored = [...valid, ...[...valid].reverse()];
    const symmetricSum = directSum * 2;
    if (symmetricSum === declaredLengthCm) {
      return {
        status: 'confirmed',
        declaredLengthCm,
        computedCm: symmetricSum,
        segmentsUsed: mirrored,
        symmetryApplied: true,
        message: `Longitud de estribo confirmada por segmentos gráficos (simetría): ${mirrored.join(' + ')} = ${symmetricSum} cm.`,
      };
    }
    // Con simetría asumida SÍ hay hipótesis completa ⇒ mismatch honesto.
    const closest = Math.abs(symmetricSum - declaredLengthCm) <= Math.abs(directSum - declaredLengthCm) ? symmetricSum : directSum;
    return {
      status: 'segment_sum_mismatch',
      declaredLengthCm,
      computedCm: closest,
      segmentsUsed: closest === symmetricSum ? mirrored : valid,
      symmetryApplied: closest === symmetricSum,
      message: `El gráfico del estribo suma ${closest} cm pero la nomenclatura indica ${declaredLengthCm} cm.`,
    };
  }

  // Sin regla de simetría no sabemos si los segmentos están completos.
  return {
    status: 'graphic_segment_sum_unverified',
    declaredLengthCm,
    computedCm: directSum,
    segmentsUsed: valid,
    symmetryApplied: false,
    message: `Los segmentos visibles suman ${directSum} cm pero pueden estar incompletos (sin regla de simetría): conteo gráfico sin verificar.`,
  };
}
