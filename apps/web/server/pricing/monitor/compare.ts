/**
 * compare.ts — Comparación pura detectado vs baseline (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §5.4.
 *
 * Sin IO. Decimal exacto para precios; unidad por canonical
 * (UNIT_ALIAS_NORMALIZATION_V1); moneda ISO-4217 normalizada a mayúsculas.
 */
import Decimal from 'decimal.js';
import { unitsEquivalent } from '../units';
import type { DetectedPrice, MonitorBaseline } from './types';

export type CompareOutcome = 'unchanged' | 'changed' | 'no_baseline';

export interface CompareResult {
  outcome: CompareOutcome;
  warnings: string[];
}

function normalizeCurrency(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().toUpperCase();
  return v || 'COP';
}

/**
 * Compara el precio detectado contra la baseline aprobada.
 *  - Sin baseline ⇒ `no_baseline` (el monitor propone pending inicial).
 *  - Moneda distinta ⇒ `changed` + warning (no comparable).
 *  - Unidad canónica distinta (cuando la fuente expone unidad) ⇒ `changed`
 *    + warning. m2 vs m² NO genera warning (equivalentes).
 *  - Precio Decimal distinto ⇒ `changed`.
 *  - Igual ⇒ `unchanged`.
 */
export function compareAgainstBaseline(
  detected: DetectedPrice,
  baseline: MonitorBaseline | null,
): CompareResult {
  const warnings: string[] = [];

  if (!baseline) {
    return { outcome: 'no_baseline', warnings };
  }

  const detectedCurrency = normalizeCurrency(detected.currency);
  const baselineCurrency = normalizeCurrency(baseline.currency);
  if (detectedCurrency !== baselineCurrency) {
    warnings.push(
      `Moneda detectada (${detectedCurrency}) difiere de la baseline (${baselineCurrency}); no comparable directamente.`,
    );
    return { outcome: 'changed', warnings };
  }

  if (detected.unitRaw !== null && !unitsEquivalent(detected.unitRaw, baseline.unit)) {
    warnings.push(
      `Unidad detectada ("${detected.unitRaw}") difiere de la baseline ("${baseline.unit}").`,
    );
    return { outcome: 'changed', warnings };
  }

  let priceEqual: boolean;
  try {
    priceEqual = new Decimal(detected.price).equals(new Decimal(baseline.price));
  } catch {
    warnings.push('Precio detectado no comparable (formato inválido).');
    return { outcome: 'changed', warnings };
  }

  return { outcome: priceEqual ? 'unchanged' : 'changed', warnings };
}
