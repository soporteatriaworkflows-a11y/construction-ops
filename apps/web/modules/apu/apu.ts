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
import {
  DomainDecimal,
  type DomainDecimalInstance,
  toDecimal,
  toDecimalString,
  sumDecimals,
  ZERO,
} from './decimal';
import { type PricingReadPort, throwOnPricingError } from './pricing-port';
import { calculateLaborCost, type LaborRoleFactors } from './labor';

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

/* ----------------------------------------------------------------------------
 * FASE 4B.1 — Fundamento trazable del costo APU
 * (docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §5, §6, §9)
 * ------------------------------------------------------------------------- */

/** Integrante de una cuadrilla: cantidad de personas de un rol y su costo. */
export interface CrewMemberInput {
  /** Rol salarial del integrante (trazabilidad). */
  laborRoleId?: Uuid;
  /** Cantidad de integrantes de este rol (p. ej. "2" ayudantes). No negativa. */
  count: DecimalString;
  /** Costo unitario del rol (hora o día, según la base usada). No negativo. */
  unitCost: DecimalString;
}

/**
 * Calcula el subtotal laboral de una CUADRILLA como suma de integrantes:
 *   costo_cuadrilla = Σ(cantidad_integrantes × costo_por_rol)
 * Función PURA, sin redondeo intermedio.
 *
 * @param members - Integrantes (rol, cantidad, costo unitario del rol).
 * @returns Subtotal laboral de la cuadrilla como `DecimalString`.
 * @throws Error si alguna cantidad o costo es negativo.
 */
export function calculateCrewLaborCost(members: readonly CrewMemberInput[]): DecimalString {
  let total = new DomainDecimal(0);
  for (const m of members) {
    const count = toDecimal(m.count);
    const cost = toDecimal(m.unitCost);
    if (count.isNegative() || cost.isNegative()) {
      throw new Error(
        `integrante de cuadrilla inválido: count=${count.toFixed()} unitCost=${cost.toFixed()}`,
      );
    }
    total = total.plus(count.times(cost));
  }
  return toDecimalString(total);
}

/**
 * Construye un componente de M.O. TRAZABLE para una cuadrilla, a partir del
 * rol salarial y el rendimiento. Falla seguro: exige `laborRoleId` (los flujos
 * nuevos NUNCA crean componentes labor sin vínculo al rol).
 *
 * Encoding congelado (contrato §5): `quantity = rendimiento_días × integrantes`
 * y `unit_price_snapshot = costo_diario_integral` del rol (congelado aquí).
 *
 * @param params - Rol (id + factores), rendimiento en días/unidad e integrantes.
 * @returns Componente labor listo para persistir (snapshot + total derivados).
 * @throws Error si falta `laborRoleId` o el rendimiento/integrantes son negativos.
 */
export function buildCrewLaborComponent(params: {
  laborRoleId: Uuid;
  role: LaborRoleFactors;
  /** Rendimiento en días del rol por unidad de actividad (p. ej. "0.2"). */
  performanceDays: DecimalString;
  /** Integrantes de este rol en la cuadrilla (p. ej. "2"). */
  memberCount: DecimalString;
}): {
  laborRoleId: Uuid;
  componentType: 'labor';
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSource: 'labor_role';
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
} {
  if (!params.laborRoleId) {
    throw new Error(
      'componente de mano de obra sin labor_role_id: los flujos nuevos exigen vínculo al rol salarial',
    );
  }
  const days = toDecimal(params.performanceDays);
  const count = toDecimal(params.memberCount);
  if (days.isNegative() || count.isNegative()) {
    throw new Error('performanceDays y memberCount no pueden ser negativos');
  }
  const dailyCost = calculateLaborCost(params.role).dailyIntegralCost;
  const quantity = toDecimalString(days.times(count));
  const totalComponentCost = calculateApuComponentCost({
    componentType: 'labor',
    quantity,
    wastePct: ZERO,
    unitPriceSnapshot: dailyCost,
  });
  return {
    laborRoleId: params.laborRoleId,
    componentType: 'labor',
    quantity,
    wastePct: ZERO,
    unitPriceSource: 'labor_role',
    unitPriceSnapshot: dailyCost,
    totalComponentCost,
  };
}

/** Costo ya calculado de un componente, clasificado por tipo. */
export interface ApuComponentCostEntry {
  componentType: ApuComponentType;
  /** Costo total del componente (derivado server-side; NUNCA del navegador). */
  totalComponentCost: DecimalString;
}

/** Desglose por tipo del costo unitario completo de un APU. */
export interface ApuUnitCostBreakdown {
  materials: DecimalString;
  labor: DecimalString;
  equipment: DecimalString;
  /** Herramienta EXPLÍCITA (filas `tool`) + herramienta DERIVADA. */
  tools: DecimalString;
  /** Solo la herramienta derivada = defaultToolPct × labor. */
  toolDerived: DecimalString;
  subcontract: DecimalString;
  other: DecimalString;
  /** Suma de todos los componentes + herramienta derivada. */
  total: DecimalString;
}

/**
 * Calcula el costo unitario COMPLETO de un APU con herramienta menor derivada:
 *   total = Σ(componentes) + defaultToolPct × Σ(componentes labor)
 *
 * Retrocompatible: con `defaultToolPct = "0"` reproduce EXACTAMENTE
 * `calculateApuUnitCost` sobre los mismos componentes. Las filas `tool`
 * explícitas existentes se suman con su costo persistido (regla canónica);
 * la herramienta derivada NO existe como fila (contrato §6).
 *
 * @param components - Componentes con tipo y costo calculado server-side.
 * @param defaultToolPct - Fracción [0,1] de herramienta sobre la M.O.
 * @returns Desglose por tipo + total como `DecimalString`.
 * @throws Error si `defaultToolPct` está fuera de [0,1] o algún costo es negativo.
 */
export function calculateApuUnitCostFull(
  components: readonly ApuComponentCostEntry[],
  defaultToolPct: DecimalString = ZERO,
): ApuUnitCostBreakdown {
  const pct = toDecimal(defaultToolPct);
  if (pct.isNegative() || pct.greaterThan(1)) {
    throw new Error(
      `default_tool_pct fuera de rango [0,1]: ${pct.toFixed()} (es una fracción, p. ej. "0.05")`,
    );
  }

  const sums: Record<ApuComponentType, DomainDecimalInstance> = {
    material: new DomainDecimal(0),
    labor: new DomainDecimal(0),
    equipment: new DomainDecimal(0),
    tool: new DomainDecimal(0),
    subcontract: new DomainDecimal(0),
    other: new DomainDecimal(0),
  };
  for (const c of components) {
    const cost = toDecimal(c.totalComponentCost);
    if (cost.isNegative()) {
      throw new Error(`totalComponentCost no puede ser negativo: ${cost.toFixed()}`);
    }
    sums[c.componentType] = sums[c.componentType].plus(cost);
  }

  const toolDerived = toDecimal(
    calculateToolComponentCost(toDecimalString(pct), toDecimalString(sums.labor)),
  );
  const total = sums.material
    .plus(sums.labor)
    .plus(sums.equipment)
    .plus(sums.tool)
    .plus(sums.subcontract)
    .plus(sums.other)
    .plus(toolDerived);

  return {
    materials: toDecimalString(sums.material),
    labor: toDecimalString(sums.labor),
    equipment: toDecimalString(sums.equipment),
    tools: toDecimalString(sums.tool.plus(toolDerived)),
    toolDerived: toDecimalString(toolDerived),
    subcontract: toDecimalString(sums.subcontract),
    other: toDecimalString(sums.other),
    total: toDecimalString(total),
  };
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
