/**
 * route-config.test.ts — Guarda de regresión del render de `/dashboard` (4B.1).
 *
 * El dashboard se prerenderizaba de forma estática (usaba `getDemoViewer()` y un
 * `DEMO_PROJECT_ID` fijo), de modo que en modo `db` Next ejecutaba la página
 * contra la base durante el build. Con base productiva vacía esto lanzaba
 * `ProjectNotFoundError` y rompía el build ("Error occurred prerendering page
 * /dashboard"). Esta prueba congela el endurecimiento: render request-time,
 * viewer real, selección dinámica del proyecto y ausencia de UUID demo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardPagePath = resolve(here, '../../../app/(dashboard)/dashboard/page.tsx');

describe('dashboard — configuración de render', () => {
  const source = readFileSync(dashboardPagePath, 'utf8');

  it('declara render dinámico (request-time), no prerender estático', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('resuelve el viewer real por modo (resolveViewer), no getDemoViewer fijo', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).not.toMatch(/getDemoViewer/);
  });

  it('NO hardcodea ningún UUID de proyecto demo', () => {
    expect(source).not.toContain('00000000-0000-4000-8000-000000000010');
    expect(source).not.toMatch(/DEMO_PROJECT_ID/);
  });

  it('deriva el proyecto activo de la lista real (listProjects + selectActiveProjectId)', () => {
    expect(source).toMatch(/listProjects\(/);
    expect(source).toMatch(/selectActiveProjectId\(/);
  });

  it('ofrece estado vacío con CTA hacia /projects o /projects/new', () => {
    expect(source).toMatch(/EmptyState/);
    expect(source).toMatch(/\/projects/);
  });

  it('no asume la existencia del proyecto: guarda projectId antes del resumen', () => {
    expect(source).toMatch(/if\s*\(\s*!projectId\s*\)/);
  });
});
