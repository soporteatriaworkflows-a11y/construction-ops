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
    expect(css).toMatch(/:root[\s\S]*--c-app:\s*#f2f4f7/i);
    expect(css).toMatch(/\.dark[\s\S]*--c-app:\s*#060b1f/i); // navy casi negro, NO #000
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

  it('primitivos theme-aware (dark: variants), light intacto', () => {
    expect(read('../../../components/ui/card.tsx')).toContain('dark:bg-surface');
    expect(read('../../../components/ui/input.tsx')).toContain('dark:bg-surface');
    expect(read('../../../components/ui/badge.tsx')).toContain('dark:');
    expect(read('../../../components/shared/kpi-card.tsx')).toContain('dark:');
    expect(read('../../../components/shared/account-menu.tsx')).toContain('<ThemeToggle');
  });
});
