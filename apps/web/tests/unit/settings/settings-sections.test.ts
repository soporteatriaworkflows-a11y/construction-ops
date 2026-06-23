/**
 * settings-sections.test.ts — Lógica pura del hub de Configuración
 * (SETTINGS_PROFILE_ACCOUNT_V1). Solo navegación/estados; sin server.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSettingsSections,
  SETTINGS_STATUS_LABELS,
  SYSTEM_MODULES,
} from '@/app/(dashboard)/settings/_lib/settings-sections';

describe('settings-sections — buildSettingsSections', () => {
  it('expone las 7 secciones esperadas, en orden', () => {
    const keys = buildSettingsSections({ canManageAccess: true }).map((s) => s.key);
    expect(keys).toEqual(['account', 'organization', 'access', 'preferences', 'branding', 'security', 'system']);
  });

  it('con gestión de accesos: "access" es Activo y navega a /settings/access', () => {
    const access = buildSettingsSections({ canManageAccess: true }).find((s) => s.key === 'access')!;
    expect(access.status).toBe('ready');
    expect(access.href).toBe('/settings/access');
  });

  it('sin gestión de accesos: "access" queda bloqueado y sin href', () => {
    const access = buildSettingsSections({ canManageAccess: false }).find((s) => s.key === 'access')!;
    expect(access.status).toBe('locked');
    expect(access.href).toBeUndefined();
  });

  it('preferencias se marca como "soon" (sin persistencia / no fake save)', () => {
    const prefs = buildSettingsSections({ canManageAccess: true }).find((s) => s.key === 'preferences')!;
    expect(prefs.status).toBe('soon');
  });

  it('account/organization/branding/security son solo lectura', () => {
    const map = new Map(buildSettingsSections({ canManageAccess: true }).map((s) => [s.key, s.status]));
    expect(map.get('account')).toBe('readonly');
    expect(map.get('organization')).toBe('readonly');
    expect(map.get('branding')).toBe('readonly');
    expect(map.get('security')).toBe('readonly');
  });

  it('estado del sistema es Activo', () => {
    const sys = buildSettingsSections({ canManageAccess: false }).find((s) => s.key === 'system')!;
    expect(sys.status).toBe('ready');
    expect(sys.href).toBe('/settings/system');
  });

  it('solo usa rutas read-only existentes (lista blanca verificada)', () => {
    const allowed = new Set([
      '/settings/account',
      '/settings/organization',
      '/settings/access',
      '/settings/preferences',
      '/settings/branding',
      '/settings/security',
      '/settings/system',
    ]);
    for (const s of buildSettingsSections({ canManageAccess: true })) {
      if (s.href) expect(allowed.has(s.href)).toBe(true);
    }
  });

  it('cada estado tiene etiqueta es-CO', () => {
    expect(SETTINGS_STATUS_LABELS.ready).toBe('Activo');
    expect(SETTINGS_STATUS_LABELS.readonly).toBe('Solo lectura');
    expect(SETTINGS_STATUS_LABELS.soon).toBe('Próximamente');
    expect(SETTINGS_STATUS_LABELS.locked).toBe('Requiere permisos');
  });
});

describe('settings-sections — SYSTEM_MODULES', () => {
  it('incluye los módulos operativos clave + Command Search', () => {
    expect(SYSTEM_MODULES).toContain('Dashboard');
    expect(SYSTEM_MODULES).toContain('Command Search');
    expect(SYSTEM_MODULES.length).toBe(8);
  });
});
