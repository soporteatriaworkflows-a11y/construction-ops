/** format.ts — helpers de presentación puros para el preview de Steel Ops. */
import type { CalloutTone } from '@/components/shared/inline-callout';
import type { BadgeProps } from '@/components/ui/badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export function formatDecimal(value: string | undefined, decimals = 2): string {
  if (!value) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCop(value: string | undefined): string {
  if (!value) return 'Sin precio';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `$ ${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

export function severityToTone(severity: 'critical' | 'warning' | 'info' | 'ok'): CalloutTone {
  if (severity === 'critical') return 'warning';
  if (severity === 'warning') return 'warning';
  if (severity === 'info') return 'info';
  return 'success';
}

const TAKEOFF_STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'secondary',
  in_review: 'warning',
  approved: 'success',
  locked: 'default',
};

const VERIFICATION_STATUS_VARIANT: Record<string, BadgeVariant> = {
  unreviewed: 'outline',
  auto_ok: 'success',
  needs_review: 'warning',
  confirmed: 'success',
  edited: 'secondary',
  rejected: 'destructive',
};

const OFFCUT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  suggested: 'warning',
  assigned: 'default',
  discarded: 'outline',
  final_waste: 'destructive',
};

const ORDER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'secondary',
  quoted: 'warning',
  approved: 'success',
  purchased: 'default',
  received: 'success',
};

const BOQ_LINK_STATUS_VARIANT: Record<string, BadgeVariant> = {
  no_vinculado: 'outline',
  sugerido: 'warning',
  vinculado: 'success',
};

const PRICE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  estimado: 'secondary',
  proveedor: 'warning',
  aprobado: 'success',
  vencido: 'destructive',
  sin_precio: 'outline',
};

export function statusVariant(
  kind: 'takeoff' | 'verification' | 'offcut' | 'order' | 'boq_link' | 'price',
  status: string,
): BadgeVariant {
  const table: Record<string, Record<string, BadgeVariant>> = {
    takeoff: TAKEOFF_STATUS_VARIANT,
    verification: VERIFICATION_STATUS_VARIANT,
    offcut: OFFCUT_STATUS_VARIANT,
    order: ORDER_STATUS_VARIANT,
    boq_link: BOQ_LINK_STATUS_VARIANT,
    price: PRICE_STATUS_VARIANT,
  };
  return table[kind]?.[status] ?? 'secondary';
}

export const TAKEOFF_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobado',
  locked: 'Bloqueado',
};

export const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  unreviewed: 'Sin revisar',
  auto_ok: 'Auto OK',
  needs_review: 'Necesita revisión',
  confirmed: 'Confirmado',
  edited: 'Editado',
  rejected: 'Rechazado',
};

export const OFFCUT_STATUS_LABEL: Record<string, string> = {
  available: 'Disponible',
  suggested: 'Sugerido',
  assigned: 'Asignado',
  discarded: 'Descartado',
  final_waste: 'Desperdicio final',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  quoted: 'Cotizado',
  approved: 'Aprobado',
  purchased: 'Comprado',
  received: 'Recibido',
};

export const BOQ_LINK_STATUS_LABEL: Record<string, string> = {
  no_vinculado: 'No vinculado',
  sugerido: 'Sugerido',
  vinculado: 'Vinculado',
};

export const PRICE_STATUS_LABEL: Record<string, string> = {
  estimado: 'Estimado',
  proveedor: 'Proveedor',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
  sin_precio: 'Sin precio',
};

/** Etiqueta corta de familia de acero para la UI. */
export const STEEL_FAMILY_LABEL: Record<string, string> = {
  rebar: 'Refuerzo',
  structural_steel: 'Estructura metálica',
  mesh: 'Malla',
  accessory: 'Accesorio',
  other: 'Otro',
};

/** ¿La vigencia ya pasó respecto a la fecha de referencia? (comparación ISO yyyy-mm-dd). */
export function isExpired(validUntil: string | undefined, referenceDate: string): boolean {
  if (!validUntil) return false;
  return validUntil < referenceDate;
}
