/**
 * modules/boq — Punto de entrada del subdominio BOQ + costos indirectos.
 * Propiedad: agent-cost-domain.
 *
 * Funciones PURAS (BOQ ítem/capítulo/directos, AIU/IVA, total, valor m²) y sus
 * tipos. Única fuente de verdad de los totales de presupuesto; NO duplicar en
 * frontend.
 */

export * from './boq';
export * from './indirect';
