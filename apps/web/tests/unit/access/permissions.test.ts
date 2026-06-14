/**
 * permissions.test.ts — Reglas puras de permisos de acceso (FASE 9: 3,5,6,7).
 */
import { describe, expect, it } from 'vitest';
import {
  canManageAccess,
  assignableRoles,
  canAssignRole,
  evaluateRoleChange,
  isProfileRole,
  PROFILE_ROLES,
} from '@/server/access/permissions';

describe('canManageAccess (gating de UI/acciones)', () => {
  it('admin y gerencia gestionan; el resto no (23/24)', () => {
    expect(canManageAccess('admin')).toBe(true);
    expect(canManageAccess('gerencia')).toBe(true);
    expect(canManageAccess('presupuestos')).toBe(false);
    expect(canManageAccess('compras')).toBe(false);
    expect(canManageAccess('obra')).toBe(false); // site
    expect(canManageAccess('consulta')).toBe(false); // client
    expect(canManageAccess(null)).toBe(false);
    expect(canManageAccess(undefined)).toBe(false);
  });
});

describe('assignableRoles / canAssignRole (anti-escalamiento)', () => {
  it('admin puede asignar los 6 roles', () => {
    expect(assignableRoles('admin').sort()).toEqual([...PROFILE_ROLES].sort());
  });
  it('gerencia puede asignar todos menos admin (26)', () => {
    const roles = assignableRoles('gerencia');
    expect(roles).not.toContain('admin');
    expect(roles).toContain('gerencia');
    expect(roles).toContain('obra');
  });
  it('site/client no pueden asignar ningún rol (5)', () => {
    expect(assignableRoles('obra')).toEqual([]);
    expect(assignableRoles('consulta')).toEqual([]);
  });
  it('gerencia NO puede asignar admin; admin sí', () => {
    expect(canAssignRole('gerencia', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'admin')).toBe(true);
  });
});

describe('isProfileRole (6: rol inválido rechazado)', () => {
  it('acepta solo los 6 válidos', () => {
    for (const r of PROFILE_ROLES) expect(isProfileRole(r)).toBe(true);
    expect(isProfileRole('superuser')).toBe(false);
    expect(isProfileRole('')).toBe(false);
    expect(isProfileRole(null)).toBe(false);
  });
});

describe('evaluateRoleChange (7: nadie sube su propio rol)', () => {
  it('rechaza cambiar el propio rol', () => {
    expect(
      evaluateRoleChange({
        actorRole: 'admin',
        actorIsTarget: true,
        targetCurrentRole: 'admin',
        newRole: 'gerencia',
      }),
    ).toEqual({ ok: false, reason: 'cannot_change_self' });
  });
  it('rechaza si el actor no es gestión', () => {
    expect(
      evaluateRoleChange({
        actorRole: 'presupuestos',
        actorIsTarget: false,
        targetCurrentRole: 'obra',
        newRole: 'compras',
      }).reason,
    ).toBe('insufficient_role');
  });
  it('gerencia no asigna admin ni modifica a un admin', () => {
    expect(
      evaluateRoleChange({
        actorRole: 'gerencia',
        actorIsTarget: false,
        targetCurrentRole: 'obra',
        newRole: 'admin',
      }).reason,
    ).toBe('cannot_manage_admin');
    expect(
      evaluateRoleChange({
        actorRole: 'gerencia',
        actorIsTarget: false,
        targetCurrentRole: 'admin',
        newRole: 'obra',
      }).reason,
    ).toBe('cannot_manage_admin');
  });
  it('rechaza rol inválido', () => {
    expect(
      evaluateRoleChange({
        actorRole: 'admin',
        actorIsTarget: false,
        targetCurrentRole: 'obra',
        newRole: 'root',
      }).reason,
    ).toBe('invalid_role');
  });
  it('admin cambia rol de otro miembro: ok', () => {
    expect(
      evaluateRoleChange({
        actorRole: 'admin',
        actorIsTarget: false,
        targetCurrentRole: 'obra',
        newRole: 'presupuestos',
      }),
    ).toEqual({ ok: true });
  });
});
