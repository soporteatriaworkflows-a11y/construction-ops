/**
 * module-access.test.ts — Matriz rol×módulo del endurecimiento V5.6.2.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_2_ROLE_ACCESS_MATRIX_HARDENING.md`.
 *
 * Verifica la FUENTE ÚNICA PURA `server/access/module-access.ts`:
 *  - matriz explícita (truth table independiente de la implementación);
 *  - deny-by-default (rol inválido/ausente, módulo desconocido);
 *  - lo que queda BLOQUEADO por rol (consulta/obra/compras/presupuestos);
 *  - `visibleModulesFor`;
 *  - `assertCanAccessModule`.
 *
 * Además, regresión de la capa de DATOS (no cambia en V5.6.2):
 *  - mapeo congelado `profiles.role → ViewerRole` (`consulta → client`);
 *  - anti-escalamiento de exports (`isSameOrLessPrivileged`).
 *
 * Puro: sin Supabase, sin DB, sin red.
 */
import { describe, it, expect } from 'vitest';
import {
  ACCESS_MODULES,
  canAccessModule,
  visibleModulesFor,
  assertCanAccessModule,
  isAccessModule,
  ModuleAccessError,
  type AccessModule,
} from '@/server/access/module-access';
import type { ProfileRole } from '@/server/auth/types';
import { mapProfileRoleToViewerRole, isSameOrLessPrivileged } from '@/server/auth/role-map';

const ALL_ROLES: ProfileRole[] = [
  'admin',
  'gerencia',
  'presupuestos',
  'compras',
  'obra',
  'consulta',
];

/**
 * Truth table ESCRITA A MANO (independiente de MODULE_ACCESS) para que un cambio
 * accidental en la matriz de producción rompa el test. Refleja la "matriz mínima
 * obligatoria" de V5.6.2.
 */
const EXPECTED: Record<AccessModule, ProfileRole[]> = {
  dashboard: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  projects: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  estimates: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  apu: ['admin', 'gerencia', 'presupuestos', 'consulta'],
  quantities: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  planning: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  catalog: ['admin', 'gerencia', 'presupuestos', 'compras'],
  'price-intelligence': ['admin', 'gerencia', 'compras'],
  monitoring: ['admin', 'gerencia', 'compras'],
  'operational-review': ['admin', 'gerencia'],
  'quick-notes': ['admin', 'gerencia', 'presupuestos', 'compras', 'obra'],
  settings: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  'settings-access': ['admin', 'gerencia'],
  exports: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
};

describe('module-access — matriz rol×módulo (V5.6.2)', () => {
  it('cada módulo tiene una expectativa declarada', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACCESS_MODULES].sort());
  });

  for (const mod of ACCESS_MODULES) {
    for (const role of ALL_ROLES) {
      const allowed = EXPECTED[mod].includes(role);
      it(`${role} ${allowed ? 'PUEDE' : 'NO puede'} acceder a "${mod}"`, () => {
        expect(canAccessModule(role, mod)).toBe(allowed);
      });
    }
  }
});

describe('module-access — deny-by-default', () => {
  it('rol nulo/undefined ⇒ denegado en todos los módulos', () => {
    for (const mod of ACCESS_MODULES) {
      expect(canAccessModule(null, mod)).toBe(false);
      expect(canAccessModule(undefined, mod)).toBe(false);
    }
  });

  it('rol desconocido ⇒ denegado', () => {
    expect(canAccessModule('superuser', 'dashboard')).toBe(false);
    expect(canAccessModule('root', 'catalog')).toBe(false);
    expect(canAccessModule('', 'projects')).toBe(false);
  });

  it('módulo desconocido ⇒ denegado incluso para admin', () => {
    expect(canAccessModule('admin', 'nope' as AccessModule)).toBe(false);
    expect(canAccessModule('admin', 'finance' as AccessModule)).toBe(false);
  });

  it('isAccessModule reconoce solo módulos válidos', () => {
    expect(isAccessModule('catalog')).toBe(true);
    expect(isAccessModule('monitoring')).toBe(true);
    expect(isAccessModule('finance')).toBe(false);
    expect(isAccessModule(null)).toBe(false);
  });
});

