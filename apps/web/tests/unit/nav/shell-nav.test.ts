/**
 * shell-nav.test.ts — Lógica pura del shell (ICONIC_OPS_UIX_SHELL_V1, Fase 1).
 * Solo presentación/navegación; no toca lógica de módulos ni server.
 */
import { describe, it, expect } from 'vitest';
import { buildBreadcrumbs, isDynamicSegment } from '@/components/shared/breadcrumbs';
import {
  resolveContextNav,
  activeContextHref,
} from '@/components/shared/contextual-nav';
import { accountMenuLinks, initialsFromEmail } from '@/components/shared/account-menu';

describe('breadcrumbs — buildBreadcrumbs', () => {
  it('raíz vacía → Inicio', () => {
    expect(buildBreadcrumbs('/')).toEqual([{ label: 'Inicio', href: '/dashboard' }]);
  });

  it('mapea labels es-CO y enlaza solo rutas seguras (último sin href)', () => {
    const c = buildBreadcrumbs('/apu/import');
    expect(c.map((x) => x.label)).toEqual(['APU', 'Importar']);
    expect(c[0]!.href).toBe('/apu'); // ruta segura, no es último
    expect(c[1]!.href).toBeUndefined(); // último nunca enlaza
  });

  it('segmentos dinámicos (uuid) → "Detalle" y sin enlace', () => {
    const uuid = '00e9447a-5ee1-4d4b-a88b-b20f0c5b1c0e';
    const c = buildBreadcrumbs(`/planning/${uuid}`);
    expect(c[0]).toEqual({ label: 'Cronograma', href: '/planning' });
    expect(c[1]!.label).toBe('Detalle');
    expect(c[1]!.href).toBeUndefined();
  });

  it('no enlaza colecciones profundas sin índice (evita 404)', () => {
    const c = buildBreadcrumbs('/projects/abc123/scopes/def456');
    // ningún crumb intermedio dinámico/colección sin índice queda enlazado
    expect(c.every((x) => x.href === undefined || x.href === '/projects')).toBe(true);
  });

  it('isDynamicSegment detecta uuid/hex/num y no palabras', () => {
    expect(isDynamicSegment('00e9447a-5ee1-4d4b-a88b-b20f0c5b1c0e')).toBe(true);
    expect(isDynamicSegment('123456')).toBe(true);
    expect(isDynamicSegment('import')).toBe(false);
  });
});

describe('contextual-nav — resolveContextNav', () => {
  it('APU expone biblioteca/importar/reconciliación/nuevo', () => {
    const ctx = resolveContextNav('/apu/import');
    expect(ctx?.module).toBe('APU');
    expect(ctx?.items.map((i) => i.href)).toEqual(['/apu', '/apu/import', '/apu/reconciliation', '/apu/new']);
  });

  it('Catálogo y Cantidades resuelven sus rutas existentes', () => {
    expect(resolveContextNav('/catalog/providers')?.module).toBe('Catálogo');
    expect(resolveContextNav('/quantities/workspace')?.module).toBe('Cantidades');
  });

  it('Cronograma en detalle también resuelve contexto (Lista/Nuevo)', () => {
    const ctx = resolveContextNav('/planning/abc');
    expect(ctx?.module).toBe('Cronograma');
    expect(ctx?.items.map((i) => i.href)).toEqual(['/planning', '/planning/new']);
  });

  it('Dashboard/Presupuestos/Settings no muestran contexto (<2 sub-secciones)', () => {
    expect(resolveContextNav('/dashboard')).toBeNull();
    expect(resolveContextNav('/estimates')).toBeNull();
    expect(resolveContextNav('/settings/access')).toBeNull();
  });

  it('ruta desconocida → null', () => {
    expect(resolveContextNav('/algo/raro')).toBeNull();
  });
});

describe('contextual-nav — activeContextHref (prefijo más largo)', () => {
  const items = resolveContextNav('/catalog')!.items;
  it('selecciona la sub-ruta más específica, no la raíz', () => {
    expect(activeContextHref('/catalog/providers', items)).toBe('/catalog/providers');
    expect(activeContextHref('/catalog/providers/new', items)).toBe('/catalog/providers');
    expect(activeContextHref('/catalog', items)).toBe('/catalog');
  });
});

describe('account-menu — accountMenuLinks / initialsFromEmail', () => {
  it('sin gestión de accesos: Configuración + Cerrar sesión (sin Accesos)', () => {
    const links = accountMenuLinks(false);
    expect(links.map((l) => l.href)).toEqual(['/settings', '/logout']);
  });

  it('con gestión: incluye Accesos / Usuarios', () => {
    const links = accountMenuLinks(true);
    expect(links.map((l) => l.href)).toEqual(['/settings', '/settings/access', '/logout']);
    expect(links.find((l) => l.icon === 'logout')!.external).toBe(true);
  });

  it('iniciales desde email (puntos/guiones) en mayúscula; respaldo U', () => {
    expect(initialsFromEmail('publicidad@iconicconstructora.com')).toBe('PU');
    expect(initialsFromEmail('juan.perez@x.com')).toBe('JP');
    expect(initialsFromEmail(null)).toBe('U');
  });
});
