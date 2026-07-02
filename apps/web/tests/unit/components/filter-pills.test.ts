/**
 * filter-pills.test.ts - Static regression checks for the shared segmented control.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const PILLS = read('../../../components/shared/filter-pills.tsx');

describe('FilterPills', () => {
  it('es un segmented control con tokens ICONIC, role=group y aria-pressed', () => {
    expect(PILLS).toContain('role="group"');
    expect(PILLS).toContain('aria-pressed={value === o.value}');
    expect(PILLS).toContain('bg-iconic-primary');
    expect(PILLS).toContain('bg-iconic-ink');
    expect(PILLS).toContain('onClick={() => onChange(o.value)}');
  });
});

describe('adopcion', () => {
  it('Workspace usa FilterPills para Estado y APU (sin perder los filtros)', () => {
    const ws = read('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx');
    expect(ws).toContain("from '@/components/shared/filter-pills'");
    expect(ws).toMatch(/label="Estado"/);
    expect(ws).toMatch(/label="APU"/);
    expect(ws).toContain('setApuFilter(v as ApuLinkFilter)');
    expect(ws).toContain('setFilter(v as WorkspaceFilter)');
  });

  it('Cantidades usa tabs con estilo de FilterPills para Mediciones, Memorias importadas y Sincronizacion', () => {
    const quantities = read('../../../app/(dashboard)/quantities/_components/quantities-shell.tsx');
    expect(quantities).toContain('Mediciones');
    expect(quantities).toContain('Memorias importadas');
    expect(quantities).toContain('Sincronización');
    expect(quantities).toContain('bg-iconic-primary text-white');
    expect(quantities).toContain("aria-current={active ? 'page' : undefined}");
  });

  it('Catalogo usa FilterPills para el estado de precio', () => {
    const cat = read('../../../app/(dashboard)/catalog/catalog-explorer.tsx');
    expect(cat).toContain("from '@/components/shared/filter-pills'");
    expect(cat).toContain('<FilterPills');
    expect(cat).toContain('onChange={setStatus}');
  });
});
