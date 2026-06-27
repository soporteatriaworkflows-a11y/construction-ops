/**
 * theme-modes.test.ts — Base de tema claro/oscuro (ICONIC_OPS_UIX_THEME_MODES_V4_2).
 * Stack node: checks de FUENTE (no DOM).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('fundación de tema', () => {
  it('tailwind: darkMode por clase + tokens semánticos', () => {
    const tw = read('../../../tailwind.config.ts');
    expect(tw).toContain("darkMode: 'class'");
    for (const t of ['app', 'surface', 'surface-soft', 'surface-muted', 'line', 'content', 'content-muted']) {
      expect(tw).toMatch(new RegExp(`['"]?${t.replace(/-/g, '\\-')}['"]?:\\s*'var\\(--c-`));
    }
  });

  it('globals: tokens :root (light) y .dark (dark) sin negro puro', () => {
    const css = read('../../../app/globals.css');
    expect(css).toMatch(/:root[\s\S]*--c-app:\s*#f5f6f8/i); // light off-white (V4.2.5)
    expect(css).toMatch(/\.dark[\s\S]*--c-app:\s*#0c0d10/i); // dark graphite neutro (V4.2.5), NO #000
    expect(css).not.toMatch(/--c-app:\s*#000000/i);
    expect(css).toContain('.dark .ag-theme-alpine'); // tablas AG legibles en dark
  });

  it('ThemeProvider: persistencia + script anti-FOUC + sin morado', () => {
    const tp = read('../../../components/shared/theme-provider.tsx');
    expect(tp).toContain('iconic-theme'); // localStorage key
    expect(tp).toContain('THEME_INIT_SCRIPT'); // anti-FOUC
    expect(tp).toContain("classList.toggle('dark'");
  });

  it('ThemeToggle: Claro/Oscuro/Sistema accesible', () => {
    const tt = read('../../../components/shared/theme-toggle.tsx');
    for (const l of ['Claro', 'Oscuro', 'Sistema']) expect(tt).toContain(l);
    expect(tt).toContain('aria-pressed');
  });

  it('root layout: script inline + ThemeProvider + suppressHydrationWarning', () => {
    const layout = read('../../../app/layout.tsx');
    expect(layout).toContain('THEME_INIT_SCRIPT');
    expect(layout).toContain('<ThemeProvider>');
    expect(layout).toContain('suppressHydrationWarning');
  });

  it('V4.2.1: capa central de cobertura dark (remapeo de utilidades planas)', () => {
    const css = read('../../../app/globals.css');
    expect(css).toContain('.dark .bg-white { background-color: var(--c-surface); }');
    expect(css).toMatch(/\.dark \.text-gray-700[\s\S]*var\(--c-content\)/);
    expect(css).toContain('.dark .border-gray-200');
    // estados sobrios en dark
    expect(css).toMatch(/\.dark \.bg-amber-50/);
    // NO negro puro como fondo
    expect(css).not.toMatch(/background-color:\s*#000(000)?\b/i);
  });

  it('V4.2.1: Workspace con variantes dark en zonas con opacidad (selección/filas/paneles)', () => {
    const ws = read('../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx');
    expect(ws).toContain('dark:bg-surface-soft'); // filas capítulo / placeholder
    expect(ws).toContain('dark:bg-surface-muted'); // selección / hover
    expect(ws).toContain('dark:from-surface'); // paneles con gradiente
  });

  it('OperationsHeaderAction primary NO usa bg-white plano (no lo remapea la capa dark)', () => {
    const h = read('../../../components/shared/operations-header.tsx');
    expect(h).toContain('bg-iconic-white');
  });

  it('primitivos theme-aware (dark: variants), light intacto', () => {
    expect(read('../../../components/ui/card.tsx')).toContain('dark:bg-surface');
    expect(read('../../../components/ui/input.tsx')).toContain('dark:bg-surface');
    expect(read('../../../components/ui/badge.tsx')).toContain('dark:');
    expect(read('../../../components/shared/kpi-card.tsx')).toContain('dark:');
    expect(read('../../../components/shared/account-menu.tsx')).toContain('<ThemeToggle');
  });
});
