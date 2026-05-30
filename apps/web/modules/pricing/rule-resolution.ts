/**
 * Resolución de reglas de precio con precedencia explícita — agent-pricing.
 *
 * Las reglas (`pricing_rules`) aplican por organización y por alcance:
 * `global` | `project` | `scope` | `resource` | `supplier_product`. Para una
 * consulta concreta puede haber varias reglas candidatas del mismo `ruleType`
 * (p. ej. dos descuentos: uno global y uno por producto). La precedencia
 * decide cuál gana, de forma determinista.
 *
 * Precedencia (de mayor a menor especificidad):
 *   supplier_product > resource > scope > project > global
 *
 * Desempate dentro del mismo nivel (determinismo):
 *   1. mayor `effectiveFrom` (la más reciente vigente),
 *   2. luego mayor `createdAt`,
 *   3. luego `id` lexicográfico (último recurso, estable).
 *
 * Una regla aplica solo si está activa y vigente a la fecha de corte (`asOf`).
 */
import type {
  DecimalString,
  IsoDateTime,
  PricingRuleScopeType,
  PricingRuleType,
  Uuid,
} from "@/lib/utils/types";

/** Forma mínima de una regla para la resolución (subset de PricingRule). */
export interface ResolvableRule {
  id: Uuid;
  ruleType: PricingRuleType;
  percentage: DecimalString | null;
  scopeType: PricingRuleScopeType;
  scopeReferenceId: Uuid | null;
  active: boolean;
  effectiveFrom: IsoDateTime | null;
  effectiveTo: IsoDateTime | null;
  createdAt: IsoDateTime;
}

/** Contexto de la consulta para evaluar el alcance de cada regla. */
export interface RuleResolutionContext {
  projectId?: Uuid;
  projectScopeId?: Uuid;
  resourceId?: Uuid;
  supplierProductId?: Uuid;
  /** fecha de corte de vigencia (default: ahora) */
  asOf?: IsoDateTime;
}

/** Especificidad numérica por `scopeType` (mayor = más específico). */
const SCOPE_PRECEDENCE: Record<PricingRuleScopeType, number> = {
  supplier_product: 5,
  resource: 4,
  scope: 3,
  project: 2,
  global: 1,
};

/** `true` si la regla está vigente a la fecha de corte. */
function isEffectiveAt(rule: ResolvableRule, asOfIso: string): boolean {
  const asOf = Date.parse(asOfIso);
  if (rule.effectiveFrom !== null && Date.parse(rule.effectiveFrom) > asOf) {
    return false;
  }
  if (rule.effectiveTo !== null && Date.parse(rule.effectiveTo) < asOf) {
    return false;
  }
  return true;
}

/** `true` si el alcance de la regla coincide con el contexto de la consulta. */
function matchesScope(
  rule: ResolvableRule,
  ctx: RuleResolutionContext,
): boolean {
  switch (rule.scopeType) {
    case "global":
      return true;
    case "project":
      return (
        ctx.projectId !== undefined &&
        rule.scopeReferenceId === ctx.projectId
      );
    case "scope":
      return (
        ctx.projectScopeId !== undefined &&
        rule.scopeReferenceId === ctx.projectScopeId
      );
    case "resource":
      return (
        ctx.resourceId !== undefined &&
        rule.scopeReferenceId === ctx.resourceId
      );
    case "supplier_product":
      return (
        ctx.supplierProductId !== undefined &&
        rule.scopeReferenceId === ctx.supplierProductId
      );
    default:
      return false;
  }
}

/**
 * Comparador determinista: ordena de MAYOR a menor prioridad.
 * Mayor especificidad de alcance, luego más reciente vigencia, luego más
 * reciente creación, luego `id` descendente (estable).
 */
function compareRules(a: ResolvableRule, b: ResolvableRule): number {
  const scopeDiff =
    SCOPE_PRECEDENCE[b.scopeType] - SCOPE_PRECEDENCE[a.scopeType];
  if (scopeDiff !== 0) return scopeDiff;

  const aFrom = a.effectiveFrom === null ? 0 : Date.parse(a.effectiveFrom);
  const bFrom = b.effectiveFrom === null ? 0 : Date.parse(b.effectiveFrom);
  if (aFrom !== bFrom) return bFrom - aFrom;

  const aCreated = Date.parse(a.createdAt);
  const bCreated = Date.parse(b.createdAt);
  if (aCreated !== bCreated) return bCreated - aCreated;

  // Estable: id lexicográfico descendente.
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Resuelve la regla ganadora de un `ruleType` dado, según precedencia.
 * Devuelve `null` si ninguna regla activa, vigente y de alcance coincidente
 * existe para ese tipo.
 */
export function resolveRule(
  rules: readonly ResolvableRule[],
  ruleType: PricingRuleType,
  ctx: RuleResolutionContext,
): ResolvableRule | null {
  const asOfIso = ctx.asOf ?? new Date().toISOString();

  const candidates = rules
    .filter((r) => r.ruleType === ruleType)
    .filter((r) => r.active)
    .filter((r) => isEffectiveAt(r, asOfIso))
    .filter((r) => matchesScope(r, ctx));

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort(compareRules);
  return sorted[0] ?? null;
}

/**
 * Resuelve el porcentaje (fracción) de un `ruleType`. Si no hay regla
 * aplicable, devuelve el `fallback` (default "0", sin efecto en las fórmulas).
 */
export function resolvePercentage(
  rules: readonly ResolvableRule[],
  ruleType: PricingRuleType,
  ctx: RuleResolutionContext,
  fallback: DecimalString = "0",
): DecimalString {
  const rule = resolveRule(rules, ruleType, ctx);
  if (rule === null || rule.percentage === null) return fallback;
  return rule.percentage;
}
