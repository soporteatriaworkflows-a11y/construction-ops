/**
 * apu-resource-badge.tsx — Badge operativo del estado de recursos de un APU.
 * Presentacional (sin estado). APU_LIBRARY_OPERATIONAL_UX_V1.
 */
import { Badge } from '@/components/ui/badge';
import type { ApuResourceStatus } from '@/lib/apu-library/types';

export function ApuResourceBadge({ status }: { status: ApuResourceStatus }) {
  if (status.total === 0) {
    return <span className="text-xs text-gray-400">Solo M.O.</span>;
  }
  if (status.unresolved > 0) {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-700">
        {status.unresolved} sin resolver
      </Badge>
    );
  }
  if (status.ambiguous > 0) {
    return (
      <Badge variant="secondary" className="bg-orange-100 text-orange-700">
        {status.ambiguous} ambiguas
      </Badge>
    );
  }
  if (status.suggested > 0) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
        {status.suggested} con sugerencia
      </Badge>
    );
  }
  if (status.pending > 0) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
        {status.pending} pendiente{status.pending !== 1 ? 's' : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-green-100 text-green-700">
      Completo
    </Badge>
  );
}
