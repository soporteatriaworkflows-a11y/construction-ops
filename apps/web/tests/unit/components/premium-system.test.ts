/**
 * premium-system.test.ts — V4.2.3 iconografía + glass + botones táctiles.
 * Stack node: checks de FUENTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('V4.2.3 — sistema visual premium', () => {
  it('capa de iconografía central con estados (IconicIcon + IconChip)', () => {
    const ico = read('../../../components/shared/iconic-icon.tsx');
    expect(ico).toContain('export function IconicIcon');
    expect(ico).toContain('export function IconChip');
    for (const t of ['active', 'muted', 'success', 'warning', 'danger']) expect(ico).toContain(`${t}:`);
  });

  it('globals: trazo monoline 1.75 + utilidades glass (claro/oscuro)', () => {
    const css = read('../../../app/globals.css');
    expect(css).toMatch(/svg\.lucide[\s\S]*stroke-width:\s*1\.75px/);
    expect(css).toContain('.glass {');
    expect(css).toContain('.dark .glass');
  });

  it('Button: táctil (active:scale) + secundario frosted + variantes dark', () => {
    const btn = read('../../../components/ui/button.tsx');
    expect(btn).toContain('active:scale-[0.98]');
    expect(btn).toContain('backdrop-blur'); // outline glass
    expect(btn).toContain('dark:');
  });

  it('AppRail glass/dock + nav y CTA con pressed state', () => {
    const rail = read('../../../components/shared/app-rail.tsx');
    expect(rail).toContain('glass-navy');
    expect(rail).toContain('active:scale-[0.98]'); // CTA Asistente táctil
    const nav = read('../../../components/shared/sidebar-nav.tsx');
    expect(nav).toContain('active:scale-[0.97]');
  });

  it('Dashboard usa IconChip (iconografía consistente, sin formas decorativas)', () => {
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).toContain('IconChip');
    expect(dash).not.toContain('rounded-full bg-iconic-cyan/10'); // círculo decorativo eliminado en V4.2.2
  });

  it('V4.2.5: dashboard editorial (DashMetric, sin mega-hero navy con gradiente)', () => {
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).toContain('DashMetric'); // tira de métricas plana
    expect(dash).not.toContain("background: 'linear-gradient(180deg, #050a32"); // mega-hero navy eliminado
    expect(dash).not.toContain('CommandStat'); // mini-cards navy eliminadas del hero
  });

  it('V4.2.5: dark mode graphite neutro (no navy saturado de base)', () => {
    const css = read('../../../app/globals.css');
    expect(css).toMatch(/\.dark[\s\S]*--c-surface:\s*#16171b/i); // superficie graphite, no navy
    expect(css).toMatch(/\.dark[\s\S]*--c-line:\s*#292b32/i); // hairline neutro
  });
});
