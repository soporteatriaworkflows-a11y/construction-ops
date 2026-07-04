/**
 * members-table.tsx — Lista de usuarios activos + cambio de rol (Client).
 *
 * El cambio de rol solo se ofrece para miembros editables (no uno mismo; y
 * gerencia no edita admins). El backstop real es la RPC SQL.
 *
 * V5.6.6A: el select de rol es CONTROLADO y el rol actual siempre está entre
 * las opciones (ver role-options.ts); el submit exige confirmación explícita
 * "de X a Y" y queda deshabilitado si no hay cambio.
 */
'use client';

import { useActionState, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { changeRoleAction, type AccessActionResult } from '../actions';
import { roleLabel } from '../labels';
import { buildRoleOptions } from '../role-options';
import { ProjectGrantsCell, type GrantableProject } from './project-grants-cell';

export interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  editable: boolean;
  /** V5.6.4: proyectos asignados (solo relevante para rol `consulta`). */
  grantedProjectIds: string[];
}

const INITIAL: AccessActionResult | null = null;

// V5.6.6C: roles con asignación de proyectos (espejo de SCOPED_PROFILE_ROLES
// de server/auth/types; literal local porque este es un Client Component).
const SCOPED_GRANT_ROLES = ['consulta', 'obra', 'compras'];

function RoleCell({ member, assignableRoles }: { member: MemberRow; assignableRoles: string[] }) {
  const [state, formAction, isPending] = useActionState(changeRoleAction, INITIAL);
  // Select CONTROLADO: lo que se envía es exactamente lo que el usuario ve.
  // Con defaultValue, un member.role ausente de las opciones hacía que el
  // navegador seleccionara la primera visible (p. ej. "gerencia") y un submit
  // accidental cambiaba el rol sin que nadie lo eligiera.
  const [selected, setSelected] = useState(member.role);
  const options = buildRoleOptions(member.role, assignableRoles);
  const unchanged = selected === member.role;

  if (!member.editable) {
    return <span className="text-sm font-medium text-iconic-ink">{roleLabel(member.role)}</span>;
  }

  return (
    <form
      action={formAction}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        if (unchanged) {
          e.preventDefault();
          return;
        }
        const ok = window.confirm(
          `¿Cambiar el rol de ${member.email} de "${roleLabel(member.role)}" a "${roleLabel(selected)}"?`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={member.userId} />
      <Select
        name="role"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={isPending}
        aria-label={`Rol de ${member.email}`}
        className="h-8 w-44 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={!o.assignable}>
            {roleLabel(o.value)}
            {o.assignable ? '' : ' (actual)'}
          </option>
        ))}
      </Select>
      <Button
        type="submit"
        variant="outline"
        className="h-8 px-2"
        disabled={isPending || unchanged}
        aria-label="Guardar rol"
        title={unchanged ? 'Selecciona un rol distinto para guardar' : 'Guardar rol'}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      {state?.error && (
        <span className="text-xs text-red-600" role="alert">
          {state.error}
        </span>
      )}
      {state?.success && !isPending && (
        <span className="text-xs text-emerald-600" role="status">
          Rol actualizado a {roleLabel(member.role)}.
        </span>
      )}
    </form>
  );
}

export function MembersTable({
  members,
  assignableRoles,
  projects,
  canManageGrants,
}: {
  members: MemberRow[];
  assignableRoles: string[];
  /** Proyectos activos de la organización (para asignar a `consulta`). */
  projects: GrantableProject[];
  /** V5.6.4: si el actor puede gestionar asignaciones (admin/gerencia). */
  canManageGrants: boolean;
}) {
  if (members.length === 0) {
    return <p className="text-sm text-iconic-graphite/60">No hay usuarios activos.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-iconic-soft-blue/50">
      <table className="w-full text-left text-sm">
        <thead className="bg-iconic-gray/60 text-xs uppercase tracking-wide text-iconic-graphite/70">
          <tr>
            <th scope="col" className="px-4 py-2.5">Nombre</th>
            <th scope="col" className="px-4 py-2.5">Correo</th>
            <th scope="col" className="px-4 py-2.5">Rol</th>
            <th scope="col" className="px-4 py-2.5">Proyectos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-iconic-soft-blue/40">
          {members.map((m) => (
            <tr key={m.userId}>
              <td className="px-4 py-3 font-medium text-iconic-ink">{m.fullName}</td>
              <td className="px-4 py-3 text-iconic-graphite/80">{m.email}</td>
              <td className="px-4 py-3">
                <RoleCell member={m} assignableRoles={assignableRoles} />
              </td>
              <td className="px-4 py-3">
                {SCOPED_GRANT_ROLES.includes(m.role) ? (
                  // V5.6.6C: consulta, obra y compras se asignan por proyecto.
                  <ProjectGrantsCell
                    userId={m.userId}
                    projects={projects}
                    grantedProjectIds={m.grantedProjectIds}
                    canManage={canManageGrants}
                  />
                ) : (
                  <span className="text-xs text-iconic-graphite/50">
                    Todos (allow-all)
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
