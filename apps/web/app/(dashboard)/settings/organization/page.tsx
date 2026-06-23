/**
 * /settings/organization — Organización (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, request-time. SOLO lectura: nombre del workspace (branding),
 * modo de datos (Datos reales / Modo demostración) y resumen de permisos. Enlaza
 * a /settings/access. No escribe ni consulta repositories.
 */
import Link from 'next/link';
import { Users, ChevronRight } from 'lucide-react';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { readModelModeLabel } from '@/lib/utils/mode-label';
import { ROLE_LABELS } from '@/components/shared/account-menu';
import { WorkspaceLogo } from '@/components/shared/workspace-brand';
import { resolveSettingsActor } from '@/app/(dashboard)/settings/_lib/resolve-settings-actor';
import { Panel, InfoRow, SubSettingsHeader } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

export default async function OrganizationPage() {
  const ws = getActiveWorkspace();
  const mode = readModelModeLabel();
  const actor = await resolveSettingsActor();
  const roleLabel = actor.role ? ROLE_LABELS[actor.role] ?? actor.role : '—';

  return (
    <div>
      <SubSettingsHeader
        title="Organización"
        description="Datos del workspace y resumen de acceso."
        status="readonly"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="flex flex-col items-center justify-center text-center lg:col-span-1">
          <WorkspaceLogo size={64} />
          <p className="mt-3 text-sm font-semibold text-iconic-ink">{ws.workspaceName}</p>
          <p className="text-xs text-iconic-graphite/55">{ws.descriptor}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-iconic-gray/70 px-2.5 py-0.5 text-[11px] font-medium text-iconic-ink ring-1 ring-inset ring-iconic-soft-blue/60">
            <span
              className={`h-1.5 w-1.5 rounded-full ${mode.isFixture ? 'bg-amber-400' : 'bg-iconic-cyan'}`}
              aria-hidden="true"
            />
            {mode.label}
          </span>
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel title="Resumen">
            <div className="divide-y divide-iconic-soft-blue/40">
              <InfoRow label="Workspace" value={ws.workspaceName} />
              <InfoRow label="Producto" value={ws.productName} />
              <InfoRow label="Modo de datos" value={mode.label} />
              <InfoRow label="Tu rol" value={roleLabel} />
              <InfoRow
                label="Gestión de accesos"
                value={actor.canManageAccess ? 'Habilitada para tu rol' : 'No disponible para tu rol'}
              />
            </div>
          </Panel>

          <Panel title="Equipo y accesos" description="Invitaciones, roles y permisos del equipo.">
            {actor.canManageAccess ? (
              <Link
                href="/settings/access"
                className="group flex items-center gap-3 rounded-xl border border-iconic-soft-blue/60 bg-white p-3 transition-colors hover:border-iconic-primary/50 hover:shadow-iconic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-iconic-primary" aria-hidden="true">
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-iconic-ink">Usuarios y accesos</span>
                  <span className="block text-xs text-iconic-graphite/55">Administrar invitaciones y roles.</span>
                </span>
                <ChevronRight className="h-4 w-4 text-iconic-soft-blue group-hover:text-iconic-primary" aria-hidden="true" />
              </Link>
            ) : (
              <p className="rounded-lg bg-iconic-gray/60 px-3 py-2 text-xs text-iconic-graphite/55">
                La gestión de usuarios y accesos requiere permisos de administración.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
