/**
 * Página de presupuestos (estimates) — mock Oleada 1.
 * Server Component (el grid BOQ está en un Client Component hijo).
 * Propiedad: agent-frontend-boq.
 */
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EstimateVersionBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCOP, formatDate, formatPct } from '@/lib/utils/format';
import { BoqGrid } from '@/components/shared/boq-grid';
import {
  MOCK_ESTIMATE,
  MOCK_ESTIMATE_VERSIONS,
  MOCK_CHAPTERS,
  MOCK_BOQ_ITEMS,
  MOCK_INDIRECT_COST_RULES,
  MOCK_SCOPES,
  MOCK_PROJECTS,
} from '@/lib/utils/mocks';

// Datos mock estáticos disponibles en tiempo de build (Oleada 1).
// Los totales ya vienen calculados; NO se operan aquí.
const MOCK_TOTALS = {
  directCosts: '136365755.5000000000',
  totalCost: '152729645.8925000000',
};

export default function EstimatesPage() {
  const estimate = MOCK_ESTIMATE;
  const versions = MOCK_ESTIMATE_VERSIONS;
  const latestVersion = versions[versions.length - 1];

  // Datos de contexto
  const scope = MOCK_SCOPES.find((s) => s.id === estimate.projectScopeId);
  const project = scope
    ? MOCK_PROJECTS.find((p) => p.id === scope.projectId)
    : undefined;

  // Items del BOQ para la versión activa
  const versionChapters = MOCK_CHAPTERS.filter(
    (c) => c.estimateVersionId === latestVersion?.id
  );
  const versionItems = MOCK_BOQ_ITEMS.filter(
    (i) => i.estimateVersionId === latestVersion?.id
  );

  // Reglas AIU visibles al cliente
  const visibleRules = MOCK_INDIRECT_COST_RULES.filter(
    (r) => r.estimateVersionId === latestVersion?.id && r.visibleToClient
  );

  if (!latestVersion) {
    return (
      <div>
        <PageHeader title="Presupuestos" />
        <EmptyState
          icon={ClipboardList}
          title="Sin versiones"
          description="No hay versiones de presupuesto disponibles."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Presupuesto"
        description={`${project?.name ?? '—'} / ${scope?.name ?? '—'}`}
        breadcrumb={
          <span className="text-xs text-gray-400">
            {project?.code} › {scope?.code} › {estimate.code}
          </span>
        }
      />

      {/* Versiones */}
      <section aria-label="Versiones del presupuesto" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Versiones
        </h2>
        <div className="flex flex-wrap gap-3">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
              role="group"
              aria-label={`Versión ${version.versionNumber}`}
            >
              <span className="text-sm font-semibold text-gray-900">
                V{String(version.versionNumber).padStart(2, '0')}
              </span>
              <EstimateVersionBadge status={version.status} />
              {version.approvedAt && (
                <span className="text-xs text-gray-400">
                  Aprobado {formatDate(version.approvedAt)}
                </span>
              )}
              {version.notes && (
                <span className="text-xs text-gray-500 italic">
                  {version.notes}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* BOQ Grid */}
      <section aria-label="BOQ — Detalle de actividades" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Actividades — V{String(latestVersion.versionNumber).padStart(2, '0')}
          </h2>
          <EstimateVersionBadge status={latestVersion.status} />
        </div>

        {versionItems.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin actividades"
            description="No hay ítems BOQ en esta versión."
          />
        ) : (
          <BoqGrid chapters={versionChapters} items={versionItems} height={500} />
        )}
      </section>

      {/* AIU visible al cliente */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-label="Costos indirectos AIU">
          <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Costos Indirectos (AIU)
          </h2>
          <Card>
            <CardContent className="pt-4">
              {visibleRules.length === 0 ? (
                <p className="text-sm text-gray-400">Sin reglas definidas.</p>
              ) : (
                <table
                  className="w-full text-sm"
                  aria-label="Tabla de costos indirectos"
                >
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-left font-medium text-gray-500">
                        Concepto
                      </th>
                      <th className="pb-2 text-right font-medium text-gray-500">
                        Porcentaje
                      </th>
                      <th className="pb-2 text-right font-medium text-gray-500">
                        Base
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRules.map((rule) => (
                      <tr key={rule.id}>
                        <td className="py-1.5 text-gray-700">
                          <span className="mr-2 font-mono text-xs text-gray-400">
                            [{rule.code}]
                          </span>
                          {rule.name}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700">
                          {formatPct(rule.percentage)}
                        </td>
                        <td className="py-1.5 text-right text-xs text-gray-400">
                          {rule.baseType === 'direct_cost'
                            ? 'Costos directos'
                            : rule.baseType === 'utility'
                            ? 'Utilidad'
                            : 'Personalizado'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Resumen de totales */}
        <section aria-label="Resumen de totales">
          <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Totales
          </h2>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Costos directos</span>
                <span className="tabular-nums font-medium">
                  {formatCOP(MOCK_TOTALS.directCosts)}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between text-base font-semibold">
                <span className="text-gray-900">Total presupuesto</span>
                <span className="tabular-nums text-blue-700">
                  {formatCOP(MOCK_TOTALS.totalCost)}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Aviso mock */}
      <div
        className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700"
        role="status"
      >
        Modo mock — Oleada 1. Totales estáticos. Oleada 2 (cost-domain) conectará
        los cálculos reales.
      </div>
    </div>
  );
}
