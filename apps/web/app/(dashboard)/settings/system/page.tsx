/**
 * /settings/system — Estado del sistema (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, presentacional read-only. Tarjeta tipo health: modo de datos
 * (derivado de READ_MODEL_SOURCE vía mode-label, SIN exponerlo) y módulos
 * disponibles. NO imprime env ni secretos.
 */
import { CheckCircle2 } from 'lucide-react';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { readModelModeLabel } from '@/lib/utils/mode-label';
import { SYSTEM_MODULES } from '@/app/(dashboard)/settings/_lib/settings-sections';
import { SubSettingsHeader, Panel, InfoRow } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

export default function SystemStatusPage() {
  const ws = getActiveWorkspace();
  const mode = readModelModeLabel();

  return (
    <div>
      <SubSettingsHeader
        title="Estado del sistema"
        description="Modo de datos y módulos disponibles."
        status="ready"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tarjeta de salud — modo de datos */}
        <Panel className="lg:col-span-1">
          <div
            className="-m-5 mb-4 rounded-t-2xl px-5 py-4 text-white"
            style={{ background: 'linear-gradient(120deg, #020148 0%, #0a1145 100%)' }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-iconic-soft-blue/70">Modo de datos</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${mode.isFixture ? 'bg-amber-400' : 'bg-iconic-cyan'}`}
                style={mode.isFixture ? undefined : { boxShadow: '0 0 6px 1px rgba(0,184,255,0.7)' }}
                aria-hidden="true"
              />
              {mode.label}
            </p>
          </div>
          <div className="divide-y divide-iconic-soft-blue/40">
            <InfoRow label="Aplicación" value={ws.productName} />
            <InfoRow label="Workspace" value={ws.workspaceName} />
            <InfoRow
              label="Fuente de lectura"
              value={mode.isFixture ? 'Demostración' : 'Producción (datos reales)'}
            />
          </div>
        </Panel>

        {/* Módulos disponibles */}
        <Panel title="Módulos disponibles" className="lg:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {SYSTEM_MODULES.map((m) => (
              <li
                key={m}
                className="flex items-center gap-2 rounded-lg border border-iconic-soft-blue/50 bg-white px-3 py-2 text-sm font-medium text-iconic-ink"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span className="flex-1">{m}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Disponible</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
