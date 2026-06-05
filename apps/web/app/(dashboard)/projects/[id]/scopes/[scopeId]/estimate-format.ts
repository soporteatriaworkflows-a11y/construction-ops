/**
 * estimate-format.ts — Formato de etiqueta de versión de presupuesto (4B.3).
 * Propiedad: agent-frontend-boq. Función pura, sin dependencias de servidor.
 */

/** Etiqueta visual de versión: 1 ⇒ `V01`, 12 ⇒ `V12`. */
export function formatVersionLabel(versionNumber: number): string {
  return `V${String(versionNumber).padStart(2, '0')}`;
}
