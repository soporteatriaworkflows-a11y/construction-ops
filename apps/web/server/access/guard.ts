/**
 * guard.ts — Guards server-side de acceso por módulo (V5.6.2).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_2_ROLE_ACCESS_MATRIX_HARDENING.md`.
 *
 * Resuelve el actor REAL server-side (`resolveAccessActor`, `profiles.role`) y
 * aplica `canAccessModule` (matriz pura de `module-access.ts`). Es defensa en
 * profundidad app-layer: NO reemplaza RLS ni la proyección por rol del
 * read-model (backstops reales de datos). NUNCA acepta rol/organización del
 * navegador.
 *
 *  - `requireModuleAccess`: para Server Components (páginas/layouts). Redirige
 *    a `/login` sin sesión y a `/dashboard` si el rol no puede abrir el módulo.
 *  - `checkModuleAccess`: para Server Actions. NO redirige; devuelve un
 *    resultado consumible para responder con el shape de error de la action.
 */
import { redirect } from 'next/navigation';
import { resolveAccessActor } from './actor';
import { canAccessModule, type AccessModule } from './module-access';
import type { AccessActor } from './types';

/**
 * Exige acceso al `module`. Uso en Server Components.
 *  - Sin sesión válida ⇒ redirect `/login`.
 *  - Rol sin acceso al módulo ⇒ redirect `/dashboard` (deny seguro; el usuario
 *    autenticado no queda en una pantalla rota).
 *  - Con acceso ⇒ devuelve el `AccessActor` (para reutilizar org/rol).
 */
export async function requireModuleAccess(module: AccessModule): Promise<AccessActor> {
  let actor: AccessActor;
  try {
    actor = await resolveAccessActor();
  } catch {
    redirect('/login'); // throws (NEXT_REDIRECT)
  }
  if (!canAccessModule(actor.profileRole, module)) {
    redirect('/dashboard'); // throws (NEXT_REDIRECT)
  }
  return actor;
}

/** Resultado del guard de action: `ok` + actor si está autorizado. */
export type ModuleAccessCheck =
  | { ok: true; actor: AccessActor }
  | { ok: false; actor?: undefined };

/**
 * Verifica acceso al `module` SIN redirigir (para Server Actions). Deny-by-
 * default: sin sesión válida o rol sin acceso ⇒ `{ ok: false }`. La action
 * traduce la denegación a su propio shape de error antes de tocar datos.
 */
export async function checkModuleAccess(module: AccessModule): Promise<ModuleAccessCheck> {
  let actor: AccessActor;
  try {
    actor = await resolveAccessActor();
  } catch {
    return { ok: false };
  }
  if (!canAccessModule(actor.profileRole, module)) {
    return { ok: false };
  }
  return { ok: true, actor };
}
