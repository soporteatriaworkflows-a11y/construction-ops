/**
 * export-profile.ts — Perfiles de exportación (CLIENT_EXPORT_PROFILE_V1).
 *
 * Eje ORTOGONAL al `kind` existente. Cliente-safe, sin dependencias de servidor.
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §6.
 *
 * Regla dura: el perfil `client` NUNCA incluye fichas APU completas ni
 * trazabilidad técnica. Si se solicita un `kind` técnico (apu/package) con
 * perfil cliente, se degrada a `budget` (presupuesto comercial sin anexos APU).
 * El perfil `technical` (por defecto) honra el `kind` solicitado — comportamiento
 * retrocompatible con la API previa, sin tocar los generadores (golden master).
 */
import type { ExportKind } from './apu-export-types';

export type ExportProfile = 'client' | 'technical';

export function isExportProfile(v: string): v is ExportProfile {
  return v === 'client' || v === 'technical';
}

export interface ExportPlan {
  profile: ExportProfile;
  /** `kind` efectivo tras aplicar el perfil. */
  kind: ExportKind;
  /** ¿la salida incluye fichas APU completas? */
  includesApu: boolean;
}

/**
 * Resuelve el plan efectivo de exportación a partir del perfil y el `kind`
 * solicitado. Función pura — fuente de verdad de la privacidad del export.
 */
export function resolveExportPlan(
  profile: ExportProfile,
  requestedKind: ExportKind,
): ExportPlan {
  if (profile === 'client') {
    // Cliente: presupuesto comercial, jamás anexos APU técnicos.
    return { profile, kind: 'budget', includesApu: false };
  }
  // Técnico: honra el kind solicitado.
  return {
    profile,
    kind: requestedKind,
    includesApu: requestedKind === 'apu' || requestedKind === 'package',
  };
}

/** Sufijo de nombre de archivo según perfil (cliente vs técnico). */
export function profileFilenameSuffix(profile: ExportProfile): string {
  return profile === 'client' ? 'cliente' : 'tecnico';
}
