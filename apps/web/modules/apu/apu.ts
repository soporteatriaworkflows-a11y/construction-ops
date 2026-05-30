/**
 * apu.ts — Cálculo de componentes y costo unitario de un APU.
 *
 * Propiedad: agent-cost-domain.
 *
 * Funciones PURAS. El costo de cada componente y el costo unitario total del
 * APU se calculan con precisión decimal completa (Q9); el precio unitario
 * proviene de un snapshot congelado o se resuelve vía {@link PricingReadPort}
 * (campo `budgetReferencePrice` del {@link ApprovedPriceContext}). El dominio
 * NUNCA consulta tablas de precios ni recalcula descuentos/ahorros.
 *
 * Regla CANÓNICA del componente (docs/API_CONTRACTS.md §ApuComponent):
 *   total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot
 *
 * Esta regla generaliza las fórmulas por tipo del PROJECT_MASTER:
 *   - Material: cantidad × precio × (1 + desperdicio)        ⇒ waste_pct > 0
 *   - Mano de obra: horas × costo_hora × cuadrilla           ⇒ cantidad = horas×cuadrilla, waste=0
 *   - Equipo: horas × tarifa_horaria                         ⇒ cantidad = horas, waste=0
 *   - Subcontrato: cantidad × precio_subcontrato             ⇒ waste=0
 *   - Herramienta (% sobre M.O.): ver {@link calculateToolComponentCost}
 *     (NO encaja en quantity×price; se calcula como porcentaje del costo M.O.).
 */

import type { DecimalString, ApuComponentType, Uuid } from '@/lib/utils/types';
import { DomainDecimal, toDecimal, toDecimalString, sumDecimals, ZERO } from './decimal';
import { type PricingReadPort, throwOnPricingError } from './pricing-port';

/** Entrada mínima para calcular el costo de un componente quantity×price. */
export interface ApuComponentInput {
  componentType: ApuComponentType;
  /** Cantidad del componente (horas, m², unidades, etc.). No negativa. */
  quantity: DecimalString;
  /** Desperdicio como fracción (p. ej. "0.08"). No negativo. */
  wastePct: DecimalString;
  /** Precio unitario congelado (snapshot). */
  unitPriceSnapshot: DecimalString;
}

/** Resultado del cálculo de un componente. */
export interface ApuComponentResult {
  componentType: ApuComponentType;
  /** = quantity × (1 + wastePct) × unitPriceSnapshot. */
  totalComponentCost: DecimalString;
}

/**
 * Calcula el costo de un componente APU según la regla canónica del contrato.
 * Función PURA, sin redondeo intermedio.
 *
 * @param input - Cantidad, desperdicio y precio unitario snapshot.
 * @returns Costo total del componente como `DecimalString`.
 * @throws Error si `quantity` o `wastePct` son negativos.
 */
export function calculateApuComponentCost(input: ApuComponentInput): DecimalString {
  const quantity = toDecimal(input.quantity);
  const waste = toDecimal(input.wastePct);
  const price = toDecimal(input.unitPriceSnapshot);

  if (quantity.isNegative()) {
    throw new Error(`quantity no puede ser negativa: ${quantity.toFixed()}`);
  }
  if (waste.isNegative()) {
    throw new Error(`wastePct (desperdicio) no puede ser negativo: ${waste.toFixed()}`);
  }

  const wasteFactor = new DomainDecimal(1).plus(waste);
  return toDecimalString(quantity.times(wasteFactor).times(price));
}

/**
 * Calcula el costo de un componente de MANO DE OBRA con cuadrilla explícita.
 *   costo_mo = cantidad_horas × costo_hora × cuadrilla
 * Equivale a la regla canónica con `quantity = horas × cuadrilla` y `waste = 0`.
 *
 * @param hours - Horas requeridas.
 * @param hourlyCost - Costo por hora del rol (de `calculateLaborCost`).
 * @param crewSize - Tamaño de cuadrilla (por defecto "1").
 * @returns Costo de mano de obra como `DecimalString`.
 */
