/**
 * mode-label.ts — Etiqueta de modo del read-model para la UI (footer/sidebar).
 *
 * Propiedad: orquestador (estabilización 4B.1).
 *
 * Función PURA, evaluada server-side en request-time. NO expone secretos ni
 * detalles internos: solo distingue datos reales (`db`) de demostración
 * (`fixture`). Si la configuración es inválida, NO lanza: degrada a una etiqueta
 * neutra para no romper el layout (la validación dura vive en `env.ts`).
 */
import { parseReadModelSource } from '@/lib/supabase/env';

export interface ReadModelModeLabel {
  /** Texto breve para mostrar en el footer del sidebar. */
  label: string;
  /** `true` solo cuando la fuente activa es el fixture de demostración. */
  isFixture: boolean;
}

/**
 * Deriva la etiqueta de modo a partir de `READ_MODEL_SOURCE`.
 *  - `db`      → "Datos reales" (no es demo).
 *  - `fixture` → "Modo demostración" (datos sanitizados).
 *
 * @param env - Entorno (por defecto `process.env`). Inyectable para tests.
 */
export function readModelModeLabel(
  env: Record<string, string | undefined> = process.env,
): ReadModelModeLabel {
  let isFixture = true;
  try {
    isFixture = parseReadModelSource(env.READ_MODEL_SOURCE) === 'fixture';
  } catch {
    // Config inválida: degradar a neutra sin romper el layout.
    return { label: 'Datos', isFixture: false };
  }
  return isFixture
    ? { label: 'Modo demostración', isFixture: true }
    : { label: 'Datos reales', isFixture: false };
}
