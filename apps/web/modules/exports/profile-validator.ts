/**
 * profile-validator.ts — Validación de combinación perfil×formato.
 *
 * Propiedad: agent-exports.
 *
 * REGLAS:
 *  - Validar ANTES de consultar el read-model.
 *  - Si la combinación no es válida, lanzar `ExportProfileFormatMismatchError`.
 *  - No exponer detalles técnicos internos en el mensaje de error.
 */

import type { ExportFormat, ExportProfile } from './types';
import {
  ExportProfileFormatMismatchError,
  FORMAT_PROFILE_COMPAT,
} from './types';

/**
 * Valida que la combinación perfil×formato sea permitida.
 * Lanza `ExportProfileFormatMismatchError` si no lo es.
 */
export function validateProfileFormat(
  profile: ExportProfile,
  format: ExportFormat,
): void {
  const allowed = FORMAT_PROFILE_COMPAT[format];
  if (!allowed.includes(profile)) {
    throw new ExportProfileFormatMismatchError(profile, format);
  }
}

/**
 * Devuelve true si la combinación es válida (sin lanzar).
 */
export function isProfileFormatCompatible(
  profile: ExportProfile,
  format: ExportFormat,
): boolean {
  return FORMAT_PROFILE_COMPAT[format].includes(profile);
}
