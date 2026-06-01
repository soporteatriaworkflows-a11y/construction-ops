/**
 * auth-runtime.test.ts — Tests del runtime SSR de autenticación (Oleada 4A.2).
 *
 * Cubre: parseo de modos y matriz válida/inválida, role-map y anti-escalamiento,
 * clasificación de rutas y sanitización de `next` (open redirect), selector de
 * viewer en demo, y guard del Proxy (demo passthrough + supabase redirects).
 * Propiedad: orquestador.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseAuthMode,
  parseReadModelSource,
  validateModeCombo,
  getPublicSupabaseEnv,
  AuthConfigError,
} from '@/lib/supabase/env';
import {
  mapProfileRoleToViewerRole,
  isSameOrLessPrivileged,
} from '@/server/auth/role-map';
import {
  isPublicRoute,
  isProtectedRoute,
  sanitizeNext,
} from '@/server/auth/routes';

describe('auth/env — modos y matriz', () => {
  it('parseAuthMode: demo por defecto, válidos y error explícito', () => {
    expect(parseAuthMode(undefined)).toBe('demo');
    expect(parseAuthMode('supabase')).toBe('supabase');
    expect(parseAuthMode('SUPABASE')).toBe('supabase');
    expect(() => parseAuthMode('remote')).toThrow(AuthConfigError);
  });

  it('parseReadModelSource: fixture por defecto, válidos y error', () => {
    expect(parseReadModelSource(undefined)).toBe('fixture');
    expect(parseReadModelSource('db')).toBe('db');
    expect(() => parseReadModelSource('mongo')).toThrow(AuthConfigError);
  });

  it('validateModeCombo: demo+db prohibido; resto permitido', () => {
    expect(() => validateModeCombo('demo', 'db')).toThrow(AuthConfigError);
    expect(() => validateModeCombo('demo', 'fixture')).not.toThrow();
    expect(() => validateModeCombo('supabase', 'fixture')).not.toThrow();
    expect(() => validateModeCombo('supabase', 'db')).not.toThrow();
  });

  it('getPublicSupabaseEnv: lanza si faltan; nunca usa service_role', () => {
    expect(() => getPublicSupabaseEnv({})).toThrow(AuthConfigError);
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pub_local',
    };
    expect(getPublicSupabaseEnv(env)).toEqual({
      url: 'http://localhost:54321',
      publishableKey: 'pub_local',
    });
  });
});

describe('auth/role-map — mapeo y anti-escalamiento', () => {
  it('mapea cada profiles.role al ViewerRole congelado', () => {
    expect(mapProfileRoleToViewerRole('admin')).toBe('internal');
    expect(mapProfileRoleToViewerRole('presupuestos')).toBe('internal');
    expect(mapProfileRoleToViewerRole('compras')).toBe('internal');
    expect(mapProfileRoleToViewerRole('gerencia')).toBe('management');
    expect(mapProfileRoleToViewerRole('obra')).toBe('site');
    expect(mapProfileRoleToViewerRole('consulta')).toBe('client');
  });

  it('rol desconocido/ausente → null (deny-by-default)', () => {
    expect(mapProfileRoleToViewerRole('superuser')).toBeNull();
    expect(mapProfileRoleToViewerRole(null)).toBeNull();
    expect(mapProfileRoleToViewerRole(undefined)).toBeNull();
    expect(mapProfileRoleToViewerRole('')).toBeNull();
  });

  it('isSameOrLessPrivileged: cliente no escala a internal; internal puede pedir menos', () => {
    expect(isSameOrLessPrivileged('internal', 'client')).toBe(false);
    expect(isSameOrLessPrivileged('management', 'site')).toBe(false);
    expect(isSameOrLessPrivileged('client', 'internal')).toBe(true);
    expect(isSameOrLessPrivileged('site', 'site')).toBe(true);
    expect(isSameOrLessPrivileged('management', 'internal')).toBe(true);
  });
});

describe('auth/routes — clasificación y open redirect', () => {
  it('rutas públicas y protegidas', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/auth/callback')).toBe(true);
    expect(isPublicRoute('/dashboard')).toBe(false);
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/api/exports')).toBe(true);
    expect(isProtectedRoute('/planning/anything')).toBe(true);
    expect(isProtectedRoute('/login')).toBe(false);
  });

  it('sanitizeNext: acepta rutas internas; bloquea open redirects', () => {
    expect(sanitizeNext('/projects')).toBe('/projects');
    expect(sanitizeNext('/estimates?x=1')).toBe('/estimates?x=1');
    expect(sanitizeNext(null)).toBe('/dashboard');
    expect(sanitizeNext('//evil.com')).toBe('/dashboard');
    expect(sanitizeNext('/\\evil.com')).toBe('/dashboard');
    expect(sanitizeNext('https://evil.com')).toBe('/dashboard');
    expect(sanitizeNext('javascript:alert(1)')).toBe('/dashboard');
    expect(sanitizeNext('/redir:— evil')).toBe('/dashboard');
    expect(sanitizeNext('relative/path')).toBe('/dashboard');
  });
});

describe('auth/resolveViewer — demo', () => {
  it('modo demo devuelve el viewer demo (fixture), sin sesión', async () => {
    const { resolveViewer } = await import('@/server/auth/resolve-viewer');
    const viewer = await resolveViewer('demo');
    expect(viewer.organizationId).toBe('00000000-0000-4000-8000-000000000001');
    expect(viewer.role).toBe('management');
  });
});

describe('proxy — guard de rutas', () => {
  const OLD = process.env.APP_AUTH_MODE;
  afterEach(() => {
    process.env.APP_AUTH_MODE = OLD;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function makeRequest(pathname: string, search = '') {
    const url = `http://localhost:3000${pathname}${search}`;
    // NextRequest-like; el Proxy usa nextUrl, cookies.getAll/set.
    const { NextRequest } = require('next/server');
    return new NextRequest(url);
  }

  it('modo demo: passthrough (sin redirección, sin tocar Supabase)', async () => {
    process.env.APP_AUTH_MODE = 'demo';
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    const res = await proxy(makeRequest('/dashboard'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('modo supabase: ruta protegida sin sesión → redirect /login?next=', async () => {
    process.env.APP_AUTH_MODE = 'supabase';
    vi.resetModules();
    vi.doMock('@/lib/supabase/proxy', () => {
      const { NextResponse } = require('next/server');
      return {
        createProxyClient: () => ({
          getResponse: () => NextResponse.next(),
          getClaims: async () => null, // sin sesión
        }),
      };
    });
    const { proxy } = await import('@/proxy');
    const res = await proxy(makeRequest('/projects'));
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/login');
    expect(loc).toContain('next=%2Fprojects');
  });

  it('modo supabase: /login con sesión → redirect /dashboard', async () => {
    process.env.APP_AUTH_MODE = 'supabase';
    vi.resetModules();
    vi.doMock('@/lib/supabase/proxy', () => {
      const { NextResponse } = require('next/server');
      return {
        createProxyClient: () => ({
          getResponse: () => NextResponse.next(),
          getClaims: async () => ({ sub: '00000000-0000-0000-0000-0000000000b1' }),
        }),
      };
    });
    const { proxy } = await import('@/proxy');
    const res = await proxy(makeRequest('/login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('/dashboard');
  });
});
