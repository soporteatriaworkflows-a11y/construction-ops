/**
 * /settings — Hub de configuración (ICONIC_OPS_UX_BLOCKERS_V1).
 *
 * Server Component, request-time. SOLO presentación: muestra datos del actor YA
 * resueltos server-side (resolveAccessActor, solo lectura). No escribe nada, no
 * crea backend. Secciones aún no construidas se muestran como "Próximamente".
 * "Usuarios y accesos" enlaza /settings/access; "Cerrar sesión" enlaza /logout.
 */
import Link from 'next/link';
import {
  User,
  Building2,
  Users,
  SlidersHorizontal,
  Palette,
  ShieldCheck,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { resolveAccessActor, canManageAccess } from '@/server/access';
import { ROLE_LABELS, initialsFromEmail } from '@/components/shared/account-menu';

export const dynamic = 'force-dynamic';

async function resolveActor(): Promise<{ email: string | null; role: string | null; canManage: boolean }> {
  try {
    const a = await resolveAccessActor();
    return { email: a.email ?? null, role: a.profileRole ?? null, canManage: canManageAccess(a.profileRole) };
  } catch {
    return { email: null, role: null, canManage: false };
  }
}

interface SettingCard {
  key: string;
  title: string;
  description: string;
  icon: typeof User;
  href?: string;
  external?: boolean;
  status: 'ready' | 'soon';
}

export default async function SettingsHubPage() {
  const ws = getActiveWorkspace();
  const actor = await resolveActor();
  const roleLabel = actor.role ? ROLE_LABELS[actor.role] ?? actor.role : null;

  const cards: SettingCard[] = [
    { key: 'account', title: 'Mi cuenta', description: 'Tu perfil, correo y sesión.', icon: User, status: 'soon' },
    { key: 'org', title: 'Organización', description: `${ws.workspaceName} · datos de la empresa.`, icon: Building2, status: 'soon' },
    {
      key: 'access',
      title: 'Usuarios y accesos',
      description: 'Invitaciones, roles y permisos del equipo.',
      icon: Users,
      href: actor.canManage ? '/settings/access' : undefined,
      status: actor.canManage ? 'ready' : 'soon',
    },
    { key: 'prefs', title: 'Preferencias', description: 'Formato, idioma y opciones de visualización.', icon: SlidersHorizontal, status: 'soon' },
    { key: 'branding', title: 'Branding', description: 'Logo y identidad del workspace.', icon: Palette, status: 'soon' },
    { key: 'security', title: 'Seguridad', description: 'Sesiones, contraseña y autenticación.', icon: ShieldCheck, status: 'soon' },
  ];

  return (
    <div>
      <PageHeader title="Configuración" description="Cuenta, organización, accesos y preferencias del workspace." />

      {/* Tarjeta de identidad del usuario */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-iconic-soft-blue/60 bg-white p-4 shadow-iconic">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-iconic-primary text-base font-semibold text-white">
          {initialsFromEmail(actor.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-iconic-ink">{actor.email ?? 'Usuario'}</p>
          <p className="truncate text-sm text-iconic-graphite/60">{ws.workspaceName}</p>
        </div>
        {roleLabel && (
          <Badge variant="secondary" className="ml-auto shrink-0">{roleLabel}</Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <div
              className={`group flex h-full items-start gap-3 rounded-xl border p-4 transition-colors ${
                c.href
                  ? 'border-iconic-soft-blue/60 bg-white hover:border-iconic-primary/50 hover:shadow-iconic'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.href ? 'bg-brand-50 text-iconic-primary' : 'bg-gray-100 text-gray-400'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${c.href ? 'text-iconic-ink' : 'text-gray-500'}`}>{c.title}</h2>
                  {c.status === 'soon' && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Próximamente</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-iconic-graphite/60">{c.description}</p>
              </div>
              {c.href && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-iconic-primary" aria-hidden="true" />}
            </div>
          );
          return c.href ? (
            <Link key={c.key} href={c.href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary rounded-xl">
              {inner}
            </Link>
          ) : (
            <div key={c.key} aria-disabled="true">{inner}</div>
          );
        })}
      </div>

      {/* Cerrar sesión */}
      <div className="mt-6">
        <a
          href="/logout"
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
        </a>
      </div>
    </div>
  );
}
