/**
 * modules/apu — Punto de entrada del subdominio APU + primitivas decimales y
 * frontera de precios. Propiedad: agent-cost-domain.
 *
 * Exporta funciones PURAS de cálculo y tipos para que otros módulos
 * (frontend-boq, dashboard, exports) las consuman. NO duplicar estas fórmulas
 * en frontend: ésta es la única fuente de verdad.
 */

export * from './decimal';
export * from './pricing-port';
export * from './labor';
export * from './apu';
