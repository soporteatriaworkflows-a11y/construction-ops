import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_SETTINGS } from '@/lib/steel/mock-data';

function SettingRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-iconic-soft-blue/20 py-2.5 last:border-0">
      <div>
        <p className="text-sm text-iconic-ink">{label}</p>
        {hint && <p className="text-xs text-iconic-graphite/50">{hint}</p>}
      </div>
      <input
        type="text"
        defaultValue={value}
        readOnly
        className="w-28 rounded-md border border-iconic-soft-blue/50 bg-gray-50 px-2 py-1 text-right text-sm text-iconic-graphite/70"
      />
    </div>
  );
}

export default function SteelSettingsPage() {
  const s = MOCK_STEEL_SETTINGS;

  return (
    <div>
      <PageHeader
        title="Configuración de Steel Ops"
        description="Defaults D3/D5 de esta oleada. Mock de solo lectura — sin persistencia; editar aquí no guarda nada todavía."
      />

      <InlineCallout tone="info" title="Configurable por proyecto/proveedor/familia" className="mb-4">
        Estos valores son el default inicial acordado (D3/D5). La versión real permitirá
        sobreescribir por proyecto, proveedor y familia.
      </InlineCallout>

      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard variant="metric">
          <h3 className="mb-2 text-sm font-semibold text-iconic-ink">Longitudes y kerf</h3>
          <SettingRow label="Longitudes comerciales" value={`${s.commercialLengthsM.join(' / ')} m`} />
          <SettingRow label="Kerf refuerzo" value={`${s.kerfRebarM} m`} hint="Pedido por longitud nominal" />
          <SettingRow label="Kerf perfiles" value={`${s.kerfProfilesM} m`} hint="Configurable por familia/material" />
          <SettingRow label="Sobrante mínimo útil — refuerzo" value={`${s.minimumUsefulOffcutRebarM} m`} />
          <SettingRow label="Sobrante mínimo útil — perfiles" value={`${s.minimumUsefulOffcutProfilesM} m`} />
        </SurfaceCard>

        <SurfaceCard variant="metric">
          <h3 className="mb-2 text-sm font-semibold text-iconic-ink">Umbrales de desperdicio (D5)</h3>
          <SettingRow label="Refuerzo — advertencia" value={`${s.wasteWarningPctRebar}%`} />
          <SettingRow label="Refuerzo — crítico" value={`${s.wasteCriticalPctRebar}%`} />
          <SettingRow label="Perfiles — advertencia" value={`${s.wasteWarningPctProfiles}%`} />
          <SettingRow label="Perfiles — crítico" value={`${s.wasteCriticalPctProfiles}%`} />
          <SettingRow label="Proveedor por defecto" value={s.defaultSupplierName} />
        </SurfaceCard>
      </div>
    </div>
  );
}
