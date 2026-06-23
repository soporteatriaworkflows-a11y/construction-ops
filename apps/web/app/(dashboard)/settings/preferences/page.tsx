/**
 * /settings/preferences — Preferencias (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * Server Component, presentacional. SIN persistencia: los controles son una
 * vista previa de solo lectura (deshabilitados); NO hay "fake save". Refleja los
 * valores actuales de la instancia es-CO / COP. Marcado "Próximamente".
 */
import { SubSettingsHeader, Panel, InfoRow } from '@/app/(dashboard)/settings/_components/settings-ui';

export const dynamic = 'force-dynamic';

/** Opciones presentacionales (deshabilitadas). `active` marca el valor vigente. */
function Segmented({ options, active }: { options: string[]; active: string }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-iconic-gray/70 p-1" aria-disabled="true">
      {options.map((opt) => (
        <span
          key={opt}
          className={`cursor-not-allowed rounded-md px-2.5 py-1 text-xs font-medium ${
            opt === active ? 'bg-white text-iconic-ink shadow-sm ring-1 ring-iconic-soft-blue' : 'text-iconic-graphite/45'
          }`}
        >
          {opt}
        </span>
      ))}
    </div>
  );
}

export default function PreferencesPage() {
  return (
    <div>
      <SubSettingsHeader
        title="Preferencias"
        description="Idioma, moneda, formato y visualización."
        status="soon"
      />

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
        Vista previa de solo lectura. La personalización de preferencias estará disponible
        próximamente; aún no se guardan cambios.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Regional">
          <div className="divide-y divide-iconic-soft-blue/40">
            <InfoRow label="Idioma" value="Español (Colombia)" />
            <InfoRow label="Moneda" value="COP — Peso colombiano" />
            <InfoRow label="Formato de números" value="1.234.567,89" />
            <InfoRow label="Formato de fecha" value="dd/mm/aaaa" />
          </div>
        </Panel>

        <Panel title="Visualización" description="Próximamente — controles deshabilitados.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-iconic-graphite/60">Modo visual</span>
              <Segmented options={['Claro', 'Oscuro', 'Sistema']} active="Claro" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-iconic-graphite/60">Densidad</span>
              <Segmented options={['Cómoda', 'Compacta']} active="Cómoda" />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
