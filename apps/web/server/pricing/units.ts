/**
 * units.ts — UNIT_ALIAS_NORMALIZATION_V1 (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §7.
 *
 * Normalización SEMÁNTICA mínima de unidades para comparación. Reglas:
 *  - El valor RAW original SIEMPRE se preserva donde se persista (la
 *    normalización es solo para comparar; sin backfill destructivo).
 *  - Warning solo cuando las unidades canónicas difieren realmente
 *    (m2 vs m² NO genera warning).
 *  - Unidades fuera de la tabla de aliases: comparación normalizada
 *    (trim + case-insensitive + colapso de espacios) sin inventar
 *    equivalencias.
 */

/** Tabla de aliases → unidad canónica (claves ya normalizadas con normalizeRaw). */
const UNIT_ALIASES: Record<string, string> = {
  // m² — metro cuadrado
  'm2': 'm²',
  'm²': 'm²',
  'metro cuadrado': 'm²',
  'metros cuadrados': 'm²',
  // m³ — metro cúbico (extensión aditiva QUANTITY_TAKEOFF_IMPORT_V1 §2.2)
  'm3': 'm³',
  'm³': 'm³',
  'metro cubico': 'm³',
  'metros cubicos': 'm³',
  'metro cúbico': 'm³',
  'metros cúbicos': 'm³',
  // und — unidad
  'und': 'und',
  'unidad': 'und',
  'unidades': 'und',
  'un': 'und',
  // día — jornada
  'dia': 'día',
  'día': 'día',
  'jornada': 'día',
  'jn': 'día',
};

/**
 * Normalización léxica básica: trim, minúsculas, colapso de espacios
 * internos. NO altera acentos ni superíndices (eso lo decide la tabla).
 */
function normalizeRaw(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface CanonicalUnit {
  /** Valor original tal como llegó (preservado; nunca se persiste alterado). */
  raw: string;
  /** Unidad canónica para comparar (alias resuelto o raw normalizado). */
  canonical: string;
  /** `true` si el alias está en la tabla semántica V1. */
  recognized: boolean;
}

/**
 * Resuelve la unidad canónica de un valor crudo. Si el valor no está en la
 * tabla de aliases, la canónica es el raw normalizado léxicamente (sin
 * inventar equivalencias).
 */
export function canonicalizeUnit(raw: string | null | undefined): CanonicalUnit {
  const value = raw ?? '';
  const normalized = normalizeRaw(value);
  const alias = UNIT_ALIASES[normalized];
  return {
    raw: value,
    canonical: alias ?? normalized,
    recognized: alias !== undefined,
  };
}

/**
 * `true` si dos unidades son semánticamente equivalentes (misma canónica).
 * Valores vacíos solo equivalen entre sí.
 */
export function unitsEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return canonicalizeUnit(a).canonical === canonicalizeUnit(b).canonical;
}

/** Aliases documentados (solo lectura; útil para docs y tests). */
export const UNIT_ALIAS_TABLE: ReadonlyArray<{ canonical: string; aliases: readonly string[] }> = [
  { canonical: 'm²', aliases: ['m2', 'M2', 'm²', 'metro cuadrado', 'metros cuadrados'] },
  { canonical: 'm³', aliases: ['m3', 'M3', 'm³', 'metro cubico', 'metros cubicos'] },
  { canonical: 'und', aliases: ['und', 'unidad', 'unidades', 'un'] },
  { canonical: 'día', aliases: ['dia', 'día', 'jornada', 'jn'] },
];
