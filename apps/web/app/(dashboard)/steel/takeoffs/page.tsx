import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { SurfaceCard } from '@/components/shared/surface-card';
import { MOCK_STEEL_TAKEOFFS } from '@/lib/steel/mock-data';
import { SteelStatusBadge } from '../_components/steel-status-badge';
import { ManualTakeoffsSection } from './_components/manual-takeoffs-section';

export default function SteelTakeoffsPage() {
  const takeoffs = MOCK_STEEL_TAKEOFFS;

  return (
    <div>
      <PageHeader
        title="Takeoffs de acero"
        description="Estudios de despiece por proyecto/torre/piso/frente. Crea takeoffs manuales (locales) o explora los de ejemplo."
      />

      <ManualTakeoffsSection />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-iconic-graphite/60">
        Takeoffs de ejemplo (mock)
      </h2>
      {takeoffs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aún no hay estudios de acero"
          description="Cuando se cree un takeoff para un proyecto, aparecerá aquí."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {takeoffs.map((takeoff) => (
            <SurfaceCard key={takeoff.id} variant="action" className="p-0">
              <Link href={`/steel/takeoffs/${takeoff.id}`} className="block p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-iconic-ink">{takeoff.name}</h3>
                  <SteelStatusBadge kind="takeoff" status={takeoff.status} />
                </div>
                <p className="text-xs text-iconic-graphite/60">
                  {takeoff.projectName} · {takeoff.scopeLabel}
                </p>
                <p className="mt-2 text-xs text-iconic-graphite/50">
                  {takeoff.lineCount} líneas · creado {takeoff.createdAt}
                </p>
              </Link>
            </SurfaceCard>
          ))}
        </div>
      )}
    </div>
  );
}
