/**
 * inline-callout.test.ts — Anti-regresión del callout compartido y su adopción
 * (ICONIC_OPS_UIX_VISUAL_SYSTEM_ROLLOUT_V1). Stack node: checks de FUENTE
 * (presentacional, sin jsdom). Verifica tonos + que los módulos prioritarios lo
 * usan, sin cambiar lógica.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const CALLOUT = read('../../../components/shared/inline-callout.tsx');

describe('InlineCallout', () => {
  it('expone los 4 tonos con tokens ICONIC (sin librerías nuevas)', () => {
    for (const tone of ['tip', 'info', 'warning', 'success']) {
      expect(CALLOUT).toContain(`${tone}:`);
    }
    expect(CALLOUT).toContain('iconic'); // usa tokens ICONIC
    expect(CALLOUT).toContain("role=\"note\"");
  });
});

describe('adopción en módulos prioritarios', () => {
  const modules: Array<[string, string]> = [
    ['Workspace', '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx'],
    ['Precios', '../../../app/(dashboard)/catalog/prices/review/page.tsx'],
    ['Cantidades', '../../../app/(dashboard)/quantities/page.tsx'],
    ['Cronograma', '../../../app/(dashboard)/planning/page.tsx'],
    ['Accesos', '../../../app/(dashboard)/settings/access/page.tsx'],
  ];
  for (const [name, rel] of modules) {
    it(`${name} usa InlineCallout`, () => {
      const src = read(rel);
      expect(src).toContain("from '@/components/shared/inline-callout'");
      expect(src).toContain('<InlineCallout');
    });
  }

  it('Workspace incluye la ayuda "Sin APU"', () => {
    const ws = read('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx');
    expect(ws).toMatch(/Sin APU/);
  });
});
