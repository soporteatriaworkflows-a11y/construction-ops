/**
 * db-mode-routes.test.ts — Estabilización de producción 4B.1.
 *
 * Congela el comportamiento esperado del vertical slice en modo `db`:
 *  - Las rutas hermanas (/apu,/catalog,/quantities,/estimates,/planning) son
 *    request-time (`force-dynamic`) y resuelven el viewer real (`resolveViewer`),
 *    sin `getDemoViewer()` ni UUIDs demo: en `db` nunca exponen datos de demo.
 *  - El layout es request-time y su footer NO está hardcodeado a "Oleada 3A —
 *    fixture" (usa la etiqueta de modo).
 *  - Los CTAs de creación usan `<Button asChild><Link href="/projects/new">…`
 *    (ancla navegable), no `<Link><Button>` (botón anidado que no navega).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../../../app/(dashboard)');
const read = (rel: string) => readFileSync(resolve(appDir, rel), 'utf8');

const SIBLING_ROUTES = [
  'apu/page.tsx',
  'catalog/page.tsx',
  'quantities/page.tsx',
  'estimates/page.tsx',
  'planning/page.tsx',
];

describe('Rutas hermanas — request-time + viewer real en modo db', () => {
  for (const rel of SIBLING_ROUTES) {
    describe(rel, () => {
      const source = read(rel);

      it('declara render dinámico (force-dynamic)', () => {
        expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
      });

      it('resuelve el viewer real (resolveViewer/resolveAuthenticatedViewer), no getDemoViewer', () => {
        // /planning (SCHEDULE_FROM_BOQ_V1) usa el viewer AUTENTICADO (gestión de
        // cronogramas requiere identidad real); las demás usan resolveViewer.
        expect(source).toMatch(/await\s+resolve(Authenticated)?Viewer\(\)/);
        expect(source).not.toMatch(/getDemoViewer/);
      });

      it('no hardcodea UUID de proyecto demo', () => {
        expect(source).not.toContain('00000000-0000-4000-8000-000000000010');
      });
    });
  }
});

describe('Layout del dashboard — footer mode-aware', () => {
  const source = read('layout.tsx');

  it('es request-time (force-dynamic) — cubre el segmento autenticado', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('NO hardcodea "Oleada 3A — fixture" en el footer', () => {
    expect(source).not.toMatch(/Oleada 3A\s*—\s*fixture/);
  });

  it('deriva la etiqueta de modo (readModelModeLabel)', () => {
    expect(source).toMatch(/readModelModeLabel\(\)/);
  });
});

describe('CTAs de creación — anclas navegables (Button asChild + Link)', () => {
  const projects = read('projects/page.tsx');
  const dashboard = read('dashboard/page.tsx');

  it('/projects: ambos CTAs usan Button asChild con Link a /projects/new', () => {
    const matches = projects.match(
      /<Button\s+asChild[^>]*>\s*<Link\s+href="\/projects\/new">/g,
    );
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('/projects: no anida <Button> dentro de <Link> (patrón que no navega)', () => {
    expect(projects).not.toMatch(/<Link\s+href="\/projects\/new">\s*<Button(?![^>]*asChild)/);
  });

  it('/dashboard: el CTA de creación usa Button asChild + Link a /projects/new', () => {
    expect(dashboard).toMatch(/<Button\s+asChild[^>]*>\s*<Link\s+href="\/projects\/new">/);
  });
});
