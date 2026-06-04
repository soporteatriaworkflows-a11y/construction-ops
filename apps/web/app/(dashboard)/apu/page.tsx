/**
 * Página de catálogo APU — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canónico (@/server/read-model) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO calcula totales financieros.
 * unitCost llega pre-calculado como DecimalString desde el read-model.
 */
import { Calculator } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCOP } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';

// Render request-time: viewer real por modo (db=autenticado, fixture=demo).
// En modo `db` consulta la organización real; nunca hornea datos de demostración.
export const dynamic = 'force-dynamic';

export default async function ApuPage() {
  const rm = getReadModel();
  let apus: Awaited<ReturnType<typeof rm.listApus>> = [];
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    apus = await rm.listApus(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar APU';
    apus = [];
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Análisis de Precios Unitarios (APU)" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar APU: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Análisis de Precios Unitarios (APU)"
        description="Catálogo de plantillas APU reutilizables por proyecto"
      />

      {apus.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Sin plantillas APU"
          description="No hay plantillas APU en el catálogo."
        />
      ) : (
        <div className="space-y-4">
          {apus.map((apu) => (
            <Card key={apu.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                        {apu.code}
                      </span>
                      <Badge variant="secondary">
                        {apu.componentCount} componente{apu.componentCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{apu.name}</CardTitle>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Unidad base</p>
                    <p className="font-semibold text-gray-900">{apu.unit}</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
                  <span className="text-sm text-gray-600">Costo unitario total</span>
                  <span className="text-lg font-bold text-blue-700 tabular-nums">
                    {formatCOP(apu.unitCost)}
                    <span className="ml-1 text-xs font-normal text-gray-400">
                      / {apu.unit}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
