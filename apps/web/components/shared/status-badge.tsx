import { Badge } from '@/components/ui/badge';
import {
  ESTIMATE_VERSION_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
} from '@/lib/utils/format';
import type {
  EstimateVersionStatus,
  ProjectStatus,
} from '@/lib/utils/types';

// ---------------------------------------------------------------------------
// EstimateVersionStatus badge
// ---------------------------------------------------------------------------

const ESTIMATE_VERSION_VARIANTS: Record<
  EstimateVersionStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  draft: 'secondary',
  review: 'warning',
  approved: 'success',
  issued: 'default',
  archived: 'outline',
};

interface EstimateVersionBadgeProps {
  status: EstimateVersionStatus;
}

export function EstimateVersionBadge({ status }: EstimateVersionBadgeProps) {
  return (
    <Badge variant={ESTIMATE_VERSION_VARIANTS[status]}>
      {ESTIMATE_VERSION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// ProjectStatus badge
// ---------------------------------------------------------------------------

const PROJECT_STATUS_VARIANTS: Record<
  ProjectStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  active: 'success',
  archived: 'outline',
  closed: 'secondary',
};

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
}

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  return (
    <Badge variant={PROJECT_STATUS_VARIANTS[status]}>
      {PROJECT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
