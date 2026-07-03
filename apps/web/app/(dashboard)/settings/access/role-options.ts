/**
 * role-options.ts — opciones del selector de rol (V5.6.6A).
 *
 * Puro y sin dependencias server-only: importable por Client Components y
 * testeable en aislamiento.
 *
 * Regla clave (fix del bug de cambio de rol): el rol ACTUAL del miembro debe
 * estar SIEMPRE entre las opciones renderizadas, aunque el actor no pueda
 * asignarlo (p. ej. gerencia viendo a un admin). Con un <select> nativo, si
 * el valor actual no existe entre las <option>, el navegador selecciona la
 * primera visible y un submit sin abrir el dropdown envía un rol que el
 * usuario nunca eligió.
 */

export interface RoleOption {
  value: string;
  /** false ⇒ solo representa el rol actual; no es asignable por el actor. */
  assignable: boolean;
}

export function buildRoleOptions(
  currentRole: string,
  assignableRoles: readonly string[],
): RoleOption[] {
  const options: RoleOption[] = assignableRoles.map((r) => ({
    value: r,
    assignable: true,
  }));
  if (currentRole && !assignableRoles.includes(currentRole)) {
    options.unshift({ value: currentRole, assignable: false });
  }
  return options;
}
