/**
 * Utilidades de formato para la UI — es-CO.
 * NO realiza operaciones financieras. Solo formatea strings para visualización.
 * Propiedad: agent-frontend-boq.
 */

/** Formatea un DecimalString como moneda COP sin decimales. */
export function formatCOP(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/** Formatea un DecimalString como número con separadores es-CO. */
export function formatNumber(value: string, decimals = 2): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/** Formatea un DecimalString (fracción 0–1) como porcentaje. */
export function formatPct(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Formatea una fecha ISO (YYYY-MM-DD) al formato dd/MM/yyyy. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

/** Formatea un IsoDateTime al formato dd/MM/yyyy. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Etiquetas de enums en español para la UI. */
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  material: 'Material',
  labor: 'Mano de obra',
  equipment: 'Equipo',
  tool: 'Herramienta',
  subcontract: 'Subcontrato',
  other: 'Otro',
};

export const ESTIMATE_VERSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  review: 'En revisión',
  approved: 'Aprobado',
  issued: 'Emitido',
  archived: 'Archivado',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  archived: 'Archivado',
  closed: 'Cerrado',
};

export const SCOPE_TYPE_LABELS: Record<string, string> = {
  floor: 'Piso',
  tower: 'Torre',
  stage: 'Etapa',
  package: 'Paquete',
  unit: 'Unidad',
  modification: 'Modificación',
  other: 'Otro',
};

export const CALCULATION_MODE_LABELS: Record<string, string> = {
  direct: 'Directo',
  length: 'Longitud',
  area: 'Área',
  volume: 'Volumen',
  custom: 'Personalizado',
};
