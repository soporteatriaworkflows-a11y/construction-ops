/**
 * drawing-nomenclature.ts — Leyenda/nomenclatura del plano (F7, puro).
 *
 * Cada oficina de diseño usa convenciones propias: `Q`, `E`, `CANT.`, `SON`,
 * `L=`, `@`, `E#3`… El sistema NO asume significados: primero busca si el
 * propio plano trae una leyenda/nomenclatura que los defina.
 *
 * - Símbolo definido en la leyenda ⇒ resuelto CON evidencia (línea literal).
 * - Símbolo usado pero sin definición ⇒ `unresolved` con sus ocurrencias:
 *   el humano define qué significa. Jamás se dice "Q = corrugada" sin
 *   evidencia en el plano.
 * - Convenciones universales de la notación F1 (`#` = número de varilla,
 *   `@` = separación, `L=` = longitud) se marcan como `builtin` — son parte
 *   del contrato F1, no una asunción sobre este plano.
 */
import type { PageRegion } from './drawing-page-regions';
import { normalizeDrawingText, type SpatialTextLine } from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Entrada de leyenda detectada en el plano (definición con evidencia). */
export interface LegendEntry {
  symbol: string;
  meaning: string;
  sourceFileName?: string;
  pageNumber: number;
  lineId?: string;
  lineText: string;
  /** true si la línea vive dentro de una región legend/notes detectada. */
  fromLegendRegion: boolean;
}

export interface SymbolOccurrence {
  symbol: string;
  sourceFileName?: string;
  pageNumber: number;
  lineId?: string;
  lineText: string;
}

export type SymbolResolution =
  | { kind: 'resolved'; symbol: string; meaning: string; evidence: LegendEntry }
  | { kind: 'builtin'; symbol: string; meaning: string }
  | { kind: 'unresolved'; symbol: string; occurrences: readonly SymbolOccurrence[]; reason: string };

export interface NomenclatureReport {
  legendEntries: readonly LegendEntry[];
  resolutions: readonly SymbolResolution[];
  /** Símbolos sin resolver (atajo para hallazgos). */
  unresolvedSymbols: readonly string[];
}

// ---------------------------------------------------------------------------
// Convenciones que el contrato F1 ya define (no son asunciones del plano)
// ---------------------------------------------------------------------------

const BUILTIN_MEANING: Record<string, string> = {
  '#': 'Numero de varilla (notacion F1: 5#5600 = 5 varillas #5 de 600 cm).',
  '@': 'Separacion entre barras/estribos (notacion F1: @15 = cada 15 cm).',
  'L=': 'Longitud explicita (notacion F1: L=2.40).',
  E: 'Estribo (notacion F1: 74E#3200 = 74 estribos #3 de 200 cm).',
};

// ---------------------------------------------------------------------------
// Detección de definiciones en la leyenda
// ---------------------------------------------------------------------------

/**
 * Línea de definición: `SIMBOLO = significado` · `SIMBOLO : significado` ·
 * `SIMBOLO - significado`. El símbolo es corto (sigla/abreviatura); el
 * significado necesita cuerpo (≥3 caracteres) para no capturar ecuaciones.
 */
