/**
 * KpiCard — tarjeta de indicador clave reutilizable.
 * Propiedad: agent-dashboard.
 *
 * Renderiza un valor, título, descripción y opcionalmente un ícono.
 * Incluye estado skeleton de carga.
 */

import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export interface KpiCardProps {
  title: string;
  value: string;
  description?: string;
  /** Si true, muestra skeleton en lugar del valor. */
  loading?: boolean;
  /** Color del valor (clase Tailwind, p.ej. 'text-blue-700'). */
  valueColor?: string;
  /** Ícono React node (p.ej. lucide-react). */
  icon?: React.ReactNode;
  /** Fondo del contenedor del ícono (clase Tailwind). */
  iconBg?: string;
}

export function KpiCard({
  title,
  value,
  description,
  loading = false,
  valueColor = 'text-gray-900',
  icon,
  iconBg = 'bg-gray-100',
}: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
        {icon && (
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-32 mb-1" />
            {description && <Skeleton className="h-3 w-24 mt-1" />}
          </>
        ) : (
          <>
            <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Versión compacta para valores financieros grandes.
 */
export function FinancialKpiCard({
  title,
  value,
  description,
  loading = false,
  valueColor = 'text-gray-900',
}: Omit<KpiCardProps, 'icon' | 'iconBg'>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-40" />
        ) : (
          <>
            <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
