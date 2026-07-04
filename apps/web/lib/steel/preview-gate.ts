/**
 * preview-gate.ts — Gate aislado y temporal de la fase boceto UIX de Steel Ops.
 *
 * NO es el flag final del blueprint (`STEEL_OPS_ENABLED` + `ACCESS_MODULES.steel`,
 * ver docs/design-references/STEEL_OPS_V1_BLUEPRINT.md §17). Este archivo existe
 * solo mientras el módulo no está integrado a la matriz real de acceso — se retira
 * por completo cuando esa integración se apruebe y ejecute (ver
 * docs/STEEL_OPS_UIX_V1_CONTRACT.md §9).
 *
 * Deliberadamente NO importa nada de `module-access.ts` (steel no es un
 * `AccessModule` todavía) y NO edita ningún archivo de `server/access/`. Sí
 * reutiliza (solo lectura) `resolveAccessActor` para conocer el `profiles.role`
 * real server-side, evitando duplicar lógica de sesión/Supabase.
 */
import { resolveAccessActor } from '@/server/access/actor';
import type { ProfileRole } from '@/server/auth/types';

/** Roles que pueden previsualizar Steel Ops en esta fase (espejo de D1). */
export const STEEL_UIX_PREVIEW_ROLES: readonly ProfileRole[] = [
  'admin',
  'gerencia',
  'presupuestos',
];

/**
 * Decisión pura: ¿el flag de entorno está activo Y el rol está en la lista de
 * preview? Separada de la resolución de actor (I/O) para poder testear la
 * matriz rol×env sin sesión/Supabase.
 */
export function evaluateSteelUixPreviewAccess(
  envValue: string | undefined,
  role: string | null | undefined,
): boolean {
  if (envValue !== 'true') return false;
  return !!role && (STEEL_UIX_PREVIEW_ROLES as readonly string[]).includes(role);
}

/**
 * Resuelve el actor real server-side (sin lanzar) y evalúa el gate completo.
 * Uso previsto en cada `page.tsx` de `steel/*`: si devuelve `false`, la página
 * debe llamar `notFound()` — mismo comportamiento que si la ruta no existiera.
 */
export async function isSteelUixPreviewEnabled(
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const envValue = env.STEEL_OPS_UIX_PREVIEW;
  if (envValue !== 'true') return false;

  try {
    const actor = await resolveAccessActor();
    return evaluateSteelUixPreviewAccess(envValue, actor.profileRole);
  } catch {
    // Sin sesión/membresía válida: deny-by-default, igual que el resto del app.
    return false;
  }
}