const LEGEND_LINE_PATTERN = /^\s*([A-ZÑ]{1,6}\.?|[ØΦ]|#|@|L=)\s*[=:–—-]\s*(\D.{2,})$/;

/** Regiones donde una definición es creíble como leyenda. */
const LEGEND_REGION_TYPES = new Set(['legend', 'notes']);

export interface LegendDetectInput {
  lines: readonly SpatialTextLine[];
  regions?: readonly PageRegion[];
}

/**
 * Detecta entradas de leyenda en las líneas de una página. Las definiciones
 * dentro de regiones legend/notes pesan más; una definición fuera de esas
 * regiones igual se registra (muchos planos ponen la nomenclatura suelta),
 * marcada `fromLegendRegion: false`.
 */
export function detectLegendEntries(input: LegendDetectInput): LegendEntry[] {
  const regionOf = (lineId: string) =>
    input.regions?.find((region) => region.lineIds.includes(lineId));

  const entries: LegendEntry[] = [];
  for (const line of input.lines) {
    const match = line.normalizedText.match(LEGEND_LINE_PATTERN);
    if (!match) continue;
    const symbol = (match[1] ?? '').replace(/\.$/, '');
    const meaning = (match[2] ?? '').trim();
    if (!symbol || meaning.length < 3) continue;
    // Un "significado" que es pura notación de acero no es una definición
    // (p. ej. "E#3 @ 15" no define E; es un llamado).
    if (/^#?\d/.test(meaning)) continue;
    const region = regionOf(line.lineId);
    entries.push({
      symbol,
      meaning,
      sourceFileName: line.sourceFileName,
      pageNumber: line.pageNumber,
      lineId: line.lineId,
      lineText: line.text,
      fromLegendRegion: region ? LEGEND_REGION_TYPES.has(region.regionType) : false,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Símbolos usados en el plano
// ---------------------------------------------------------------------------

/**
 * Símbolos de interés usados en llamados/tablas cuyo significado depende de
 * la oficina: letra suelta pegada a notación (`Q`, `E`), encabezados de
 * cuadro (`CANT.`, `SON`, `LONG.`), etc.
 */
const USED_SYMBOL_PATTERNS: readonly { pattern: RegExp; symbol: (m: RegExpMatchArray) => string }[] = [
  // Letra suelta adyacente a notación de despiece: "3Q#4", "Q #5", "2E#3182".
  // (`E` incluida: si no hay leyenda se resuelve como builtin F1 = estribo.)
  { pattern: /\b(\d+\s*)?([A-ZÑ])\s*#\s*\d/g, symbol: (m) => (m[2] ?? '').toUpperCase() },
  // Encabezados/etiquetas de cuadro frecuentes no autodefinidos.
  { pattern: /\b(CANT\.?|SON|LONG\.?|DIAM\.?|SEPARAC(?:ION)?\.?)\b/g, symbol: (m) => (m[1] ?? '').replace(/\.$/, '').toUpperCase() },
];

/** Símbolos con convención universal F1 (se reportan como builtin si se usan). */
const BUILTIN_USED_PATTERNS: readonly { token: string; pattern: RegExp }[] = [
  { token: '#', pattern: /#\s*\d/ },
  { token: '@', pattern: /@\s*\d/ },
  { token: 'L=', pattern: /\bL\s*=\s*\d/ },
];

export function collectUsedSymbols(lines: readonly SpatialTextLine[]): SymbolOccurrence[] {
  const occurrences: SymbolOccurrence[] = [];
  for (const line of lines) {
    for (const { pattern, symbol } of USED_SYMBOL_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of line.normalizedText.matchAll(pattern)) {
        const token = symbol(match);
        if (!token) continue;
        occurrences.push({
          symbol: token,
          sourceFileName: line.sourceFileName,
          pageNumber: line.pageNumber,
          lineId: line.lineId,
          lineText: line.text,
        });
      }
    }
  }
  return occurrences;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

export interface ResolveNomenclatureInput {
  /** Líneas de TODAS las páginas del plan set (la leyenda puede vivir en otro plano). */
  lines: readonly SpatialTextLine[];
  regions?: readonly PageRegion[];
}

/**
 * Cruza símbolos usados contra la leyenda detectada. Sin definición en el
 * plano ⇒ `unresolved` (definición manual requerida). Nunca se asume.
 */
export function resolveNomenclature(input: ResolveNomenclatureInput): NomenclatureReport {
  const legendEntries = detectLegendEntries({ lines: input.lines, regions: input.regions });
  const used = collectUsedSymbols(input.lines);

  const legendBySymbol = new Map<string, LegendEntry>();
  for (const entry of legendEntries) {
    const key = normalizeDrawingText(entry.symbol);
    // La primera definición encontrada gana; definiciones repetidas quedan en
    // legendEntries para inspección.
    if (!legendBySymbol.has(key)) legendBySymbol.set(key, entry);
  }

  const resolutions: SymbolResolution[] = [];
  const seen = new Set<string>();

  for (const occurrence of used) {
    const key = normalizeDrawingText(occurrence.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    const legend = legendBySymbol.get(key);
    if (legend) {
      resolutions.push({ kind: 'resolved', symbol: occurrence.symbol, meaning: legend.meaning, evidence: legend });
      continue;
    }
    const builtin = BUILTIN_MEANING[key];
    if (builtin) {
      resolutions.push({ kind: 'builtin', symbol: occurrence.symbol, meaning: builtin });
      continue;
    }
    resolutions.push({
      kind: 'unresolved',
      symbol: occurrence.symbol,
      occurrences: used.filter((o) => normalizeDrawingText(o.symbol) === key),
      reason: `"${occurrence.symbol}" aparece en el plano pero no fue encontrada en la leyenda detectada. Requiere definicion manual — no se asume su significado.`,
    });
  }

  // Convenciones F1 usadas: se reportan como builtin (transparencia).
  for (const { token, pattern } of BUILTIN_USED_PATTERNS) {
    if (seen.has(token)) continue;
    if (input.lines.some((line) => pattern.test(line.normalizedText))) {
      seen.add(token);
      resolutions.push({ kind: 'builtin', symbol: token, meaning: BUILTIN_MEANING[token]! });
    }
  }

  return {
    legendEntries,
    resolutions,
    unresolvedSymbols: resolutions
      .filter((r): r is Extract<SymbolResolution, { kind: 'unresolved' }> => r.kind === 'unresolved')
      .map((r) => r.symbol),
  };
}
