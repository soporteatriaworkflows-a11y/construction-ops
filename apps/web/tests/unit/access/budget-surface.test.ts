/**
 * budget-surface.test.ts — V5.6.6B matriz de escritura de presupuesto.
 *
 * Contrato: docs/design-references/V5_6_6_ROLE_MATRIX.md.
 * admin/gerencia/presupuestos editan; compras/obra/consulta NO (deny también
 * para roles ausentes o desconocidos). compras conserva LECTURA de estimates
 * y su dominio de catálogo intacto: la restricción es de ESCRITURA.
 */
import { describe, expect, it } from 'vitest';
import {
  canEditBudgetSurface,
  canArchiveBudgetItems,
  canImportBudgetData,
  canViewIndirectCosts,
} from '@/server/access/budget-surface';
import { canAccessModule } from '@/server/access/module-access';

const GATES = [
  ['canEditBudgetSurface', canEditBudgetSurface],
  ['canArchiveBudgetItems', canArchiveBudgetItems],
  ['canImportBudgetData', canImportBudgetData],
  ['canViewIndirectCosts', canViewIndirectCosts],
] as const;

const EDITORS = ['admin', 'gerencia', 'presupuestos'];
const NON_EDITORS = ['compras', 'obra', 'consulta'];

describe('budget-surface (V5.6.6B)', () => {
  for (const [name, gate] of GATES) {
    it(`${name}: admin/gerencia/presupuestos permitidos`, () => {
      for (const role of EDITORS) expect(gate(role), role).toBe(true);
    });

    it(`${name}: compras/obra/consulta denegados`, () => {
      for (const role of NON_EDITORS) expect(gate(role), role).toBe(false);
    });

    it(`${name}: deny-by-default para rol ausente/desconocido`, () => {
      expect(gate(undefined)).toBe(false);
      expect(gate(null)).toBe(false);
      expect(gate('')).toBe(false);
      expect(gate('cliente')).toBe(false); // no existe como rol DB
      expect(gate('internal')).toBe(false); // ViewerRole, no profiles.role
    });
  }

  it('compras conserva la LECTURA: su dominio y projects siguen accesibles', () => {
    // La restricción V5.6.6B es de escritura de presupuesto; compras conserva
    // su dominio completo y llega al detalle del presupuesto vía el módulo
    // `projects` (la matriz V5.6.2 no lo lista en el módulo `estimates`).
    expect(canAccessModule('compras', 'catalog')).toBe(true);
    expect(canAccessModule('compras', 'price-intelligence')).toBe(true);
    expect(canAccessModule('compras', 'monitoring')).toBe(true);
    expect(canAccessModule('compras', 'projects')).toBe(true);
    expect(canAccessModule('compras', 'estimates')).toBe(false);
  });

  it('presupuestos conserva la escritura completa de presupuesto (sin regresión)', () => {
    expect(canEditBudgetSurface('presupuestos')).toBe(true);
    expect(canImportBudgetData('presupuestos')).toBe(true);
    expect(canArchiveBudgetItems('presupuestos')).toBe(true);
    expect(canViewIndirectCosts('presupuestos')).toBe(true);
  });
});
