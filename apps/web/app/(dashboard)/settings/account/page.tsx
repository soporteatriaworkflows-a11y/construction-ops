/**
 * /settings/account — Mi cuenta (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, request-time. SOLO lectura de datos del actor YA resueltos
 * server-side. NO edita perfil (no existe acción segura): es read-only. No se
 * inventa "último acceso" ni otros campos inexistentes.
 */
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { ROLE_LABELS } from '@/components/shared/account-menu';
import { initialsFromEmail } from '@/app/(dashboard)/settings/_lib/account-display';
import { resolveSettingsActor } from '@/app/(dashboard)/settings/_lib/resolve-settings-actor';
import { Panel, InfoRow, SubSettingsHeader } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const ws = getActiveWorkspace();
  const actor = await resolveSettingsActor();
  const roleLabel = actor.role ? ROLE_LABELS[actor.role] ?? actor.role : '—';

  return (
    <div>
      <SubSettingsHeader
        title="Mi cuenta"
        description="Tu perfil y sesión en ICONIC OPS."
        status="readonly"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Avatar / identidad */}
        <Panel className="flex flex-col items-center justify-center text-center lg:col-span-1">
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-iconic-primary text-2xl font-semibold text-white">
            {initialsFromEmail(actor.email)}
          </span>
          <p className="mt-3 truncate text-sm font-semibold text-iconic-ink">{actor.email ?? 'Usuario'}</p>
          <p className="text-xs text-iconic-graphite/55">{ws.workspaceName}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Sesión activa
          </span>
        </Panel>

        {/* Detalle read-only */}
        <Panel title="Detalles de la cuenta" className="lg:col-span-2">
          <div className="divide-y divide-iconic-soft-blue/40">
            <InfoRow label="Correo electrónico" value={actor.email ?? '—'} />
            <InfoRow label="Rol" value={roleLabel} />
            <InfoRow label="Organización" value={ws.workspaceName} />
            <InfoRow
              label="Permisos"
              value={actor.canManageAccess ? 'Puede gestionar accesos' : 'Acceso estándar'}
            />
            <InfoRow label="Estado de acceso" value="Activo" />
          </div>
          <p className="mt-4 rounded-lg bg-iconic-gray/60 px-3 py-2 text-xs text-iconic-graphite/55">
            La edición del perfil estará disponible próximamente. Por ahora estos datos son de
            solo lectura.
          </p>
        </Panel>
      </div>
    </div>
  );
}
