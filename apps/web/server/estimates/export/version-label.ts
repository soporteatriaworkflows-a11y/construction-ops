/**
 * version-label.ts — Etiqueta de versión para el export (4E.1). PURA.
 * Espejo server-side de `formatVersionLabel`: 1 ⇒ `V01`, 12 ⇒ `V12`.
 */
export function versionLabel(versionNumber: number): string {
  return `V${String(versionNumber).padStart(2, '0')}`;
}
