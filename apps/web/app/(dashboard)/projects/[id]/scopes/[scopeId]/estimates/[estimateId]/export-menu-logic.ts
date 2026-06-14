/**
 * export-menu-logic.ts — Lógica PURA del menú «Exportar» (APU_EXPORTS_V1).
 *
 * Sin React ni efectos: dirige el estado del menú (habilitación de opciones APU,
 * mensaje sin-APU, advertencias, conteos) de forma testeable. El componente
 * cliente la consume; la UI no duplica reglas.
 */

export interface ExportCounts {
  boqItems: number;
  linkedApu: number;
  unlinkedItems: number;
  archivedIncluded: number;
  archivedExcluded: number;
  incomplete: number;
}

/** `true` si hay al menos un APU vinculado (habilita opciones APU/paquete). */
export function apuOptionsEnabled(counts: ExportCounts | null | undefined): boolean {
  return (counts?.linkedApu ?? 0) > 0;
}

/** `true` si debe mostrarse el mensaje «sin APU vinculados». */
export function showNoApuMessage(counts: ExportCounts | null | undefined): boolean {
  return !!counts && !apuOptionsEnabled(counts);
}

/** Líneas de advertencia (incompletos / archivados excluidos). Vacío ⇒ sin avisos. */
export function exportWarnings(counts: ExportCounts | null | undefined): string[] {
  if (!counts || !apuOptionsEnabled(counts)) return [];
  const out: string[] = [];
  if (counts.incomplete > 0) {
    out.push(
      `El anexo incluye ${counts.incomplete} APU incompleto(s) (costo en cero o sin precio aprobado).`,
    );
  }
  if (counts.archivedExcluded > 0) {
    out.push(
      `Se excluyeron ${counts.archivedExcluded} APU archivado(s) no permitidos en una versión editable.`,
    );
  }
  return out;
}

/** `true` si deben mostrarse los conteos archivados-incluidos (snapshot histórico). */
export function showArchivedIncluded(counts: ExportCounts | null | undefined): boolean {
  return (counts?.archivedIncluded ?? 0) > 0;
}

/** Construye el querystring de descarga (mismo contrato que la ruta GET). */
export function buildExportQuery(input: {
  format: 'xlsx' | 'pdf';
  kind: 'budget' | 'apu' | 'package';
  estimateId: string;
  projectId: string;
  scopeId: string;
  /** Perfil opcional (CLIENT_EXPORT_PROFILE_V1). Omitido ⇒ técnico (retrocompat). */
  profile?: 'client' | 'technical';
}): string {
  const { format, kind, estimateId, projectId, scopeId, profile } = input;
  const params = new URLSearchParams({ format, estimateId, projectId, scopeId, kind });
  if (profile) params.set('profile', profile);
  return params.toString();
}

/** Opción del menú «Exportar» con etiquetas claras cliente vs técnico. */
export interface ExportMenuOption {
  id: string;
  label: string;
  format: 'xlsx' | 'pdf';
  kind: 'budget' | 'apu' | 'package';
  profile: 'client' | 'technical';
  /** Requiere ≥1 APU vinculado para habilitarse. */
  requiresApu: boolean;
}

/** Catálogo de opciones del menú con nombres no ambiguos (§6.2). */
export const EXPORT_MENU_OPTIONS: ExportMenuOption[] = [
  { id: 'pdf-client', label: 'PDF cliente', format: 'pdf', kind: 'budget', profile: 'client', requiresApu: false },
  { id: 'pdf-technical', label: 'PDF técnico completo', format: 'pdf', kind: 'package', profile: 'technical', requiresApu: true },
  { id: 'xlsx-budget', label: 'Excel presupuesto', format: 'xlsx', kind: 'budget', profile: 'client', requiresApu: false },
  { id: 'xlsx-technical', label: 'Excel técnico con APU', format: 'xlsx', kind: 'package', profile: 'technical', requiresApu: true },
];

/** Opciones habilitadas según disponibilidad de APU vinculados. */
export function availableExportOptions(counts: ExportCounts | null | undefined): ExportMenuOption[] {
  const apuOk = apuOptionsEnabled(counts);
  return EXPORT_MENU_OPTIONS.filter((o) => !o.requiresApu || apuOk);
}
