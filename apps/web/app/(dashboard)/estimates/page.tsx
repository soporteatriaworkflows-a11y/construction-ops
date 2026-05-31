/**
 * Página de presupuestos (estimates) — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model (dev-read-model TEMP) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO calcula totales financieros.
 * Los valores llegan como DecimalString ya calculados desde el read-model.
 */
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EstimateVersionBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { formatCOP, formatDateTime, formatNumber, formatPct } from '@/lib/utils/format';
import { BudgetBoqGrid } from '@/components/budget/budget-boq-grid';
import { getReadModel } from '@/components/budget/dev-read-model';
import type { EstimateVersionStatus } from '@/lib/utils/types';

// ---------------------------------------------------------------------------
// Reglas AIU del fixture (estáticas — ya incluidas en el estimateSummary)
// Definidas aquí para la tabla de indirectos visible al cliente.
// ---------------------------------------------------------------------------
const AIU_RULES = [
  { code: 'A', name: 'Administración', pct: '0.035', baseType: 'direct_cost' },
  { code: 'I', name: 'Imprevistos', pct: '0.025', baseType: 'direct_cost' },
  { code: 'U', name: 'Utilidad', pct: '0.04', baseType: 'direct_cost' },
  { code: 'IVA', name: 'IVA sobre Utilidad', pct: '0.19', baseType: 'utility' },
];

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EstimatesPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const projectId = typeof params['projectId'] === 'string' ? params['projectId'] : undefined;

  const rm = getReadModel();

  // Cargar overview del proyecto para obtener el scope "Primer piso"
  let scopeId: string | null = null;
  let projectName = 'Proyecto';
  let scopeName = 'Alcance';

  if (projectId) {
    try {
      const overview = await rm.getProjectOverview(projectId);
      if (overview) {
        projectName = overview.name;
        // Buscar el primer alcance de tipo "floor" (Primer piso)
        const floorScope = overview.scopes.find(
          (s) => s.scopeType === 'floor'
        );
        const anyScope = overview.scopes[0];
        const chosen = floorScope ?? anyScope;
        if (chosen) {
          scopeId = chosen.id;
          scopeName = chosen.name;
        }
      }
    } catch {
      // error handled below
    }
  }

  // Si no hay projectId, usar el primer proyecto del read-model
  if (!scopeId) {
    try {
      const projects = await rm.listProjects();
      if (projects.length > 0) {
        const first = projects[0]!;
        projectName = first.name;
        const overview = await rm.getProjectOverview(first.id);
        if (overview) {
          const floorScope = overview.scopes.find((s) => s.scopeType === 'floor');
          const anyScope = overview.scopes[0];
          const chosen = floorScope ?? anyScope;
          if (chosen) {
            scopeId = chosen.id;
            scopeName = chosen.name;
          }
        }
      }
    } catch {
      // continue with empty state
    }
  }

  // Cargar estimados para el scope encontrado
  let estimates: Awaited<ReturnType<typeof rm.listEstimates>> = [];
  let loadError: string | null = null;

  if (scopeId) {
    try {
      estimates = await rm.listEstimates(scopeId);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Error al cargar presupuesto';
    }
  }

  // Cargar detalle de la primera versión
  const latestVersion = estimates[0] ?? null;
  let detail: Awaited<ReturnType<typeof rm.getEstimateDetail>> = null;

  if (latestVersion) {
    try {
      detail = await rm.getEstimateDetail(latestVersion.id);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Error al cargar detalle del BOQ';
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Presupuestos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error: {loadError}
        </div>
      </div>
    );
  }

  if (!latestVersion) {
    return (
      <div>
        <PageHeader title="Presupuestos" />
        <EmptyState
          icon={ClipboardList}
          title="Sin versiones de presupuesto"
          description="No hay versiones de presupuesto disponibles para este proyecto."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Presupuesto"
        description={`${projectName} / ${scopeName}`}
      />

      {/* Versión activa */}
      <section aria-label="Versión del presupuesto" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Versión activa
        </h2>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <span className="text-sm font-semibold text-gray-900">
            V{String(latestVersion.versionNumber).padStart(2, '0')}
          </span>
          <EstimateVersionBadge status={latestVersion.status as EstimateVersionStatus} />
          {latestVersion.approvedAt && (
            <span className="text-xs text-gray-400">
              Aprobado {formatDateTime(latestVersion.approvedAt)}
            </span>
          )}
          {latestVersion.notes && (
            <span className="text-xs text-gray-500 italic">{latestVersion.notes}</span>
          )}
        </div>
      </section>

      {/* BOQ Grid con datos reales */}
      <section aria-label="BOQ — Detalle de actividades" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Actividades — V{String(latestVersion.versionNumber).padStart(2, '0')}
          </h2>
          <span className="text-xs text-gray-400">
            {detail?.items.length ?? 0} ítems · {detail?.chapters.length ?? 0} capítulos
          </span>
        </div>

        {!detail || detail.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin actividades"
            description="No hay ítems BOQ en esta versión."
          />
        ) : (
          <BudgetBoqGrid chapters={detail.chapters} items={detail.items} height={520} />
        )}
      </section>

      {/* Resumen financiero + AIU */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* AIU */}
        <section aria-label="Costos indirectos AIU">
          <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Costos Indirectos (AIU)
          </h2>
          <Card>
            <CardContent className="pt-4">
              <table
                className="w-full text-sm"
                aria-label="Tabla de costos indirectos"
              >
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left font-medium text-gray-500">Concepto</th>
                    <th className="pb-2 text-right font-medium text-gray-500">%</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr>
                    <td className="py-1.5 text-gray-600">
                      <span className="mr-1.5 font-mono text-xs text-gray-400">[A]</span>
                      Administración
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                      {formatPct(AIU_RULES[0]!.pct)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {formatCOP(latestVersion.administration)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-gray-600">
                      <span className="mr-1.5 font-mono text-xs text-gray-400">[I]</span>
                      Imprevistos
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                      {formatPct(AIU_RULES[1]!.pct)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {formatCOP(latestVersion.contingency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-gray-600">
                      <span className="mr-1.5 font-mono text-xs text-gray-400">[U]</span>
                      Utilidad
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                      {formatPct(AIU_RULES[2]!.pct)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {formatCOP(latestVersion.utility)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-gray-600">
                      <span className="mr-1.5 font-mono text-xs text-gray-400">[IVA]</span>
                      IVA sobre Utilidad
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                      {formatPct(AIU_RULES[3]!.pct)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {formatCOP(latestVersion.taxOnUtility)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {/* Totales */}
        <section aria-label="Resumen de totales">
          <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Totales
          </h2>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Costos directos</span>
                <span className="tabular-nums font-medium">
                  {formatCOP(latestVersion.directCost)}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between text-base font-semibold">
                <span className="text-gray-900">Total presupuesto</span>
                <span className="tabular-nums text-blue-700">
                  {formatCOP(latestVersion.grandTotal)}
                </span>
              </div>
              {latestVersion.totalArea && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Área construida</span>
                  <span className="tabular-nums">
                    {formatNumber(latestVersion.totalArea, 2)} m²
                  </span>
                </div>
              )}
              {latestVersion.costPerSquareMeter && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Valor por m²</span>
                  <span className="tabular-nums">
                    {formatCOP(latestVersion.costPerSquareMeter)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
