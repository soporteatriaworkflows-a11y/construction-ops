/**
 * operations-shell.test.ts - Static regression checks for the shared operations shell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const HEADER = read('../../../components/shared/operations-header.tsx');
const KPI = read('../../../components/shared/kpi-card.tsx');

describe('componentes shell operativos', () => {
  it('OperationsHeader: command bar navy ICONIC con eyebrow cian (no dark mode global)', () => {
    expect(HEADER).toContain('from-iconic-primary');
    expect(HEADER).toContain('text-iconic-cyan');
    expect(HEADER).toContain('eyebrow');
    expect(HEADER).toContain('stat');
  });
  it('KpiCard: tonos por significado + compacto + opcional link/click', () => {
    for (const t of ['default', 'ok', 'warn', 'danger']) expect(KPI).toContain(`${t}:`);
    expect(KPI).toContain('export function KpiBand');
  });
  it('V4.1: OperationsHeaderAction (accion legible sobre navy)', () => {
    expect(HEADER).toContain('export function OperationsHeaderAction');
    expect(HEADER).toContain("variant === 'primary'");
    expect(HEADER).toContain('bg-white');
  });
});

describe('adopcion app-wide (identidad comun)', () => {
  const pages: Array<[string, string]> = [
    ['Detalle presupuesto', '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/page.tsx'],
    ['APU Library', '../../../app/(dashboard)/apu/page.tsx'],
    ['Catalogo', '../../../app/(dashboard)/catalog/page.tsx'],
    ['Cantidades', '../../../app/(dashboard)/quantities/_components/quantities-shell.tsx'],
    ['Cronograma', '../../../app/(dashboard)/planning/page.tsx'],
    ['Proyectos', '../../../app/(dashboard)/projects/page.tsx'],
    ['Accesos', '../../../app/(dashboard)/settings/access/page.tsx'],
    ['Detalle proyecto', '../../../app/(dashboard)/projects/[id]/page.tsx'],
    ['Detalle alcance', '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/page.tsx'],
    ['Indice presupuestos', '../../../app/(dashboard)/estimates/page.tsx'],
    ['Dashboard', '../../../app/(dashboard)/dashboard/page.tsx'],
  ];
  for (const [name, rel] of pages) {
    it(`${name} usa OperationsHeader`, () => {
      const src = read(rel);
      expect(src).toContain("from '@/components/shared/operations-header'");
      expect(src).toContain('<OperationsHeader');
    });
  }

  it('Detalle presupuesto, APU y Catalogo muestran banda de KPIs', () => {
    for (const rel of [
      '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/page.tsx',
      '../../../app/(dashboard)/apu/page.tsx',
      '../../../app/(dashboard)/catalog/page.tsx',
    ]) {
      expect(read(rel)).toContain('<KpiBand');
    }
  });
});
