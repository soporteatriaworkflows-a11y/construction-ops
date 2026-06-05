/**
 * route-config.test.ts — Guardas a nivel de fuente de la UI de alcances (4B.2).
 *
 * Verifica: rutas request-time + viewer real, CTAs como anclas navegables
 * (Button asChild + Link), formulario con select de tipo + hidden projectId y
 * sin campos sensibles, y action con guard de modo + viewer autenticado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const idDir = resolve(here, '../../../app/(dashboard)/projects/[id]');
const read = (rel: string) => readFileSync(resolve(idDir, rel), 'utf8');

describe('/projects/[id] — sección de alcances', () => {
  const source = read('page.tsx');

  it('lista alcances reales (listScopesByProject) con viewer resuelto', () => {
    expect(source).toMatch(/listScopesByProject\(/);
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
  });

  it('empty state honesto de alcances', () => {
    expect(source).toMatch(/Este proyecto todav[ií]a no tiene alcances registrados/);
  });

  it('CTA "Nuevo alcance" es ancla navegable (Button asChild + Link a /scopes/new)', () => {
    expect(source).toMatch(/<Button\s+asChild[^>]*>\s*<Link\s+href=\{newScopeHref\}>/);
    expect(source).toMatch(/scopes\/new/);
  });

  it('placeholder honesto de presupuesto (siguiente fase)', () => {
    expect(source).toMatch(/presupuesto del proyecto estar[áa] disponible en la siguiente fase/i);
  });
});

describe('/projects/[id]/scopes/new — formulario', () => {
  const page = read('scopes/new/page.tsx');
  const form = read('scopes/new/new-scope-form.tsx');

  it('página request-time (force-dynamic) + valida proyecto visible', () => {
    expect(page).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    expect(page).toMatch(/getProjectById\(/);
  });

  it('formulario envía projectId en hidden y NO expone organization_id', () => {
    expect(form).toMatch(/type="hidden"\s+name="projectId"/);
    expect(form).not.toMatch(/name="organization_id"/);
    expect(form).not.toMatch(/name="created_by"/);
  });

  it('formulario expone el select de tipo con los 7 valores del esquema', () => {
    expect(form).toMatch(/name="scopeType"/);
    expect(form).toMatch(/SCOPE_TYPES\.map/);
  });
});

describe('/projects/[id]/scopes/[scopeId] — detalle', () => {
  const source = read('scopes/[scopeId]/page.tsx');

  it('viewer real + getScopeById + notFound para cross-org', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/getScopeById\(/);
    expect(source).toMatch(/notFound\(\)/);
  });

  it('verifica pertenencia del alcance al proyecto de la ruta', () => {
    expect(source).toMatch(/scope\.projectId\s*!==\s*id/);
  });

  it('placeholder honesto de presupuesto del alcance', () => {
    expect(source).toMatch(/presupuesto de este alcance estar[áa] disponible en la siguiente fase/i);
  });
});

describe('createScopeAction — seguridad', () => {
  const source = read('scopes/actions.ts');

  it('guard de modo + viewer autenticado server-side', () => {
    expect(source).toMatch(/isCreationModeEnabled\(\)/);
    expect(source).toMatch(/resolveAuthenticatedViewer\(\)/);
  });

  it('valida projectId del formulario (no se confía a ciegas)', () => {
    expect(source).toMatch(/formData\.get\('projectId'\)/);
  });

  it("'use server' y redirect seguro al detalle del alcance", () => {
    expect(source).toMatch(/^'use server';/m);
    expect(source).toMatch(/redirect\(`\/projects\/\$\{projectId\}\/scopes\/\$\{scopeId\}`\)/);
  });
});
