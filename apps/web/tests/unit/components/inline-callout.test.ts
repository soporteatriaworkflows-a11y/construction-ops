/**
 * inline-callout.test.ts - Static regression checks for InlineCallout adoption.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const CALLOUT = read('../../../components/shared/inline-callout.tsx');

describe('InlineCallout', () => {
  it('expone los 4 tonos con tokens ICONIC (sin librerias nuevas)', () => {
    for (const tone of ['tip', 'info', 'warning', 'success']) {
      expect(CALLOUT).toContain(`${tone}:`);
    }
    expect(CALLOUT).toContain('iconic');
    expect(CALLOUT).toContain('role="note"');
  });
});

describe('adopcion en modulos prioritarios', () => {
  const modules: Array<[string, string]> = [
    ['Workspace', '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx'],
    ['Precios', '../../../app/(dashboard)/catalog/prices/review/page.tsx'],
    ['Cantidades', '../../../app/(dashboard)/quantities/_components/quantities-shell.tsx'],
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
