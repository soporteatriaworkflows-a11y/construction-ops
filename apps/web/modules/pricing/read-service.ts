/**
 * Servicio de lectura de precios — implementa `PricingReadPort` (Oleada 2A).
 *
 * `getApprovedPrice` resuelve, de forma DETERMINISTA y SOLO LECTURA, un único
 * `ApprovedPriceContext` aprobado para un recurso a una fecha de corte, o un
 * error de dominio explícito:
 * - `no_approved_price`: no hay observación aprobada vigente.
 * - `ambiguous_price`: hay varios productos de proveedor con observación
 *   aprobada vigente y la consulta no desambigua (no se inventa un precio).
 *
 * Resolución (determinista):
 * 1. Filtra observaciones aprobadas del recurso, observadas en o antes de `asOf`
 *    (y por proveedor/producto si la consulta lo especifica).
 * 2. Para cada `supplierProductId` toma su observación aprobada más reciente
 *    (varias observaciones del MISMO producto no son ambiguas: gana la última).
 * 3. Si quedan ≥2 productos distintos ⇒ `ambiguous_price` (candidatos ordenados).
 * 4. Si queda 1 ⇒ deriva capas con las reglas vigentes y arma el contexto.
 *
 * Las fórmulas Q8 las calcula `derivePriceLayers` (fuente única). cost-domain
 * NO recalcula.
 */
import type { IsoDateTime, Uuid } from "@/lib/utils/types";

import { derivePriceLayers } from "./price-layers";
import type {
  PriceObservationRecord,
  PricingRepository,
  SupplierProductRecord,
} from "./repository";
import { resolvePercentage } from "./rule-resolution";
import type {
  ApprovedPriceContext,
  PricingCandidateRef,
  PricingReadPort,
  PricingReadQuery,
  PricingReadResult,
} from "./types";

export interface ReadServiceConfig {
  /** organización del contexto (para cargar reglas). */
  organizationId: Uuid;
  /**
   * Variación preventiva por defecto si no hay regla aplicable.
   * Default "0.03" (3 %) — configurable; NO hardcodeado en las fórmulas.
   */
  defaultPreventiveVariationPct?: string;
}

export class PricingReadService implements PricingReadPort {
  constructor(
    private readonly repo: PricingRepository,
    private readonly config: ReadServiceConfig,
  ) {}

  async getApprovedPrice(
    query: PricingReadQuery,
  ): Promise<PricingReadResult> {
    const asOf: IsoDateTime = query.asOf ?? new Date().toISOString();

    // 1. Observaciones aprobadas, del recurso, vigentes a la fecha de corte.
    const observations = await this.repo.queryObservations({
      resourceId: query.resourceId,
      supplierId: query.supplierId,
      supplierProductId: query.supplierProductId,
      approvedOnly: true,
      observedAtOrBefore: asOf,
    });

    if (observations.length === 0) {
      return {
        ok: false,
        error: {
          kind: "no_approved_price",
          resourceId: query.resourceId,
          ...(query.asOf !== undefined ? { asOf: query.asOf } : {}),
        },
      };
    }

    // 2. Agrupar por producto; quedarse con la observación aprobada más reciente
    //    de cada producto (orden determinista: observedAt desc, luego id desc).
    const latestByProduct = new Map<Uuid, PriceObservationRecord>();
    for (const obs of observations) {
      const current = latestByProduct.get(obs.supplierProductId);
      if (current === undefined || isMoreRecent(obs, current)) {
        latestByProduct.set(obs.supplierProductId, obs);
      }
    }

    // 3. ¿Ambigüedad entre productos distintos?
    if (latestByProduct.size > 1) {
      const candidates: PricingCandidateRef[] = [...latestByProduct.values()]
        .sort(byObservedAtDescThenId)
        .map((o) => ({
          supplierProductId: o.supplierProductId,
          observedAt: o.observedAt,
          sourceType: o.sourceType,
        }));
      return {
        ok: false,
        error: {
          kind: "ambiguous_price",
          resourceId: query.resourceId,
          candidates,
        },
      };
    }

    // 4. Único producto resoluble → armar el contexto aprobado.
    const chosen = [...latestByProduct.values()][0];
    if (chosen === undefined) {
      return {
        ok: false,
        error: {
          kind: "no_approved_price",
          resourceId: query.resourceId,
          ...(query.asOf !== undefined ? { asOf: query.asOf } : {}),
        },
      };
    }

    const product = await this.repo.getSupplierProduct(
      chosen.supplierProductId,
    );
    if (product === null) {
      // El producto referenciado por la observación no existe: trato como
      // ausencia de precio aprobado (no se inventa).
      return {
        ok: false,
        error: {
          kind: "no_approved_price",
          resourceId: query.resourceId,
          ...(query.asOf !== undefined ? { asOf: query.asOf } : {}),
        },
      };
    }

    const context = await this.buildContext(chosen, product, query, asOf);
    return { ok: true, value: context };
  }

  /** Arma el `ApprovedPriceContext` derivando capas con las reglas vigentes. */
  private async buildContext(
    observation: PriceObservationRecord,
    product: SupplierProductRecord,
    query: PricingReadQuery,
    asOf: IsoDateTime,
  ): Promise<ApprovedPriceContext> {
    const rules = await this.repo.listPricingRules(this.config.organizationId);

    const ruleCtx = {
      projectId: query.projectId,
      projectScopeId: query.projectScopeId,
      resourceId: query.resourceId,
      supplierProductId: product.id,
      asOf,
    };

    const preventiveVariationPct = resolvePercentage(
      rules,
      "preventive_variation",
      ruleCtx,
      this.config.defaultPreventiveVariationPct ?? "0.03",
    );
    const negotiatedDiscountPct = resolvePercentage(
      rules,
      "negotiated_discount",
      ruleCtx,
      "0",
    );

    const layers = derivePriceLayers({
      onlinePublicPrice: observation.observedPrice,
      preventiveVariationPct,
      negotiatedDiscountPct,
    });

    const context: ApprovedPriceContext = {
      resourceId: query.resourceId,
      supplierProductId: product.id,
      currency: product.currency,
      observedAt: observation.observedAt,
      // La observación aprobada lleva el aprobador; el timestamp de aprobación
      // efectivo no se persiste por separado en el esquema v1 ⇒ se usa el
      // `createdAt` de la observación aprobada como mejor referencia de momento
      // de aprobación disponible (ver supuesto en el reporte).
      approvedAt: observation.createdAt,
      sourceType: observation.sourceType,
      onlinePublicPrice: observation.observedPrice,
      preventiveVariationPct,
      budgetReferencePrice: layers.budgetReferencePrice,
      negotiatedDiscountPct,
      expectedPurchasePrice: layers.expectedPurchasePrice,
      projectedSaving: layers.projectedSaving,
      manualOverride: product.manualOverride,
    };

    if (observation.sourceReference != null) {
      context.sourceReference = observation.sourceReference;
    }

    return context;
  }
}

/** `true` si `a` es más reciente que `b` (observedAt, luego id como desempate). */
function isMoreRecent(
  a: PriceObservationRecord,
  b: PriceObservationRecord,
): boolean {
  const ta = Date.parse(a.observedAt);
  const tb = Date.parse(b.observedAt);
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

/** Orden determinista: observedAt desc, luego id desc. */
function byObservedAtDescThenId(
  a: PriceObservationRecord,
  b: PriceObservationRecord,
): number {
  const diff = Date.parse(b.observedAt) - Date.parse(a.observedAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
