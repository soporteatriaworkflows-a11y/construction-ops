/**
 * route-config.test.ts — Guardas a nivel de fuente de la UI de presupuestos (4B.3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../../../app/(dashboard)');
const read = (rel: string) => readFileSync(resolve(appDir, rel), 'utf8');

const SCOPE = 'projects/[id]/scopes/[scopeId]';

describe('detalle de alcance — sección Presupuestos', () => {
  const source = read(`${SCOPE}/page.tsx`);

  it('lista presupuestos reales (listEstimatesByScope) con viewer resuelto', () => {
    expect(source).toMatch(/listEstimatesByScope\(/);
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
  });
  it('empty state honesto de presupuestos', () => {
    expect(source).toMatch(/Este alcance todav[ií]a no tiene presupuestos registrados/);
  });
  it('CTA "Nuevo presupuesto" es ancla navegable (Button asChild + Link)', () => {
    expect(source).toMatch(/<Button\s+asChild[^>]*>\s*<Link\s+href=\{newEstimateHref\}>/);
    expect(source).toMatch(/estimates\/new/);
  });
  it('ya NO muestra el placeholder de "siguiente fase" del presupuesto', () => {
    expect(source).not.toMatch(/El presupuesto de este alcance estar[áa] disponible/);
  });
});

describe('estimates/new — formulario', () => {
  const page = read(`${SCOPE}/estimates/new/page.tsx`);
  const form = read(`${SCOPE}/estimates/new/new-estimate-form.tsx`);

  it('página request-time (force-dynamic) + valida alcance visible', () => {
    expect(page).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    expect(page).toMatch(/getScopeById\(/);
  });
  it('formulario envía scopeId hidden y NO expone campos sensibles', () => {
    expect(form).toMatch(/type="hidden"\s+name="scopeId"/);
    expect(form).not.toMatch(/name="organization_id"/);
    expect(form).not.toMatch(/name="created_by"/);
    expect(form).not.toMatch(/name="status"/);
  });
});

describe('estimates/[estimateId] — detalle', () => {
  const source = read(`${SCOPE}/estimates/[estimateId]/page.tsx`);

  it('viewer real + getEstimateById + notFound', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/getEstimateById\(/);
    expect(source).toMatch(/notFound\(\)/);
  });
  it('verifica pertenencia del presupuesto al alcance de la ruta', () => {
    expect(source).toMatch(/estimate\.projectScopeId\s*!==\s*scopeId/);
  });
  it('muestra versión activa, capítulos e ítems', () => {
    expect(source).toMatch(/activeVersion/);
    expect(source).toMatch(/Cap[ií]tulos/);
    expect(source).toMatch(/[ÍI]tems/);
  });
  it('integra la sección Importar Excel (4C.1): CTA + estado', () => {
    expect(source).toMatch(/Importar Excel/);
    expect(source).toMatch(/estimates\/\$\{estimateId\}\/import/);
  });
});

describe('createEstimateAction — seguridad', () => {
  const source = read(`${SCOPE}/estimates/actions.ts`);

  it('guard de modo + viewer autenticado server-side', () => {
    expect(source).toMatch(/isCreationModeEnabled\(\)/);
    expect(source).toMatch(/resolveAuthenticatedViewer\(\)/);
  });
  it('valida scopeId del formulario (no se confía a ciegas)', () => {
    expect(source).toMatch(/formData\.get\('scopeId'\)/);
  });
  it("'use server' y redirect derivado del estimate creado", () => {
    expect(source).toMatch(/^'use server';/m);
    expect(source).toMatch(/estimate\.projectId/);
  });
});

describe('/estimates — listado real visible', () => {
  const source = read('estimates/page.tsx');

  it('request-time + viewer real + listVisibleEstimates, sin getDemoViewer', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/listVisibleEstimates\(/);
    expect(source).not.toMatch(/getDemoViewer/);
  });
  it('empty state honesto cuando no hay presupuestos', () => {
    expect(source).toMatch(/A[uú]n no hay presupuestos registrados/);
  });
});
