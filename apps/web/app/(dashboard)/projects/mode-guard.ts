/**
 * mode-guard.ts — Determinación del modo de creación de proyectos (4B.1).
 *
 * Propiedad: agent-frontend-boq.
 *
 * Función pura, sin 'use server', importable tanto desde server actions como
 * desde páginas (Server Components).
 *
 * `isCreationModeEnabled` retorna `true` solo cuando:
 *   - APP_AUTH_MODE = 'supabase'
 *   - READ_MODEL_SOURCE = 'db'
 *
 * Contrato §7.2: en demo/fixture el botón "+ Nuevo proyecto" se muestra
 * deshabilitado y la action retorna error claro si se invoca.
 */
import { resolveAuthMode, parseReadModelSource } from '@/lib/supabase/env';

/**
 * Determina si el entorno actual permite la creación de proyectos.
 * No lanza: devuelve `false` ante cualquier error de configuración.
 */
export function isCreationModeEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  try {
    const authMode = resolveAuthMode(env as Record<string, string | undefined>);
    const readModelSource = parseReadModelSource(env.READ_MODEL_SOURCE);
    return authMode === 'supabase' && readModelSource === 'db';
  } catch {
    return false;
  }
}
