/**
 * operations-timeline-card.tsx — Shell longitudinal "Línea de tiempo operativa" (V5.4.2c patch).
 *
 * Pieza horizontal a la derecha de Quick Notes en el "Pulso operativo". Es un SHELL honesto:
 * base visual + estado "Próximamente" + anclas con datos YA disponibles en el dashboard
 * (sin queries nuevas). NO es la feature de V5.4.3; no inventa datos fake. Presentacional.
 */
import { Activity } from 'lucide-react';
import { SurfaceCard } from './surface-card';
import { formatDateTime } from '@/lib/utils/format';

export function OperationsTimelineCard({
  className,
  lastUpdatedAt,
  lastRunAt,
}: {
  className?: string;
  lastUpdatedAt?: string | null;
  lastRunAt?: string | null;
}) {
  const anchors = [
    lastUpdatedAt ? { dot: 'bg-iconic-primary', label: 'Presupuesto actualizado', value: formatDateTime(lastUpdatedAt) } : null,
    lastRunAt ? { dot: 'bg-iconic-cyan', label: 'Último monitoreo', value: formatDateTime(lastRunAt) } : null,
  ].filter((a): a is { dot: string; label: string; value: string } => a !== null);

  return (
    <SurfaceCard variant="chart" className={className}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
          <Activity className="h-4 w-4 text-iconic-primary/70" aria-hidden="true" />
          Línea de tiempo operativa
        </p>
        <span className="text-[10px] text-content-muted">Próximamente</span>
      </div>

      {/* Riel longitudinal (base para V5.4.3) con anclas reales (sin queries nuevas). */}
      <div className="mt-4">
        <div className="h-px w-full bg-line" aria-hidden="true" />
        {anchors.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2" role="list">
            {anchors.map((a) => (
              <li key={a.label} className="inline-flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden="true" />
                {a.label} · <span className="text-content">{a.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-sm text-content-muted">
        Próximamente: actividad operativa reciente — monitoreos, revisiones de precios y acciones pendientes.
      </p>
    </SurfaceCard>
  );
}
