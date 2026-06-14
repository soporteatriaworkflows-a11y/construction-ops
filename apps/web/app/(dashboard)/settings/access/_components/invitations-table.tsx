/**
 * invitations-table.tsx — Invitaciones pendientes/históricas + reenviar/revocar.
 *
 * Reenviar/Revocar solo se ofrecen para invitaciones aún pendientes. El backstop
 * real es la RPC SQL. Si el reenvío no envía correo, muestra el enlace.
 */
'use client';

import { useActionState } from 'react';
import { Loader2, RefreshCw, Ban, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  resendInvitationAction,
  revokeInvitationAction,
  type AccessActionResult,
} from '../actions';
import type { InvitationStatus } from '@/server/access';
import { roleLabel, invitationStatusLabel, invitationStatusClasses } from '../labels';

export interface InvitationRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  effectiveStatus: InvitationStatus;
  expiresAt: string;
}

const INITIAL: AccessActionResult | null = null;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

function RowActions({ invitation }: { invitation: InvitationRow }) {
  const [resendState, resendAction, resending] = useActionState(resendInvitationAction, INITIAL);
  const [revokeState, revokeAction, revoking] = useActionState(revokeInvitationAction, INITIAL);

  const isPending = invitation.effectiveStatus === 'pending';
  if (!isPending) {
    return <span className="text-xs text-iconic-graphite/50">—</span>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" variant="outline" className="h-8 px-2 text-xs" disabled={resending} aria-label={`Reenviar invitación a ${invitation.email}`}>
            {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reenviar
          </Button>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" variant="outline" className="h-8 px-2 text-xs text-red-600 hover:bg-red-50" disabled={revoking} aria-label={`Revocar invitación a ${invitation.email}`}>
            {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Revocar
          </Button>
        </form>
      </div>
      {(resendState?.error || revokeState?.error) && (
        <p className="text-xs text-red-600">{resendState?.error ?? revokeState?.error}</p>
      )}
      {revokeState?.success && <p className="text-xs text-emerald-600">{revokeState.message}</p>}
      {resendState?.success && resendState.inviteLink && (
        <p className="flex items-start gap-1 text-xs text-amber-700">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          <code className="break-all">{resendState.inviteLink}</code>
        </p>
      )}
      {resendState?.success && !resendState.inviteLink && (
        <p className="text-xs text-emerald-600">{resendState.message}</p>
      )}
    </div>
  );
}

export function InvitationsTable({ invitations }: { invitations: InvitationRow[] }) {
  if (invitations.length === 0) {
    return <p className="text-sm text-iconic-graphite/60">No hay invitaciones registradas.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-iconic-soft-blue/50">
      <table className="w-full text-left text-sm">
        <thead className="bg-iconic-gray/60 text-xs uppercase tracking-wide text-iconic-graphite/70">
          <tr>
            <th scope="col" className="px-4 py-2.5">Correo</th>
            <th scope="col" className="px-4 py-2.5">Rol</th>
            <th scope="col" className="px-4 py-2.5">Estado</th>
            <th scope="col" className="px-4 py-2.5">Vence</th>
            <th scope="col" className="px-4 py-2.5">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-iconic-soft-blue/40">
          {invitations.map((inv) => (
            <tr key={inv.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-iconic-ink">{inv.email}</div>
                {inv.fullName && <div className="text-xs text-iconic-graphite/60">{inv.fullName}</div>}
              </td>
              <td className="px-4 py-3 text-iconic-graphite/80">{roleLabel(inv.role)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${invitationStatusClasses(inv.effectiveStatus)}`}>
                  {invitationStatusLabel(inv.effectiveStatus)}
                </span>
              </td>
              <td className="px-4 py-3 text-iconic-graphite/70">{fmtDate(inv.expiresAt)}</td>
              <td className="px-4 py-3"><RowActions invitation={inv} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