export function calculateLaborComponentCost(
  hours: DecimalString,
  hourlyCost: DecimalString,
  crewSize: DecimalString = '1',
): DecimalString {
  const h = toDecimal(hours);
  const cost = toDecimal(hourlyCost);
  const crew = toDecimal(crewSize);
  if (h.isNegative() || crew.isNegative()) {
    throw new Error('hours y crewSize no pueden ser negativos');
  }
  return toDecimalString(h.times(cost).times(crew));
}

/**
 * Calcula el costo de una HERRAMIENTA como porcentaje del costo total de mano
 * de obra del APU.
 *   costo_herramienta = porcentaje_herramienta × costo_mo_total
 *
 * @param toolPct - Porcentaje (fracción) sobre la M.O. (p. ej. "0.05").
 * @param totalLaborCost - Costo total de mano de obra del APU.
 * @returns Costo de la herramienta como `DecimalString`.
 * @throws Error si `toolPct` es negativo.
 */
export function calculateToolComponentCost(
  toolPct: DecimalString,
  totalLaborCost: DecimalString,
): DecimalString {
  const pct = toDecimal(toolPct);
  if (pct.isNegative()) {
    throw new Error(`porcentaje de herramienta no puede ser negativo: ${pct.toFixed()}`);
  }
  return toDecimalString(pct.times(toDecimal(totalLaborCost)));
}

/**
 * Calcula el costo unitario total de un APU como suma de los costos de sus
 * componentes ya calculados. Función PURA.
 *
 * @param componentCosts - Lista de `totalComponentCost` de cada componente.
 * @returns Costo unitario del APU como `DecimalString` ("0" si no hay componentes).
 */
export function calculateApuUnitCost(componentCosts: readonly DecimalString[]): DecimalString {
  return sumDecimals(componentCosts);
}

/**
 * Resuelve el `unitPriceSnapshot` de un componente a partir del precio aprobado
 * (cliente-safe) que entrega el {@link PricingReadPort}. Usa `budgetReferencePrice`
 * del `ApprovedPriceContext`. NO recalcula descuentos ni consulta tablas.
 *
 * @param port - Puerto de lectura de precios (inyectado).
 * @param resourceId - Recurso del componente.
 * @param estimateVersionId - Versión de presupuesto que congela el precio.
 * @returns `budgetReferencePrice` como `DecimalString` para usar de snapshot.
 * @throws ApprovedPriceNotFoundError | AmbiguousApprovedPriceError.
 */
export async function resolveUnitPriceSnapshot(
  port: PricingReadPort,
  resourceId: Uuid,
  estimateVersionId: Uuid,
): Promise<DecimalString> {
  const result = await port.getApprovedPrice({ resourceId, estimateVersionId });
  if (!result.ok) {
    throwOnPricingError(result.error);
  }
  return result.value.budgetReferencePrice;
}

/**
 * Costo de un componente APU resolviendo el precio vía {@link PricingReadPort}.
 * El precio congelado proviene de `budgetReferencePrice`.
 *
 * @param port - Puerto de lectura de precios.
 * @param params - Recurso, versión, cantidad y desperdicio del componente.
 * @returns Resultado del componente (incluye el `unitPriceSnapshot` resuelto).
 */
export async function calculateApuComponentWithPort(
  port: PricingReadPort,
  params: {
    componentType: ApuComponentType;
    resourceId: Uuid;
    estimateVersionId: Uuid;
    quantity: DecimalString;
    wastePct?: DecimalString;
  },
): Promise<ApuComponentResult & { unitPriceSnapshot: DecimalString }> {
  const unitPriceSnapshot = await resolveUnitPriceSnapshot(
    port,
    params.resourceId,
    params.estimateVersionId,
  );
  const totalComponentCost = calculateApuComponentCost({
    componentType: params.componentType,
    quantity: params.quantity,
    wastePct: params.wastePct ?? ZERO,
    unitPriceSnapshot,
  });
  return {
    componentType: params.componentType,
    unitPriceSnapshot,
    totalComponentCost,
  };
}
