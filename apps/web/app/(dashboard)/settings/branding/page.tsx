/**
 * /settings/branding — Branding (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, presentacional. Muestra la identidad ICONIC OPS activa:
 * marca, paleta y logo (assets existentes). SIN upload ni edición (no hay backend
 * seguro): read-only. La paleta se lee del tema del workspace.
 */
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { WorkspaceLogoFull, WorkspaceLogo } from '@/components/shared/workspace-brand';
import { SubSettingsHeader, Panel, InfoRow } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

const PALETTE: { name: string; token: keyof ReturnType<typeof getActiveWorkspace>['theme']; hex: string }[] = [
  { name: 'Azul noche', token: 'ink', hex: '#020148' },
  { name: 'Azul ICONIC', token: 'primary', hex: '#005DD6' },
  { name: 'Cian acento', token: 'cyan', hex: '#00B8FF' },
  { name: 'Azul suave', token: 'softBlue', hex: '#C7DCED' },
];

export default function BrandingPage() {
  const ws = getActiveWorkspace();

  return (
    <div>
      <SubSettingsHeader
        title="Branding"
        description="Identidad visual del workspace en ICONIC OPS."
        status="readonly"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Marca">
          <div className="flex flex-col items-center gap-4 py-2">
            <WorkspaceLogoFull />
            <div className="flex items-center gap-3">
              <WorkspaceLogo size={40} />
              <div>
                <p className="text-sm font-semibold text-iconic-ink">{ws.productName}</p>
                <p className="text-xs text-iconic-graphite/55">{ws.workspaceName}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Branding activo
            </span>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Paleta">
            <div className="grid grid-cols-2 gap-3">
              {PALETTE.map((c) => (
                <div key={c.token} className="flex items-center gap-3 rounded-lg border border-iconic-soft-blue/50 p-2">
                  <span
                    className="h-9 w-9 shrink-0 rounded-md ring-1 ring-black/5"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-iconic-ink">{c.name}</p>
                    <p className="font-mono text-[11px] text-iconic-graphite/55">{c.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Detalles">
            <div className="divide-y divide-iconic-soft-blue/40">
              <InfoRow label="Producto" value={ws.productName} />
              <InfoRow label="Workspace" value={ws.workspaceName} />
              <InfoRow label="Descriptor" value={ws.descriptor} />
            </div>
            <p className="mt-4 rounded-lg bg-iconic-gray/60 px-3 py-2 text-xs text-iconic-graphite/55">
              La carga de logo y la personalización de marca estarán disponibles próximamente.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
