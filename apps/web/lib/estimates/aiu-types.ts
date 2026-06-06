/**
 * aiu-types.ts — Tipos CLIENT-SAFE de AIU y resumen financiero (4D.2).
 *
 * Sin dependencias de servidor. Porcentajes en **formato humano** (`"3.5"` = 3.5 %)
 * como `DecimalString`; montos como `DecimalString`. NUNCA `number`.
 */
import type { DecimalString, IsoDateTime } from '@/lib/utils/types';

export type { DecimalString } from '@/lib/utils/types';

/** Límite humano por porcentaje (documentado en AIU_CRUD_CONTRACT §4). */
export const AIU_MAX_RATE = 100;

/** Conceptos AIU (kinds) y sus códigos/base_type canónicos en `indirect_cost_rules`. */
export const AIU_KINDS = [
  { key: 'administrationRate', code: 'A', name: 'Administración', baseType: 'direct_cost', sortOrder: 0 },
  { key: 'contingencyRate', code: 'I', name: 'Imprevistos', baseType: 'direct_cost', sortOrder: 1 },
  { key: 'utilityRate', code: 'U', name: 'Utilidad', baseType: 'direct_cost', sortOrder: 2 },
  { key: 'utilityVatRate', code: 'IVA', name: 'IVA sobre utilidad', baseType: 'utility', sortOrder: 3 },
] as const;

/** Porcentajes editables (formato humano) permitidos desde el navegador. */
export interface AiuRatesInput {
  administrationRate: DecimalString;
  contingencyRate: DecimalString;
  utilityRate: DecimalString;
  utilityVatRate: DecimalString;
}

/** Estado de AIU de la versión activa (rates humanos + flags). */
export interface AiuRatesView extends AiuRatesInput {
  /** `true` si la versión activa aún no tiene reglas AIU definidas. */
  isEmpty: boolean;
  /** `true` si la versión permite edición (no emitida). */
  editable: boolean;
  /** Última actualización de las reglas AIU (si se conoce). */
  updatedAt?: IsoDateTime | null;
}

/** Resumen financiero recalculado server-side (montos derivados). */
export interface FinancialSummary {
  directTotal: DecimalString;
  administrationAmount: DecimalString;
  contingencyAmount: DecimalString;
  utilityAmount: DecimalString;
  utilityVatAmount: DecimalString;
  indirectTotal: DecimalString;
  grandTotal: DecimalString;
}
