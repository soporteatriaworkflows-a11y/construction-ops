/**
 * compras-budget-surface-static.test.ts — V5.6.6B wiring del gate de
 * escritura de presupuesto.
 *
 * Regresión ESTÁTICA (fs+regex, sin renderizado): fija que (a) las páginas de
 * edición del presupuesto combinan el gate de entorno con el gate de rol,
 * (b) las server actions mutadoras repiten el check tras resolver el viewer
 * (backstop: la UI oculta, el server niega), (c) la sección AIU del detalle
 * se gatea con canViewIndirectCosts y (d) el viewer acarrea profileRole.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const EST = join(
  WEB, 'app', '(dashboard)', 'projects', '[id]', 'scopes', '[scopeId]',
  'estimates', '[estimateId]',
);

const read = (p: string): string => readFileSync(p, 'utf8');

const GATED_PAGES: Array<[string, RegExp]> = [
  [join(EST, 'page.tsx'), /canEditBudgetSurface|canImportBudgetData/],
  [join(EST, 'chapters', '[chapterId]', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'chapters', 'new', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'chapters', '[chapterId]', 'edit', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'chapters', '[chapterId]', 'items', 'new', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'chapters', '[chapterId]', 'items', '[itemId]', 'edit', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'workspace', 'page.tsx'), /canEditBudgetSurface/],
  [join(EST, 'import', 'page.tsx'), /canImportBudgetData/],
];

const GUARDED_ACTIONS: Array<[string, RegExp]> = [
  [join(EST, 'chapter-actions.ts'), /canEditBudgetSurface\(/],
  [join(EST, 'item-actions.ts'), /canEditBudgetSurface\(/],
  [join(EST, 'aiu-actions.ts'), /canEditBudgetSurface\(/],
  [join(EST, 'version-actions.ts'), /canEditBudgetSurface\(/],
  [join(EST, 'archive-actions.ts'), /canArchiveBudgetItems\(/],
  [join(EST, 'import', 'actions.ts'), /canImportBudgetData\(/],
  [join(EST, 'workspace', 'boq-add-actions.ts'), /canEditBudgetSurface\(/],
  [join(WEB, 'app', '(dashboard)', 'apu', '_components', 'link-to-boq-actions.ts'), /canEditBudgetSurface\(/],
];

describe('páginas: gate de entorno + gate de rol (V5.6.6B)', () => {
  for (const [path, gate] of GATED_PAGES) {
    it(`usa gate de rol y conserva isCreationModeEnabled: ${path.split('estimates')[1] ?? path}`, () => {
      const src = read(path);
      expect(src).toMatch(gate);
      expect(src).toMatch(/isCreationModeEnabled/);
    });
  }

  it('la sección AIU del detalle se gatea con canViewIndirectCosts', () => {
    const src = read(join(EST, 'page.tsx'));
    expect(src).toMatch(/canViewIndirectCosts/);
  });
});

describe('server actions: backstop de rol tras resolver el viewer', () => {
  for (const [path, guard] of GUARDED_ACTIONS) {
    it(`guard presente: ${path.split('(dashboard)')[1] ?? path}`, () => {
      const src = read(path);
      expect(src).toMatch(guard);
      expect(src).toMatch(/resolveAuthenticatedViewer/);
    });
  }
});

describe('viewer acarrea profileRole (aditivo, role-map intacto)', () => {
  it('resolveAuthenticatedViewer y toViewerContext acarrean profileRole', () => {
    const src = read(join(WEB, 'server', 'auth', 'resolve-viewer.ts'));
    const matches = src.match(/profileRole/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('role-map.ts NO cambió su mapeo congelado', () => {
    const src = read(join(WEB, 'server', 'auth', 'role-map.ts'));
    expect(src).toMatch(/compras: 'internal'/);
    expect(src).toMatch(/consulta: 'client'/);
    expect(src).toMatch(/presupuestos: 'internal'/);
    // Sin import del helper nuevo: el mapeo NO depende de budget-surface.
    expect(src).not.toMatch(/budget-surface/);
  });
});
