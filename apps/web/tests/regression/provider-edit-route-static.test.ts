/**
 * provider-edit-route-static.test.ts — V5.6.6A fix del dead-link de editar
 * proveedor.
 *
 * Regresión ESTÁTICA (sin renderizado): desde Fase 3A la lista de proveedores
 * enlazaba a /catalog/providers/[id]/edit pero la página no existía (404).
 * Este test fija el contrato: el href del botón Editar tiene una page.tsx
 * real detrás, que reutiliza ProviderForm en modo edición con la action de
 * update existente y respeta el gate de roles de la action.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..', 'app', '(dashboard)', 'catalog', 'providers');

const LIST_PAGE = join(APP, 'page.tsx');
const EDIT_PAGE = join(APP, '[id]', 'edit', 'page.tsx');
const FORM = join(APP, '_components', 'provider-form.tsx');
const ACTIONS = join(APP, 'actions.ts');

describe('proveedores — ruta de edición (V5.6.6A)', () => {
  it('el botón Editar de la lista apunta a /catalog/providers/[id]/edit', () => {
    const list = readFileSync(LIST_PAGE, 'utf8');
    expect(list).toMatch(/\/catalog\/providers\/\$\{p\.id\}\/edit/);
  });

  it('la ruta enlazada existe como page.tsx (antes: 404)', () => {
    expect(existsSync(EDIT_PAGE)).toBe(true);
  });

  it('la página de edición reutiliza ProviderForm en mode="edit" y carga el proveedor', () => {
    const page = readFileSync(EDIT_PAGE, 'utf8');
    expect(page).toMatch(/ProviderForm/);
    expect(page).toMatch(/mode="edit"/);
    expect(page).toMatch(/getProviderById/);
    expect(page).toMatch(/notFound\(\)/);
  });

  it('la página aplica el mismo gate de roles que la action (management/internal)', () => {
    const page = readFileSync(EDIT_PAGE, 'utf8');
    expect(page).toMatch(/'management',\s*'internal'/);
    const actions = readFileSync(ACTIONS, 'utf8');
    expect(actions).toMatch(/\['management', 'internal'\]/);
  });

  it('el formulario en edición envía providerId y preserva el estado activo', () => {
    const form = readFileSync(FORM, 'utf8');
    expect(form).toMatch(/name="providerId"/);
    // Sin campo `active`, la action reactivaría proveedores inactivos en cada
    // edición (formData.get('active') !== 'false' con null => true).
    expect(form).toMatch(/name="active"/);
    expect(form).toMatch(/updateProviderAction/);
  });
});
