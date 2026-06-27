/**
 * typography-system.test.ts — V4.2.4 sistema tipográfico (skill-guided).
 * Stack node: checks de FUENTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('V4.2.4 — tipografía deliberada (self-hosted, next/font)', () => {
  it('layout carga Inter (cuerpo) + Space Grotesk (display) + JetBrains Mono (datos)', () => {
    const layout = read('../../../app/layout.tsx');
    expect(layout).toContain('next/font/google');
    expect(layout).toMatch(/Inter|Space_Grotesk|JetBrains_Mono/);
    expect(layout).toContain('Space_Grotesk');
    expect(layout).toContain('--font-display');
  });

  it('tailwind expone font-display (var) además de sans/mono', () => {
    const tw = read('../../../tailwind.config.ts');
    expect(tw).toMatch(/display:\s*\[['"]var\(--font-display\)/);
    expect(tw).toMatch(/sans:\s*\[['"]var\(--font-inter\)/);
  });

  it('cifras-héroe y títulos usan font-display (OperationsHeader, KpiCard, dashboard, workspace)', () => {
    expect(read('../../../components/shared/operations-header.tsx')).toContain('font-display');
    expect(read('../../../components/shared/kpi-card.tsx')).toContain('font-display');
    expect(read('../../../app/(dashboard)/dashboard/page.tsx')).toContain('font-display');
    expect(read('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx')).toContain('font-display');
  });

  it('quality floor: prefers-reduced-motion respetado', () => {
    expect(read('../../../app/globals.css')).toContain('prefers-reduced-motion');
  });
});
