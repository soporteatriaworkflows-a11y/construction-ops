/**
 * /settings/security — Seguridad (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, presentacional read-only. Resume el estado de autenticación
 * y acceso por roles del actor YA resuelto server-side. NO toca auth ni expone
 * secretos. Enlaza /logout (route handler existente).
 */
import { ShieldCheck, LogOut, Lock } from 'lucide-react';
import { ROLE_LABELS } from '@/components/shared/account-menu';
import { resolveSettingsActor } from '@/app/(dashboard)/settings/_lib/resolve-settings-actor';
import { SubSettingsHeader, Panel, InfoRow } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

/** Módulos detrás de autenticación (rutas protegidas conocidas, presentacional). */
const PROTECTED_AREAS = [
  'Dashboard',
  'Proyectos',
  'Presupuestos',
  'APU',
  'Catálogo',
  'Cantidades',
  'Cronograma',
  'Configuración',
];

export default async function SecurityPage() {
  const actor = await resolveSettingsActor();
  const roleLabel = actor.role ? ROLE_LABELS[actor.role] ?? actor.role : '—';

  return (
    <div>
      <SubSettingsHeader
        title="Seguridad"
        description="Autenticación y acceso por roles."
        status="readonly"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sesión">
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Autenticación activa
          </div>
          <div className="divide-y divide-iconic-soft-blue/40">
            <InfoRow label="Correo de sesión" value={actor.email ?? '—'} />
            <InfoRow label="Rol" value={roleLabel} />
            <InfoRow label="Acceso por roles" value="Habilitado" />
          </div>
          <a
            href="/logout"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
          </a>
        </Panel>

        <Panel title="Rutas protegidas" description="Áreas accesibles solo con sesión válida.">
          <ul className="grid grid-cols-2 gap-2">
            {PROTECTED_AREAS.map((area) => (
              <li
                key={area}
                className="flex items-center gap-2 rounded-lg border border-iconic-soft-blue/50 bg-white px-2.5 py-1.5 text-xs font-medium text-iconic-ink"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-iconic-primary" aria-hidden="true" /> {area}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-iconic-gray/60 px-3 py-2 text-xs text-iconic-graphite/55">
            El acceso se valida server-side en cada solicitud; ocultar un control no es la única
            barrera.
          </p>
        </Panel>
      </div>
    </div>
  );
}
