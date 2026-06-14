/**
 * SavingsSection — sección de ahorro y cobertura de precios.
 * Propiedad: agent-dashboard.
 *
 * SOLO para roles `management` o `internal`.
 * Si el componente es renderizado, los datos YA están filtrados por rol (backend-first).
 * Maneja el caso donde los campos opcionales son undefined (sin precios aprobados aún).
 */

import type { DashboardSummary } from '@/lib/contracts/read-model';
import { FinancialKpiCard } from './kpi-card';
import { formatCOP, formatPct } from '@/lib/utils/format';
import { TrendingDown, ShoppingCart, BarChart3 } from 'lucide-react';

interface SavingsSectionProps {
  /** Solo campos 🔒 del DashboardSummary; undefined si no están disponibles. */
  projectedSaving: DashboardSummary['projectedSaving'];
  realizedSaving: DashboardSummary['realizedSaving'];
  pricingCoverage: DashboardSummary['pricingCoverage'];
}

export function SavingsSection({
  projectedSaving,
  realizedSaving,
  pricingCoverage,
}: SavingsSectionProps) {
  const hasAnyData =
    projectedSaving !== undefined ||
    realizedSaving !== undefined ||
    pricingCoverage !== undefined;

  return (
    <section aria-label="Ahorro e indicadores internos" className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Ahorro e indicadores internos
        </h2>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Solo gerencia
        </span>
      </div>

      {!hasAnyData ? (
        <div
          className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600"
          role="status"
        >
          Estos indicadores se calculan a partir de precios aprobados, observaciones
          pendientes y cobertura del catálogo.{' '}
          <a
            href="/catalog/prices/review"
            className="font-medium text-iconic-primary underline-offset-2 hover:underline"
          >
            Revisar o aprobar precios
          </a>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FinancialKpiCard
            title={
              <span className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                Ahorro proyectado
              </span> as unknown as string
            }
            value={projectedSaving ? formatCOP(projectedSaving) : '—'}
            description="vs precio de referencia presupuestado"
            valueColor="text-green-700"
          />
          <FinancialKpiCard
            title={
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                Ahorro realizado
              </span> as unknown as string
            }
            value={realizedSaving ? formatCOP(realizedSaving) : '—'}
            description="vs precio real de compra"
            valueColor="text-blue-700"
          />
          <FinancialKpiCard
            title={
              <span className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
                Cobertura de precios
              </span> as unknown as string
            }
            value={pricingCoverage ? formatPct(pricingCoverage) : '—'}
            description="ítems con precio aprobado"
            valueColor="text-purple-700"
          />
        </div>
      )}
    </section>
  );
}
