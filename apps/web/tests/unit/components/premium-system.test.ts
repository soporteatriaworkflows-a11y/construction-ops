/**
 * premium-system.test.ts â€” V4.2.3 iconografÃ­a + glass + botones tÃ¡ctiles.
 * Stack node: checks de FUENTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('V4.2.3 â€” sistema visual premium', () => {
  it('capa de iconografÃ­a central con estados (IconicIcon + IconChip)', () => {
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

  it('Button: tÃ¡ctil (active:scale) + secundario frosted + variantes dark', () => {
    const btn = read('../../../components/ui/button.tsx');
    expect(btn).toContain('active:scale-[0.98]');
    expect(btn).toContain('backdrop-blur'); // outline glass
    expect(btn).toContain('dark:');
  });

  it('AppRail glass/dock + nav y CTA con pressed state', () => {
    const rail = read('../../../components/shared/app-rail.tsx');
    expect(rail).toContain('glass-navy');
    expect(rail).toContain('active:scale-[0.98]'); // CTA Asistente tÃ¡ctil
    const nav = read('../../../components/shared/sidebar-nav.tsx');
    expect(nav).toContain('active:scale-[0.97]');
  });

  it('IconChip disponible como capa central; dashboard sin formas decorativas', () => {
    expect(read('../../../components/shared/iconic-icon.tsx')).toContain('export function IconChip');
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).not.toContain('rounded-full bg-iconic-cyan/10'); // cÃ­rculo decorativo eliminado en V4.2.2
  });

  it('V4.2.5: dashboard editorial (DashMetric, sin mega-hero navy con gradiente)', () => {
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).toContain('DashMetric'); // tira de mÃ©tricas plana
    expect(dash).not.toContain("background: 'linear-gradient(180deg, #050a32"); // mega-hero navy eliminado
    expect(dash).not.toContain('CommandStat'); // mini-cards navy eliminadas del hero
  });

  it('V4.2.6: dark slate-charcoal con elevaciÃ³n (no navy saturado, no plano)', () => {
    const css = read('../../../app/globals.css');
    expect(css).toMatch(/\.dark[\s\S]*--c-app:\s*#0d0f14/i); // slate-charcoal base
    expect(css).toMatch(/\.dark[\s\S]*--c-surface:\s*#161922/i); // surface elevada
  });

  it('V4.2.6: card system (SurfaceCard) con variantes de jerarquÃ­a', () => {
    const sc = read('../../../components/shared/surface-card.tsx');
    expect(sc).toContain('export function SurfaceCard');
    expect(sc).toContain('export function ActionCard');
    for (const v of ['primary', 'metric', 'action', 'chart', 'status']) expect(sc).toContain(`${v}:`);
  });

  it('V4.2.6: dashboard usa SurfaceCard + chart compacta (distribuciÃ³n no domina)', () => {
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).toContain('SurfaceCard');
    expect(dash).toContain("variant=\"chart\"");
    expect(dash).toContain('lg:col-span-2'); // hero ocupa 2/3, chart 1/3
  });

  it('V4.2.6: IconChip soporta cÃ¡psula (ref G); botÃ³n primario con highlight interno', () => {
    expect(read('../../../components/shared/iconic-icon.tsx')).toContain("'capsule'");
    expect(read('../../../components/ui/button.tsx')).toContain('inset_0_1px_0');
  });

  it('V4.2.6 shell polish: rail graphite (no navy), CTA centrado en colapsado', () => {
    const rail = read('../../../components/shared/app-rail.tsx');
    expect(rail).toMatch(/rgba\(32,36,44/); // fondo graphite
    expect(rail).not.toMatch(/rgba\(2,1,72/); // ya no navy saturado
    expect(rail).toContain("justify-center px-0"); // CTA/indicador centrados en colapsado
  });

  it('V4.2.6 shell polish: search theme-aware + overlay limpio (sin franja navy)', () => {
    const cp = read('../../../components/shared/command-palette.tsx');
    expect(cp).toContain('bg-surface-soft'); // trigger theme-aware
    expect(cp).toContain('text-iconic-primary/70'); // lupa clara
    expect(cp).not.toContain('bg-iconic-ink/30'); // overlay navy reemplazado por dim neutro
  });

  it('V4.2.10: header con azul vivo de marca (no navy oscuro) + logo claro en dark + outline dark visible', () => {
    expect(read('../../../components/shared/operations-header.tsx')).toContain('from-iconic-primary');
    expect(read('../../../components/shared/operations-header.tsx')).not.toContain('from-iconic-ink');
    // El tile del logo debe quedar claro en dark (no lo oscurece el remapeo) â†’ bg-iconic-white.
    expect(read('../../../components/shared/workspace-brand.tsx')).toContain('bg-iconic-white');
    // BotÃ³n outline en dark: superficie sÃ³lida visible, sin perÃ­metro blanco.
    expect(read('../../../components/ui/button.tsx')).toContain('dark:bg-surface-muted');
  });

  it('V4.2.7: NotesCard (shell) + WorkflowStrip (timeline) existen', () => {
    expect(read('../../../components/shared/notes-card.tsx')).toContain('export function NotesCard');
    const ws = read('../../../components/shared/workflow-strip.tsx');
    expect(ws).toContain('export function WorkflowStrip');
    expect(ws).toContain("aria-current={step.current");
  });

  it('V4.2.7: dashboard â€” OperaciÃ³n unificada + Notas + monitoreo consolidado + workflow', () => {
    const dash = read('../../../app/(dashboard)/dashboard/page.tsx');
    expect(dash).toContain('<NotesCard');
    expect(dash).toContain('<WorkflowStrip');
    expect(dash).toMatch(/ltima.*revisi/); // subzona de tiempo (lastRunAt real)
    expect(dash).not.toContain('<QuickLink'); // accesos sueltos reemplazados por la franja
    // panel OperaciÃ³n unificado: las 3 secciones en un solo SurfaceCard con divisores
    expect(dash).toMatch(/sm:divide-x/);
  });
});
