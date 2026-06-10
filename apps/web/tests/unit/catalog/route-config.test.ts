/**
 * route-config.test.ts — Guarda de regresion de rutas de catalogo (Bootstrap CTAs).
 * Sin render de DOM — solo imports y lectura de archivos.
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const newResourcePagePath = resolve(
  here,
  '../../../app/(dashboard)/catalog/resources/new/page.tsx',
);

const catalogActionsPath = resolve(
  here,
  '../../../app/(dashboard)/catalog/actions.ts',
);

describe('catalog/resources/new — configuracion de ruta', () => {
  const source = readFileSync(newResourcePagePath, 'utf8');

  it('el archivo de pagina existe y es importable como modulo de texto', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('declara render dinamico (request-time), no prerender estatico', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('verifica el modo de autenticacion antes de mostrar el formulario', () => {
    expect(source).toMatch(/resolveAuthMode/);
  });

  it('renderiza ResourceForm cuando el modo es supabase', () => {
    expect(source).toMatch(/ResourceForm/);
  });
});

describe('catalog/actions.ts — createResourceAction exportada', () => {
  const source = readFileSync(catalogActionsPath, 'utf8');

  it('el archivo de actions existe', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('exporta createResourceAction como funcion', () => {
    expect(source).toMatch(/export\s+async\s+function\s+createResourceAction/);
  });

  it('declara use server', () => {
    expect(source).toMatch(/'use server'/);
  });

  it('usa isCreationModeEnabled como guard de escritura', () => {
    expect(source).toMatch(/isCreationModeEnabled/);
  });

  it('llama a revalidatePath despues de crear', () => {
    expect(source).toMatch(/revalidatePath/);
  });

  it('nunca usa organization_id del formData (siempre server-side)', () => {
    // organization_id debe provenir del viewer, no del formData
    expect(source).not.toMatch(/formData\.get\(['"]organization_id['"]\)/);
  });
});
