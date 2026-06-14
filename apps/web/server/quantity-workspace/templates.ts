/**
 * templates.ts — Plantillas de cantidades derivadas (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 §3).
 *
 * Propiedad: agent-cost-domain. Dominio PURO y testeable.
 * Plantilla "muro mixto": de un mismo muro deriva 4 líneas, cada una vinculable
 * a un APU/BOQ distinto. La plantilla SOLO propone líneas; el usuario las edita
 * o borra antes de persistir. El resultado de cada línea se calcula con el motor
 * puro (`computeQuantityLine`) — única fuente de verdad.
 */
import type { DecimalString } from '@/lib/utils/types';
import {
  computeQuantityLine,
  QuantityFormulaError,
  type FormulaType,
  type QuantityLineResult,
} from './formula';

/** Entrada de la plantilla de muro mixto. */
export interface MixedWallInput {
  /** longitud del muro (ml). */
  length: DecimalString;
  /** altura total del muro (m). */
  totalHeight: DecimalString;
  /** altura de enchape (m). */
  tileHeight: DecimalString;
  /** descuento de vanos para el sustrato (m²). */
  openingDeduction?: DecimalString | null;
  /** descuento de vanos para el enchape (m²). */
  tileDeduction?: DecimalString | null;
  /** descuento de vanos para pintura/microcemento (m²). */
  remainderDeduction?: DecimalString | null;
  /** desperdicio fraccional opcional por resultado (0..1). */
  wastePct?: DecimalString | null;
}

/** Línea derivada propuesta por una plantilla. */
export interface DerivedLineProposal {
  key: 'substrate' | 'tile' | 'profile' | 'paint';
  description: string;
  formulaType: FormulaType;
  resultUnit: string;
  length?: DecimalString | null;
  height?: DecimalString | null;
  partialHeight?: DecimalString | null;
  openingDeduction?: DecimalString | null;
  wastePct?: DecimalString | null;
  result: QuantityLineResult;
}

/**
 * Construye las 4 líneas derivadas de un muro mixto:
 *   - m² board/sustrato = length × total_height − vanos        (wall_with_opening)
 *   - m² enchape        = length × tile_height − ded_enchape    (tile_by_height)
 *   - ml perfil remate  = length                               (linear_profile)
 *   - m² pintura/microc. = length × (total_height − tile_height) − ded (paint_remainder)
 */
export function buildMixedWallLines(input: MixedWallInput): DerivedLineProposal[] {
  const waste = input.wastePct ?? null;

  const substrate = {
    key: 'substrate' as const,
    description: 'Muro board / sustrato',
    formulaType: 'wall_with_opening' as FormulaType,
    resultUnit: 'm²',
    length: input.length,
    height: input.totalHeight,
    openingDeduction: input.openingDeduction ?? null,
    wastePct: waste,
  };

  const tile = {
    key: 'tile' as const,
    description: 'Enchape (por altura)',
    formulaType: 'tile_by_height' as FormulaType,
    resultUnit: 'm²',
    length: input.length,
    partialHeight: input.tileHeight,
    openingDeduction: input.tileDeduction ?? null,
    wastePct: waste,
  };

  const profile = {
    key: 'profile' as const,
    description: 'Perfil / remate del enchape',
    formulaType: 'linear_profile' as FormulaType,
    resultUnit: 'ml',
    length: input.length,
    wastePct: waste,
  };

  const paint = {
    key: 'paint' as const,
    description: 'Pintura / microcemento (resto del muro)',
    formulaType: 'paint_remainder' as FormulaType,
    resultUnit: 'm²',
    length: input.length,
    height: input.totalHeight,
    partialHeight: input.tileHeight,
    openingDeduction: input.remainderDeduction ?? null,
    wastePct: waste,
  };

  return [substrate, tile, profile, paint].map((proposal) => {
    const result = computeQuantityLine({
      formulaType: proposal.formulaType,
      length: proposal.length,
      height: 'height' in proposal ? proposal.height : null,
      partialHeight: 'partialHeight' in proposal ? proposal.partialHeight : null,
      openingDeduction: 'openingDeduction' in proposal ? proposal.openingDeduction : null,
      wastePct: proposal.wastePct,
    });
    return { ...proposal, result } as DerivedLineProposal;
  });
}

export { QuantityFormulaError };
