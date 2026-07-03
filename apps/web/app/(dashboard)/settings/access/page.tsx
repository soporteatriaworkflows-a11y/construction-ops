/**
 * /settings/access — Gestión operativa de accesos (usuarios e invitaciones).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §3,§7`.
 *
 * Server Component:
 *  - Resuelve el actor server-side y APLICA el gating (solo admin/gerencia).
 *  - Lista miembros e invitaciones por el read-model (filtrado por organización).
 *  - El cambio de rol/reenvío/revocación se ejecutan por Server Actions con
 *    verificación de permisos en el servidor (backstop SQL).
 */
import { ShieldAlert, Users, MailPlus } from 'lucide-react';
import {
  resolveAccessActor,
  canManageAccess,
  assignableRoles,
  listMembers,
  listInvitations,
  listProjectGrants,
} from '@/server/access';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { InlineCallout } from '@/components/shared/inline-callout';
import { OperationsHeader } from '@/components/shared/operations-header';
import { InviteForm } from './_components/invite-form';
import { MembersTable, type MemberRow } from './_components/members-table';
import { InvitationsTable, type InvitationRow } from './_components/invitations-table';

export const dynamic = 'force-dynamic';

export default async function AccessSettingsPage() {
  let actor: Awaited<ReturnType<typeof resolveAccessActor>>;
  try {
    actor = await resolveAccessActor();
  } catch {
    return <Unauthorized reason="No hay una sesión válida. Inicia sesión de nuevo." />;
  }

  if (!canManageAccess(actor.profileRole)) {
    return (
      <Unauthorized reason="Tu rol no tiene permisos para gestionar los accesos de la organización." />
    );
  }

  const [members, invitations, grants] = await Promise.all([
    listMembers(actor.organizationId),
    listInvitations(actor.organizationId),
    // V5.6.4: asignaciones usuario↔proyecto (RLS-bound; fixture ⇒ []).
    listProjectGrants(),
  ]);

  // Proyectos activos de la organización para el diálogo de asignación. El
  // actor es admin/gerencia ⇒ el read-model devuelve todos los de su org.
  let grantableProjects: { id: string; name: string }[] = [];
  try {
    const viewer = await resolveViewer();
    grantableProjects = (await getReadModel().listProjects(viewer)).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  } catch {
    grantableProjects = [];
  }

  const grantsByProfile = new Map<string, string[]>();
  for (const g of grants) {
    const bucket = grantsByProfile.get(g.profileId) ?? [];
    bucket.push(g.projectId);
    grantsByProfile.set(g.profileId, bucket);
  }

  const roles = assignableRoles(actor.profileRole);

  const memberRows: MemberRow[] = members.map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
    editable:
      m.userId !== actor.userId &&
      (actor.profileRole === 'admin' || m.role !== 'admin'),
    grantedProjectIds: grantsByProfile.get(m.userId) ?? [],
  }));

  const invitationRows: InvitationRow[] = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    fullName: i.fullName,
    role: i.role,
    effectiveStatus: i.effectiveStatus,
    expiresAt: i.expiresAt,
  }));

  const pendingCount = invitationRows.filter((i) => i.effectiveStatus === 'pending').length;

  return (
    <div className="space-y-8">
      <OperationsHeader
        eyebrow="Settings"
        title="Accesos y configuración"
        subtitle="Gestiona los usuarios de tu organización, sus roles y las invitaciones pendientes."
        stat={{ label: 'Usuarios', value: String(memberRows.length) }}
      />

      {/* Invitar */}
      <section className="rounded-xl border border-iconic-soft-blue/50 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-iconic-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-iconic-ink">Invitar usuario</h2>
        </div>
        <InviteForm assignableRoles={roles} />
        <InlineCallout tone="info" title="¿No llega el correo de invitación?" className="mt-4">
          Si el envío por correo no llega, copia el <strong>enlace de invitación</strong> de la tabla de
          abajo y compártelo manualmente con la persona (p. ej. tu equipo). El enlace permite definir la
          contraseña y entrar con el rol asignado.
        </InlineCallout>
        <InlineCallout tone="info" title="Rol Consulta: proyectos asignados" className="mt-3">
          Un usuario con rol <strong>Consulta</strong> no verá <strong>ningún proyecto</strong> hasta
          que le asignes uno en la columna Proyectos de la tabla de usuarios. Los proyectos nuevos no
          se asignan automáticamente.
        </InlineCallout>
      </section>

      {/* Usuarios activos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-iconic-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-iconic-ink">
            Usuarios activos
            <span className="ml-2 text-sm font-normal text-iconic-graphite/60">
              ({memberRows.length})
            </span>
          </h2>
        </div>
        <MembersTable
          members={memberRows}
          assignableRoles={roles}
          projects={grantableProjects}
          canManageGrants
        />
      </section>

      {/* Invitaciones */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-iconic-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-iconic-ink">
            Invitaciones
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
              </span>
            )}
          </h2>
        </div>
        <InvitationsTable invitations={invitationRows} />
      </section>
    </div>
  );
}

function Unauthorized({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
      <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-iconic-ink">Acceso restringido</h1>
      <p className="mt-1 text-sm text-iconic-graphite/70">{reason}</p>
    </div>
  );
}