describe('module-access — qué queda BLOQUEADO por rol', () => {
  it('consulta: bloqueado en módulos internos', () => {
    for (const m of ['catalog', 'price-intelligence', 'monitoring', 'operational-review', 'quick-notes', 'settings-access'] as AccessModule[]) {
      expect(canAccessModule('consulta', m)).toBe(false);
    }
  });

  it('consulta: SÍ ve lectura client-safe', () => {
    for (const m of ['dashboard', 'projects', 'estimates', 'apu', 'quantities', 'planning', 'settings', 'exports'] as AccessModule[]) {
      expect(canAccessModule('consulta', m)).toBe(true);
    }
  });

  it('obra: bloqueado en pricing/review/access (y catalog/apu no listados)', () => {
    for (const m of ['catalog', 'apu', 'price-intelligence', 'monitoring', 'operational-review', 'settings-access'] as AccessModule[]) {
      expect(canAccessModule('obra', m)).toBe(false);
    }
  });

  it('compras: bloqueado en presupuestación y operational-review/access', () => {
    for (const m of ['estimates', 'apu', 'quantities', 'planning', 'operational-review', 'settings-access'] as AccessModule[]) {
      expect(canAccessModule('compras', m)).toBe(false);
    }
  });

  it('compras: SÍ ve catalog/price-intelligence/monitoring', () => {
    for (const m of ['catalog', 'price-intelligence', 'monitoring'] as AccessModule[]) {
      expect(canAccessModule('compras', m)).toBe(true);
    }
  });

  it('presupuestos: bloqueado en price-intelligence/monitoring/operational-review/access', () => {
    for (const m of ['price-intelligence', 'monitoring', 'operational-review', 'settings-access'] as AccessModule[]) {
      expect(canAccessModule('presupuestos', m)).toBe(false);
    }
  });

  it('gestión de accesos: solo admin/gerencia', () => {
    expect(canAccessModule('admin', 'settings-access')).toBe(true);
    expect(canAccessModule('gerencia', 'settings-access')).toBe(true);
    for (const r of ['presupuestos', 'compras', 'obra', 'consulta'] as ProfileRole[]) {
      expect(canAccessModule(r, 'settings-access')).toBe(false);
    }
  });
});

describe('module-access — visibleModulesFor', () => {
  it('admin ve todos los módulos', () => {
    expect(visibleModulesFor('admin').sort()).toEqual([...ACCESS_MODULES].sort());
  });

  it('consulta NO incluye módulos internos', () => {
    const visible = visibleModulesFor('consulta');
    for (const m of ['catalog', 'price-intelligence', 'monitoring', 'operational-review', 'quick-notes', 'settings-access']) {
      expect(visible).not.toContain(m);
    }
  });

  it('rol inválido ⇒ ningún módulo', () => {
    expect(visibleModulesFor(null)).toEqual([]);
    expect(visibleModulesFor('root')).toEqual([]);
  });
});

describe('module-access — assertCanAccessModule', () => {
  it('no lanza cuando hay acceso', () => {
    expect(() => assertCanAccessModule('admin', 'monitoring')).not.toThrow();
  });

  it('lanza ModuleAccessError cuando NO hay acceso', () => {
    expect(() => assertCanAccessModule('consulta', 'catalog')).toThrow(ModuleAccessError);
    expect(() => assertCanAccessModule(null, 'dashboard')).toThrow(ModuleAccessError);
  });
});

describe('capa de DATOS (regresión, NO cambia en V5.6.2)', () => {
  it('mapeo congelado profiles.role → ViewerRole', () => {
    expect(mapProfileRoleToViewerRole('consulta')).toBe('client');
    expect(mapProfileRoleToViewerRole('obra')).toBe('site');
    expect(mapProfileRoleToViewerRole('gerencia')).toBe('management');
    expect(mapProfileRoleToViewerRole('admin')).toBe('internal');
    expect(mapProfileRoleToViewerRole('presupuestos')).toBe('internal');
    expect(mapProfileRoleToViewerRole('compras')).toBe('internal');
  });

  it('exports: consulta (client) NO puede escalar a perfiles internos', () => {
    // client solo puede pedir client; jamás internal/management/site.
    expect(isSameOrLessPrivileged('client', 'client')).toBe(true);
    expect(isSameOrLessPrivileged('internal', 'client')).toBe(false);
    expect(isSameOrLessPrivileged('management', 'client')).toBe(false);
    expect(isSameOrLessPrivileged('site', 'client')).toBe(false);
  });
});
