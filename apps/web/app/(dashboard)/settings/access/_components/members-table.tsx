/**
 * members-table.tsx — Lista de usuarios activos + cambio de rol (Client).
 *
 * El cambio de rol solo se ofrece para miembros editables (no uno mismo; y
 * gerencia no edita admins). El backstop real es la RPC SQL.
 */
'use client';

import { useActionState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { changeRoleAction, type AccessActionResult } from '../actions';
import { roleLabel } from '../labels';

export interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  editable: boolean;
}

const INITIAL: AccessActionResult | null = null;

function RoleCell({ member, assignableRoles }: { member: MemberRow; assignableRoles: string[] }) {
  const [state, formAction, isPending] = useActionState(changeRoleAction, INITIAL);

  if (!member.editable) {
    return <span className="text-sm font-medium text-iconic-ink">{roleLabel(member.role)}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.userId} />
      <Select
        name="role"
        defaultValue={member.role}
        disabled={isPending}
        aria-label={`Rol de ${member.email}`}
        className="h-8 w-44 text-sm"
      >
        {assignableRoles.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="outline" className="h-8 px-2" disabled={isPending} aria-label="Guardar rol">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-600">Actualizado</span>}
    </form>
  );
}

export function MembersTable({
  members,
  assignableRoles,
}: {
  members: MemberRow[];
  assignableRoles: string[];
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
