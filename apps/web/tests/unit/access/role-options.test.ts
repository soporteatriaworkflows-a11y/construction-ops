/**
 * role-options.test.ts — V5.6.6A fix del bug de cambio de rol.
 *
 * Contrato: el rol ACTUAL del miembro siempre está entre las opciones del
 * select (aunque el actor no pueda asignarlo), y las opciones asignables
 * reflejan exactamente assignableRoles. Sin esto, un <select> nativo con
 * defaultValue ausente cae en la primera opción visible (p. ej. "gerencia")
 * y un submit accidental cambia el rol sin elección explícita.
 */
import { describe, expect, it } from 'vitest';
import { buildRoleOptions } from '@/app/(dashboard)/settings/access/role-options';
import { roleLabel } from '@/app/(dashboard)/settings/access/labels';

const ALL_ROLES = ['admin', 'gerencia', 'presupuestos', 'obra', 'compras', 'consulta'];
const GERENCIA_ASSIGNABLE = ALL_ROLES.filter((r) => r !== 'admin');

describe('buildRoleOptions (V5.6.6A)', () => {
  it('incluye el rol actual aunque el actor no pueda asignarlo (admin visto por gerencia)', () => {
    const opts = buildRoleOptions('admin', GERENCIA_ASSIGNABLE);
    const admin = opts.find((o) => o.value === 'admin');
    expect(admin).toBeDefined();
    expect(admin!.assignable).toBe(false);
    // El rol actual va primero: nunca queda seleccionada una opción que el
    // usuario no eligió.
    expect(opts[0]!.value).toBe('admin');
  });

  it('no duplica el rol actual cuando ya es asignable', () => {
    const opts = buildRoleOptions('compras', ALL_ROLES);
    expect(opts.filter((o) => o.value === 'compras')).toHaveLength(1);
    expect(opts.find((o) => o.value === 'compras')!.assignable).toBe(true);
  });

  it('mantiene el orden y el contenido de assignableRoles', () => {
    const opts = buildRoleOptions('consulta', ALL_ROLES);
    expect(opts.map((o) => o.value)).toEqual(ALL_ROLES);
    expect(opts.every((o) => o.assignable)).toBe(true);
  });

  it('con assignableRoles vacío solo ofrece el rol actual como no asignable', () => {
    const opts = buildRoleOptions('obra', []);
    expect(opts).toEqual([{ value: 'obra', assignable: false }]);
  });

  it('la primera opción NUNCA es un rol distinto al actual cuando el actual no es asignable', () => {
    // Regresión directa del bug "termina como gerencia": si el rol actual no
    // está entre las opciones, el navegador seleccionaría la primera
    // (gerencia para un actor gerencia). buildRoleOptions lo evita.
    const opts = buildRoleOptions('admin', GERENCIA_ASSIGNABLE);
    expect(opts[0]!.value).not.toBe('gerencia');
  });
});

describe('naming de roles (V5.6.6A)', () => {
  it('consulta se etiqueta "Cliente / consulta" sin crear rol DB nuevo', () => {
    expect(roleLabel('consulta')).toBe('Cliente / consulta');
    // No existe rol `cliente` en el dominio: cae al passthrough del código.
    expect(roleLabel('cliente')).toBe('cliente');
  });

  it('los roles internos conservan sus etiquetas', () => {
    expect(roleLabel('admin')).toBe('Administrador');
    expect(roleLabel('gerencia')).toBe('Gerencia');
    expect(roleLabel('presupuestos')).toBe('Presupuestos');
    expect(roleLabel('compras')).toBe('Compras');
    expect(roleLabel('obra')).toBe('Obra');
  });
});
