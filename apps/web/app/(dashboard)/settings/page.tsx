/**
 * /settings — Hub de Configuración (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, request-time. SOLO presentación + lectura de datos YA
 * resueltos server-side (actor, workspace, modo de datos). No escribe nada, no
 * crea backend. Hero de identidad + cards premium hacia sub-secciones read-only.
 * "Usuarios y accesos" enlaza /settings/access; "Cerrar sesión" enlaza /logout.
 */
import Link from 'next/link';
import { LogOut, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { readModelModeLabel } from '@/lib/utils/mode-label';
import { ROLE_LABELS } from '@/components/shared/account-menu';
import { initialsFromEmail } from '@/app/(dashboard)/settings/_lib/account-display';
import { resolveSettingsActor } from '@/app/(dashboard)/settings/_lib/resolve-settings-actor';
import { buildSettingsSections } from '@/app/(dashboard)/settings/_lib/settings-sections';
import { IconPlate, StatusChip, SETTINGS_ICONS } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

export default async function SettingsHubPage() {
  const ws = getActiveWorkspace();
  const mode = readModelModeLabel();
  const actor = await resolveSettingsActor();
  const roleLabel = actor.role ? ROLE_LABELS[actor.role] ?? actor.role : null;
  const sections = buildSettingsSections({ canManageAccess: actor.canManageAccess });

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Configuración"
        description="Cuenta, organización, accesos y preferencias de ICONIC OPS."
      />

      {/* Hero de identidad — panel navy con acento cian (jerarquía premium). */}
      <section
        className="mb-6 overflow-hidden rounded-2xl border border-white/10 text-white shadow-iconic"
        style={{ background: 'linear-gradient(120deg, #020148 0%, #050a3a 55%, #0a1145 100%)' }}
      >
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold ring-1 ring-iconic-cyan/40"
            aria-hidden="true"
          >
            {initialsFromEmail(actor.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{actor.email ?? 'Usuario'}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-iconic-soft-blue/80">
              <span className="truncate">{ws.workspaceName}</span>
              {roleLabel && (
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white">
                  {roleLabel}
                </span>
              )}
            </p>
          </div>
          {/* Chip de modo de datos — refleja READ_MODEL_SOURCE sin exponerlo. */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
            <span
              className={`h-1.5 w-1.5 rounded-full ${mode.isFixture ? 'bg-amber-400' : 'bg-iconic-cyan'}`}
              style={mode.isFixture ? undefined : { boxShadow: '0 0 6px 1px rgba(0,184,255,0.7)' }}
              aria-hidden="true"
            />
            {mode.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3 sm:px-6">
          <Link
            href="/settings/account"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-cyan"
          >
            Ver mi cuenta <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="/logout"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-iconic-soft-blue/90 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
          </a>
        </div>
      </section>

      {/* Grid de secciones — cards premium, variadas por estado y acento. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = SETTINGS_ICONS[s.icon];
          const navigable = Boolean(s.href);
          const accentBorder =
            s.tone === 'cyan' ? 'border-iconic-cyan/40' : s.tone === 'navy' ? 'border-iconic-primary/30' : 'border-iconic-soft-blue/60';
          const inner = (
            <div
              className={cnCard(navigable, accentBorder)}
            >
              <IconPlate icon={Icon} tone={navigable ? s.tone : 'plain'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${navigable ? 'text-iconic-ink' : 'text-gray-500'}`}>{s.title}</h2>
                  <StatusChip status={s.status} />
                </div>
                <p className="mt-0.5 text-xs text-iconic-graphite/60">{s.description}</p>
              </div>
              {navigable && (
                <ChevronRight className="h-4 w-4 shrink-0 text-iconic-soft-blue group-hover:text-iconic-primary" aria-hidden="true" />
              )}
            </div>
          );
          return navigable ? (
            <Link
              key={s.key}
              href={s.href!}
              className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
            >
              {inner}
            </Link>
          ) : (
            <div key={s.key} aria-disabled="true" className="group">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Clase compuesta de la card (evita ternarios anidados en el JSX). */
function cnCard(navigable: boolean, accentBorder: string): string {
  return [
    'flex h-full items-start gap-3 rounded-2xl border bg-white p-4 transition-all',
    navigable ? `${accentBorder} hover:-translate-y-0.5 hover:shadow-iconic` : 'border-gray-200 bg-gray-50',
  ].join(' ');
}
