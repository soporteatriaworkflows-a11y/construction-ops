/**
 * module-access.ts — FUENTE ÚNICA PURA del gating de acceso por módulo (V5.6.2).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_2_ROLE_ACCESS_MATRIX_HARDENING.md`.
 *
 * Endurecimiento app-layer: cierra la SUPERFICIE (rutas/sidebar/actions) por
 * `profiles.role` (NO por el `ViewerRole` agregado, que no distingue admin de
 * otros internos). Es defensa en profundidad; el backstop real de datos sigue
 * siendo RLS + la proyección por rol del read-model (que ya omite campos 🔒
 * para `client`). Este módulo NO toca RLS, DB ni el read-model.
 *
 * Reglas:
 *  - Funciones PURAS (sin I/O, sin React). El resolver server-side vive en
 *    `guard.ts` (I/O) y consume estas funciones.
 *  - **Deny-by-default**: rol inválido/ausente ⇒ denegado; módulo desconocido
 *    ⇒ denegado.
 *  - Espejo de la matriz mínima obligatoria de V5.6.2 para los 6 roles reales.
 *    `cliente`/`contratista` NO existen todavía (futuro: migración/RLS/portal).
 */
import type { ProfileRole } from '@/server/auth/types';
import { isProfileRole } from './permissions';

/** Módulos de la app actuales que se gatean por rol (V5.6.2). */
export const ACCESS_MODULES = [
  'dashboard',
  'projects',
  'estimates',
  'apu',
  'quantities',
  'planning',
  'catalog',
  'price-intelligence',
  'monitoring',
  'operational-review',
  'quick-notes',
  'settings',
  'settings-access',
  'exports',
] as const;

export type AccessModule = (typeof ACCESS_MODULES)[number];

/** ¿`value` es un `AccessModule` conocido? */
export function isAccessModule(value: string | null | undefined): value is AccessModule {
  return !!value && (ACCESS_MODULES as readonly string[]).includes(value);
}

/**
 * Matriz de acceso: para cada módulo, los `ProfileRole` que pueden ABRIR/VER el
 * módulo. Cualquier rol NO listado queda denegado (deny-by-default).
 *
 * Notas de la matriz mínima obligatoria (V5.6.2):
 *  - `consulta` (→ ViewerRole `client`): solo lectura client-safe. NO catalog,
 *    price-intelligence, monitoring, operational-review, quick-notes,
 *    settings-access.
 *  - `obra` (→ `site`): sin módulos de pricing ni settings-access; tampoco
 *    catalog/apu (no listados en su set permitido).
 *  - `compras` (→ `internal`): catalog + price-intelligence + monitoring; NO
 *    administra usuarios; NO operational-review de decisión.
 *  - `presupuestos` (→ `internal`): presupuestación + catalog; NO
 *    price-intelligence/monitoring (decisión de compras) ni operational-review
 *    de decisión ni settings-access.  ⟵ ver "Decisión a confirmar" en el doc.
 *  - `gerencia` (→ `management`) y `admin` (→ `internal`): todo (accesos con el
 *    anti-escalamiento ya existente: gerencia no asigna/edita admin).
 */
const MODULE_ACCESS: Record<AccessModule, readonly ProfileRole[]> = {
  dashboard: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  projects: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  estimates: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  apu: ['admin', 'gerencia', 'presupuestos', 'consulta'],
  quantities: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  planning: ['admin', 'gerencia', 'presupuestos', 'obra', 'consulta'],
  catalog: ['admin', 'gerencia', 'presupuestos', 'compras'],
  'price-intelligence': ['admin', 'gerencia', 'compras'],
  monitoring: ['admin', 'gerencia', 'compras'],
  'operational-review': ['admin', 'gerencia'],
  // Quick Notes: internas. Espejo del guard existente (client/consulta denegado).
  'quick-notes': ['admin', 'gerencia', 'presupuestos', 'compras', 'obra'],
  // Perfil propio: todos los roles autenticados.
  settings: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
  // Gestión de accesos: espejo de `canManageAccess` (admin/gerencia).
  'settings-access': ['admin', 'gerencia'],
  // Exports: todos pueden pedir; la ANTI-ESCALADA de perfil (client-only para
  // roles bajos) la impone el pipeline existente (`isSameOrLessPrivileged`).
  exports: ['admin', 'gerencia', 'presupuestos', 'compras', 'obra', 'consulta'],
};

/**
 * ¿`role` puede acceder a `module`? Deny-by-default: rol inválido/ausente o
 * módulo desconocido ⇒ `false`.
 */
export function canAccessModule(
  role: string | null | undefined,
  module: AccessModule,
): boolean {
  if (!isProfileRole(role)) return false;
  const allowed = MODULE_ACCESS[module];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Todos los módulos que `role` puede abrir/ver (deny-by-default). */
export function visibleModulesFor(role: string | null | undefined): AccessModule[] {
  if (!isProfileRole(role)) return [];
  return ACCESS_MODULES.filter((m) => canAccessModule(role, m));
}

/** Error de acceso a módulo (denegación app-layer). */
export class ModuleAccessError extends Error {
  constructor(
    readonly module: AccessModule,
    readonly role: string | null | undefined,
  ) {
    super(`Acceso denegado al módulo "${module}" para el rol "${role ?? 'desconocido'}".`);
    this.name = 'ModuleAccessError';
  }
}

/**
 * Lanza `ModuleAccessError` si `role` NO puede acceder a `module`.
 * Útil como guard en capas puras/tests. En páginas/actions usar los helpers
 * server-side de `guard.ts` (que resuelven el actor y redirigen/deniegan).
 */
export function assertCanAccessModule(
  role: string | null | undefined,
  module: AccessModule,
): void {
  if (!canAccessModule(role, module)) {
    throw new ModuleAccessError(module, role);
  }
}
