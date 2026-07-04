/**
 * budget-surface.ts — gates de ESCRITURA de la superficie de presupuesto por
 * rol de perfil (V5.6.6B_ROLE_MATRIX_AND_COMPRAS_WRITE_SURFACE_HARDENING).
 *
 * Contrato: docs/design-references/V5_6_6_ROLE_MATRIX.md.
 *
 * Motivación: el ViewerRole colapsa admin/presupuestos/compras en `internal`,
 * así que los gates por ViewerRole no distinguen a `compras`. Estos helpers
 * operan sobre `profiles.role` (acarreado como `profileRole` en el viewer):
 *  - `compras` es rol de catálogo/proveedores/monitoreo: NO edita presupuesto,
 *    capítulos, BOQ ni AIU/costos indirectos (tampoco los VE: dato sensible
 *    de margen). Sí consulta cantidades, valores unitarios y subtotales.
 *  - `obra` edita cantidades/cronograma en su propio módulo, NO estas
 *    superficies de presupuesto.
 *  - `consulta` es solo lectura client-safe.
 *
 * Son 4 nombres separados A PROPÓSITO: el contrato por acción puede divergir
 * en fases futuras (V5.6.6C grants internos, V5.6.6D auditoría) sin re-cablear
 * páginas. Deny-by-default: rol ausente/desconocido ⇒ false.
 *
 * NOTA: no gobierna aprobar/emitir versiones (queda como hoy; la restricción
 * de publicación a admin/gerencia se decide en la matriz, fase futura).
 *
 * Puro y sin dependencias server-only: importable por páginas y actions.
 */

const BUDGET_EDITOR_ROLES = ['admin', 'gerencia', 'presupuestos'] as const;

function isBudgetEditor(profileRole: string | null | undefined): boolean {
  if (!profileRole) return false;
  return (BUDGET_EDITOR_ROLES as readonly string[]).includes(profileRole);
}

/** ¿Puede editar la superficie de presupuesto (capítulos, ítems, BOQ, AIU)? */
export function canEditBudgetSurface(profileRole: string | null | undefined): boolean {
  return isBudgetEditor(profileRole);
}

/** ¿Puede archivar capítulos/ítems/versiones del presupuesto? */
export function canArchiveBudgetItems(profileRole: string | null | undefined): boolean {
  return isBudgetEditor(profileRole);
}

/** ¿Puede importar datos al presupuesto (workbook/memorias)? */
export function canImportBudgetData(profileRole: string | null | undefined): boolean {
  return isBudgetEditor(profileRole);
}

/**
 * ¿Puede VER AIU y costos indirectos? (dato interno de margen: compras/obra/
 * consulta no lo ven; los totales generales del presupuesto siguen visibles).
 */
export function canViewIndirectCosts(profileRole: string | null | undefined): boolean {
  return isBudgetEditor(profileRole);
}
