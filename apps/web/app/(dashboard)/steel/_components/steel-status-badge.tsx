import { Badge } from '@/components/ui/badge';
import {
  BOQ_LINK_STATUS_LABEL,
  OFFCUT_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PRICE_STATUS_LABEL,
  TAKEOFF_STATUS_LABEL,
  VERIFICATION_STATUS_LABEL,
  statusVariant,
} from '@/lib/steel/format';

const LABELS: Record<string, Record<string, string>> = {
  takeoff: TAKEOFF_STATUS_LABEL,
  verification: VERIFICATION_STATUS_LABEL,
  offcut: OFFCUT_STATUS_LABEL,
  order: ORDER_STATUS_LABEL,
  boq_link: BOQ_LINK_STATUS_LABEL,
  price: PRICE_STATUS_LABEL,
};

export function SteelStatusBadge({
  kind,
  status,
}: {
  kind: 'takeoff' | 'verification' | 'offcut' | 'order' | 'boq_link' | 'price';
  status: string;
}) {
  return <Badge variant={statusVariant(kind, status)}>{LABELS[kind]?.[status] ?? status}</Badge>;
}
