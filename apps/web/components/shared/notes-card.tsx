/**
 * notes-card.tsx — "Notas rápidas" (ICONIC_OPS_UIX_DASHBOARD_INFORMATION_ARCHITECTURE_REDESIGN_V4_2_7).
 *
 * UI SHELL premium: no hay backend de notas todavía, así que muestra ejemplos
 * estáticos y un "+" marcado como próximamente (afordancia honesta, sin flujo falso
 * ni persistencia). Presentacional; sin lógica/datos reales.
 */
import { StickyNote, Plus } from 'lucide-react';
import { SurfaceCard } from './surface-card';

const EXAMPLE_NOTES = [
  'Revisar proveedor acero',
  'Validar AIU presupuesto activo',
  'Llamar a proveedor Homecenter',
];

export function NotesCard({ className }: { className?: string }) {
  return (
    <SurfaceCard variant="metric" className={className}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
          <StickyNote className="h-4 w-4 text-iconic-primary/70" aria-hidden="true" />
          Notas rápidas
        </p>
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-line text-content-muted/70"
          title="Gestión de notas — próximamente"
          aria-hidden="true"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      </div>
      <ul className="mt-3 space-y-2" role="list">
        {EXAMPLE_NOTES.map((note) => (
          <li key={note} className="flex items-start gap-2 text-sm text-content">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-iconic-primary/60" aria-hidden="true" />
            <span className="min-w-0">{note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2 text-[11px] text-content-muted">
        Ejemplos · gestión de notas próximamente
      </p>
    </SurfaceCard>
  );
}
