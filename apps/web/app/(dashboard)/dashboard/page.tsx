/**
 * Dashboard principal — mock Oleada 1.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * NOTA: Los valores monetarios vienen de mocks ya calculados.
 * El frontend NO calcula totales financieros.
 */
import { FolderOpen, ClipboardList, BookOpen, Calculator } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { formatCOP } from '@/lib/utils/format';

// Resumen mock — valores ya calculados (simulando cost-domain Oleada 2).
// Totales de regresión del golden master (PROJECT_MASTER §3.4).
const MOCK_SUMMARY = {
  projects: 2,
  activeEstimates: 3,
  catalogResources: 8,
  apuTemplates: 3,
  directCostsCOP: '336084479.9369073500',
  indirectCostsCOP: '36162690.0412112300',
  totalCostCOP: '372247169.9781186000',
};

const STAT_CARDS = [
  {
    title: 'Proyectos',
    value: String(MOCK_SUMMARY.projects),
    icon: FolderOpen,
    description: 'Proyectos activos',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  {
    title: 'Presupuestos',
    value: String(MOCK_SUMMARY.activeEstimates),
    icon: ClipboardList,
    description: 'Versiones activas',
    color: 'text-green-700',
    bg: 'bg-green-50',
  },
  {
    title: 'Catálogo',
    value: String(MOCK_SUMMARY.catalogResources),
    icon: BookOpen,
    description: 'Recursos en catálogo',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  {
    title: 'APU',
    value: String(MOCK_SUMMARY.apuTemplates),
    icon: Calculator,
    description: 'Plantillas APU',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
] as const;

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Resumen financiero del proyecto piloto — ENTRE PATIOS"
      />

      {/* KPI cards */}
      <section aria-label="Indicadores principales">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_CARDS.map(({ title, value, icon: Icon, description, color, bg }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {title}
                </CardTitle>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}
                  aria-hidden="true"
                >
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Resumen financiero */}
      <section aria-label="Resumen financiero" className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Resumen financiero — ENTRE PATIOS (Primer Piso)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Costos directos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {formatCOP(MOCK_SUMMARY.directCostsCOP)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Costos indirectos (AIU)</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {formatCOP(MOCK_SUMMARY.indirectCostsCOP)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total presupuesto</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-blue-700 tabular-nums">
                {formatCOP(MOCK_SUMMARY.totalCostCOP)}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Aviso mock */}
      <div
        className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        role="status"
        aria-live="polite"
      >
        <strong>Modo mock — Oleada 1.</strong> Los valores mostrados son estáticos.
        En Oleada 2, cost-domain proveerá cálculos reales desde la base de datos.
      </div>
    </div>
  );
}
