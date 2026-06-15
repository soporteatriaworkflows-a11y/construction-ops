/**
 * disabled-actions.test.ts — Tests de acciones deshabilitadas en demo y read-only.
 * Inspección de fuente (sin render de DOM) — valida estructura JSX y lógica.
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const catalogPagePath = resolve(
  here,
  '../../../app/(dashboard)/catalog/page.tsx',
);
const providersPagePath = resolve(
  here,
  '../../../app/(dashboard)/catalog/providers/page.tsx',
);
const catalogActionsPath = resolve(
  here,
  '../../../app/(dashboard)/catalog/actions.ts',
);
const emptyStatePath = resolve(
  here,
  '../../../components/shared/empty-state.tsx',
);

// UX_BLOCKERS_V1: las tablas de recursos (con sus enlaces a price-intelligence)
// se movieron a un componente cliente de búsqueda/filtros; el comportamiento es
// equivalente. La aserción de price-intelligence apunta ahora al explorador.
const catalogExplorerPath = resolve(here, '../../../app/(dashboard)/catalog/catalog-explorer.tsx');
const catalogSrc = readFileSync(catalogPagePath, 'utf8');
const catalogExplorerSrc = readFileSync(catalogExplorerPath, 'utf8');
const providersSrc = readFileSync(providersPagePath, 'utf8');
const actionsSrc = readFileSync(catalogActionsPath, 'utf8');
const emptyStateSrc = readFileSync(emptyStatePath, 'utf8');

// ──────────────────────────────────────────────────────────────────────────────
// 1. Catálogo demo: "Nuevo recurso" visible y disabled
// ──────────────────────────────────────────────────────────────────────────────
describe('Catálogo — "Nuevo recurso" visible y disabled en demo', () => {
  it('el texto "Nuevo recurso" aparece en la página', () => {
    expect(catalogSrc).toMatch(/Nuevo recurso/);
  });

  it('hay una rama disabled para "Nuevo recurso" cuando canCreate=false', () => {
    // El botón disabled existe en la rama canCreate=false
    expect(catalogSrc).toMatch(/disabled[\s\S]{0,200}Nuevo recurso/);
  });

  it('el botón disabled tiene aria-disabled="true"', () => {
    expect(catalogSrc).toMatch(/aria-disabled="true"[\s\S]{0,200}Nuevo recurso/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Catálogo demo: explicación visible cerca del botón
// ──────────────────────────────────────────────────────────────────────────────
describe('Catálogo — explicación de modo demo visible', () => {
  it('muestra mensaje de modo demostración para catálogo', () => {
    expect(catalogSrc).toMatch(
      /Modo demostración.*puedes explorar el catálogo/,
    );
  });

  it('muestra mensaje de sin permisos para usuario read-only', () => {
    expect(catalogSrc).toMatch(
      /No tienes permisos para crear registros/,
    );
  });

  it('el disabledNotice se renderiza en el banner del layout', () => {
    expect(catalogSrc).toMatch(/disabledNotice/);
    const renderBlock = catalogSrc.slice(catalogSrc.indexOf('return ('));
    expect(renderBlock).toMatch(/disabledNotice/);
  });

  it('el banner tiene role="note"', () => {
    expect(catalogSrc).toMatch(/role="note"/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Catálogo vacío: CTA principal "Importar catálogo" + manual como excepción
//    (CATALOG_BULK_ONBOARDING_V1 reemplaza "Crear primer recurso").
// ──────────────────────────────────────────────────────────────────────────────
describe('Catálogo EmptyState — bulk onboarding', () => {
  it('el CTA principal "Importar catálogo" aparece en la página', () => {
    expect(catalogSrc).toMatch(/Importar catálogo/);
  });

  it('el secundario "Crear recurso manualmente" existe con rama disabled', () => {
    expect(catalogSrc).toMatch(/Crear recurso manualmente/);
    expect(catalogSrc).toMatch(/disabled[\s\S]{0,600}Crear recurso manualmente/);
  });

  it('la rama disabled muestra el disabledNotice', () => {
    // El bloque del emptyStateAction usa disabledNotice
    expect(catalogSrc).toMatch(/emptyStateAction[\s\S]{0,600}disabledNotice/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Catálogo demo: "Gestionar proveedores" siempre habilitado
// ──────────────────────────────────────────────────────────────────────────────
describe('Catálogo — "Gestionar proveedores" siempre habilitado', () => {
  it('el enlace "Gestionar proveedores" existe', () => {
    expect(catalogSrc).toMatch(/Gestionar proveedores/);
  });

  it('"Gestionar proveedores" usa Button asChild (enlazado, no disabled)', () => {
    expect(catalogSrc).toMatch(/asChild[\s\S]{0,100}Gestionar proveedores/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Providers demo: "Nuevo proveedor" visible y disabled
// ──────────────────────────────────────────────────────────────────────────────
describe('Providers — "Nuevo proveedor" visible y disabled en demo', () => {
  it('el texto "Nuevo proveedor" aparece en la página', () => {
    expect(providersSrc).toMatch(/Nuevo proveedor/);
  });

  it('hay una rama disabled para "Nuevo proveedor" cuando canCreate=false', () => {
    expect(providersSrc).toMatch(/disabled[\s\S]{0,200}Nuevo proveedor/);
  });

  it('el botón disabled tiene aria-disabled="true"', () => {
    expect(providersSrc).toMatch(/aria-disabled="true"[\s\S]{0,200}Nuevo proveedor/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Providers demo: "Crear primer proveedor" visible y disabled
// ──────────────────────────────────────────────────────────────────────────────
describe('Providers EmptyState — "Crear primer proveedor" en demo', () => {
  it('el texto "Crear primer proveedor" aparece', () => {
    expect(providersSrc).toMatch(/Crear primer proveedor/);
  });

  it('hay una rama disabled para "Crear primer proveedor"', () => {
    expect(providersSrc).toMatch(/disabled[\s\S]{0,600}Crear primer proveedor/);
  });

  it('aria-disabled="true" en el CTA del EmptyState', () => {
    expect(providersSrc).toMatch(/aria-disabled="true"[\s\S]{0,600}Crear primer proveedor/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Providers demo: explicación visible
// ──────────────────────────────────────────────────────────────────────────────
describe('Providers — explicación de modo demo visible', () => {
  it('muestra mensaje de modo demostración para proveedores', () => {
    expect(providersSrc).toMatch(
      /Modo demostración.*puedes explorar proveedores/,
    );
  });

  it('muestra mensaje de sin permisos para usuario read-only', () => {
    expect(providersSrc).toMatch(
      /No tienes permisos para crear registros/,
    );
  });

  it('el banner disabledNotice está presente en el JSX', () => {
    const renderBlock = providersSrc.slice(providersSrc.indexOf('return ('));
    expect(renderBlock).toMatch(/disabledNotice/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Usuario read-only: ve mensaje de permisos distinto al demo
// ──────────────────────────────────────────────────────────────────────────────
describe('Usuario read-only — mensaje de permisos diferenciado', () => {
  it('catálogo distingue demo de read-only en disabledNotice', () => {
    // El ternario isDemoMode ? demo_msg : readOnly_msg debe existir
    expect(catalogSrc).toMatch(/isDemoMode[\s\S]{0,300}Modo demostración/);
    expect(catalogSrc).toMatch(/isDemoMode[\s\S]{0,300}No tienes permisos/);
  });

  it('providers distingue demo de read-only en disabledNotice', () => {
    expect(providersSrc).toMatch(/isDemoMode[\s\S]{0,300}Modo demostración/);
    expect(providersSrc).toMatch(/isDemoMode[\s\S]{0,300}No tienes permisos/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9-10. Usuario autorizado supabase+db: lógica canCreate habilita los botones
// ──────────────────────────────────────────────────────────────────────────────
describe('Usuario autorizado supabase+db — lógica de habilitación', () => {
  it('catálogo usa isCreationModeEnabled como condición de env', () => {
    expect(catalogSrc).toMatch(/isCreationModeEnabled/);
  });

  it('catálogo combina env check con role check (management|internal)', () => {
    expect(catalogSrc).toMatch(/CREATE_ROLES/);
    expect(catalogSrc).toMatch(/management/);
    expect(catalogSrc).toMatch(/internal/);
  });

  it('providers verifica ADMIN_ROLES para canCreate', () => {
    expect(providersSrc).toMatch(/ADMIN_ROLES\.includes/);
  });

  it('catálogo: cuando canCreate=true muestra Button asChild para "Nuevo recurso"', () => {
    expect(catalogSrc).toMatch(/canCreate \? \([\s\S]{0,200}asChild[\s\S]{0,200}Nuevo recurso/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Guards server-side se conservan
// ──────────────────────────────────────────────────────────────────────────────
describe('Guards server-side intactos', () => {
  it('createResourceAction usa isCreationModeEnabled como guard', () => {
    expect(actionsSrc).toMatch(/isCreationModeEnabled/);
  });

  it('createResourceAction usa use server', () => {
    expect(actionsSrc).toMatch(/'use server'/);
  });

  it('createResourceAction no lee organization_id del formData', () => {
    expect(actionsSrc).not.toMatch(/formData\.get\(['"]organization_id['"]\)/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. No aparecen enlaces rotos
// ──────────────────────────────────────────────────────────────────────────────
describe('Sin enlaces rotos', () => {
  it('catálogo enlaza a /catalog/resources/new cuando canCreate=true', () => {
    expect(catalogSrc).toMatch(/\/catalog\/resources\/new/);
  });

  it('catálogo enlaza a /catalog/providers para Gestionar proveedores', () => {
    expect(catalogSrc).toMatch(/\/catalog\/providers/);
  });

  it('providers enlaza a /catalog/providers/new cuando canCreate=true', () => {
    expect(providersSrc).toMatch(/\/catalog\/providers\/new/);
  });

  it('providers tiene breadcrumb a /catalog', () => {
    expect(providersSrc).toMatch(/href="\/catalog"/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. Branding ICONIC intacto
// ──────────────────────────────────────────────────────────────────────────────
describe('Branding ICONIC intacto', () => {
  it('EmptyState usa clases de colores iconic-*', () => {
    expect(emptyStateSrc).toMatch(/iconic-/);
  });

  it('EmptyState conserva el ring-1 ring-iconic-soft-blue', () => {
    expect(emptyStateSrc).toMatch(/ring-iconic-soft-blue/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. Price Intelligence intacta
// ──────────────────────────────────────────────────────────────────────────────
describe('Price Intelligence intacta', () => {
  it('catálogo enlaza a /price-intelligence por recurso', () => {
    expect(catalogExplorerSrc).toMatch(/price-intelligence/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 15. Sin regresiones en componente EmptyState
// ──────────────────────────────────────────────────────────────────────────────
describe('EmptyState — sin regresiones', () => {
  it('conserva prop action opcional', () => {
    expect(emptyStateSrc).toMatch(/action\?:\s*React\.ReactNode/);
  });

  it('conserva prop secondaryAction opcional', () => {
    expect(emptyStateSrc).toMatch(/secondaryAction\?:\s*React\.ReactNode/);
  });

  it('conserva prop readOnlyMessage opcional', () => {
    expect(emptyStateSrc).toMatch(/readOnlyMessage\?:\s*string/);
  });

  it('conserva role="status" de accesibilidad', () => {
    expect(emptyStateSrc).toMatch(/role="status"/);
  });

  it('conserva aria-label={title}', () => {
    expect(emptyStateSrc).toMatch(/aria-label=\{title\}/);
  });
});
