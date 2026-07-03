/**
 * route-config.test.ts - Guarda de regresion del render de `/dashboard`.
 *
 * V5.4.2D congela que el dashboard es request-time, valida el projectId de query
 * contra proyectos visibles y no vuelve a escoger silenciosamente el primer proyecto
 * como si fuera alcance global.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardPagePath = resolve(here, '../../../app/(dashboard)/dashboard/page.tsx');

describe('dashboard - configuracion de render y alcance', () => {
  const source = readFileSync(dashboardPagePath, 'utf8');

  it('declara render dinamico (request-time), no prerender estatico', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('resuelve el viewer real por modo (resolveViewer), no getDemoViewer fijo', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).not.toMatch(/getDemoViewer/);
  });

  it('NO hardcodea ningun UUID de proyecto demo', () => {
    expect(source).not.toContain('00000000-0000-4000-8000-000000000010');
    expect(source).not.toMatch(/DEMO_PROJECT_ID/);
  });

  it('usa searchParams de Next 16 y valida projectId contra listProjects', () => {
    expect(source).toMatch(/searchParams:\s*Promise/);
    expect(source).toMatch(/const params = await searchParams/);
    expect(source).toMatch(/projectIdFromSearchParams\(params\)/);
    expect(source).toMatch(/listProjects\(/);
    expect(source).toMatch(/resolveDashboardProjectScope\(projects, requestedProjectId\)/);
    expect(source).not.toMatch(/selectActiveProjectId\(/);
  });

  it('ofrece selector global/scoped con query param projectId', () => {
    expect(source).toContain('DashboardScopeSelector');
    expect(source).toContain('Todos los proyectos');
    expect(source).toContain('/dashboard?projectId=');
    expect(source).toContain('scope.invalidProjectId');
  });

  it('boton principal cambia global /projects vs scoped /projects/:id', () => {
    expect(source).toContain("selectedProjectId ? `/projects/${selectedProjectId}` : '/projects'");
    expect(source).toContain("selectedProjectId ? 'Ver proyecto' : 'Ver proyectos'");
  });

  it('no presenta presupuesto global falso: global queda como proyecto destacado', () => {
    expect(source).toContain('Proyecto destacado');
    expect(source).toContain('Vista global de organizacion');
  });

  it('ofrece estado vacio con CTA hacia /projects o /projects/new', () => {
    expect(source).toMatch(/EmptyState/);
    expect(source).toMatch(/\/projects/);
  });

  it('no asume la existencia del proyecto: guarda projectId antes del resumen', () => {
    expect(source).toMatch(/if\s*\(\s*!projectId\s*\)/);
  });
});
