/**
 * floating-workflow-dock.test.ts — V4.2.13 workflow companion flotante.
 * Stack node: checks de FUENTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const DOCK = read('../../../components/shared/floating-workflow-dock.tsx');
const LAYOUT = read('../../../app/(dashboard)/layout.tsx');

describe('V4.2.13 — FloatingWorkflowDock', () => {
  it('se auto-oculta en /dashboard (no duplica la barra grande)', () => {
    expect(DOCK).toMatch(/pathname\.startsWith\('\/dashboard'\)\)\s*return null/);
  });

  it('detecta el paso por ruta (específico → general, sin rutas inventadas)', () => {
    for (const r of ['/catalog/prices/review', '/catalog/monitoring', '/catalog/providers', '/catalog', '/quote', '/projects']) {
      expect(DOCK).toContain(r);
    }
    expect(DOCK).toContain("includes('/workspace')"); // workspace → cotizar/presupuesto activo
  });

  it('flotante fixed bottom + glass + minimizable persistente', () => {
    expect(DOCK).toMatch(/fixed bottom-4/);
    expect(DOCK).toContain('glass');
    expect(DOCK).toContain('iconic-workflow-dock-collapsed');
    expect(DOCK).toMatch(/Minimizar|Mostrar barra de flujo/);
  });

  it('no duplica el CTA del Asistente (primer nodo solo navega a /quote)', () => {
    expect(DOCK).not.toContain('quote-companion:open');
  });

  it('montado en el layout del dashboard', () => {
    expect(LAYOUT).toContain('<FloatingWorkflowDock');
    expect(LAYOUT).toContain("from '@/components/shared/floating-workflow-dock'");
  });
});
