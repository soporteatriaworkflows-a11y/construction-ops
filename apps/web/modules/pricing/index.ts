/**
 * Punto de entrada público del módulo de precios — agent-pricing (Oleada 2A).
 *
 * Exporta los puertos congelados (`PricingReadPort`, `PricingApprovalPort`),
 * sus implementaciones, los tipos del contrato y la proyección de privacidad.
 * El subpaquete `adapters/` (homecenter, Oleada 2B) es propiedad de otro agente
 * y NO se reexporta aquí.
 */
export * from "./types";
export * from "./decimal";
export * from "./price-layers";
export * from "./privacy";
export * from "./rule-resolution";
export * from "./repository";
export * from "./in-memory-repository";
export * from "./read-service";
export * from "./approval-flow";
export * from "./approval-service";
