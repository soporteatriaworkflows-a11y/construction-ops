/**
 * viewer.ts — Contexto de visualización DEMO/DEV para el preview con fixture.
 *
 * Propiedad: agent-db-rls (capa server read-model). Integración Oleada 3A.
 *
 * `ViewerContext` se resuelve SIEMPRE server-side. Mientras no exista
 * autenticación productiva (Oleada posterior), las páginas usan un **contexto
 * demo explícito** para el modo `READ_MODEL_SOURCE=fixture`. Esto NO es
 * autenticación: en modo `db` la barrera real es RLS (filtrado por
 * `organization_id`) y el viewer provendrá de la sesión.
 *
 * El `organizationId` demo coincide con la organización del fixture sanitizado
 * del golden master, de modo que el `FixtureReadModelRepository` devuelva datos.
 */
import type { ViewerContext, ViewerRole } from '@/lib/contracts/read-model';

/** Organización del fixture sanitizado (golden master). Solo demo/dev. */
export const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Devuelve un `ViewerContext` DEMO/DEV (no es autenticación productiva).
 * Por defecto rol `management` para el preview interno (ve ahorros). Para
 * verificar la vista cliente, pasar `'client'`.
 *
 * @param role - Rol del visor (por defecto `'management'`).
 * @returns Contexto demo con la organización del fixture.
 */
export function getDemoViewer(role: ViewerRole = 'management'): ViewerContext {
  return { organizationId: DEMO_ORGANIZATION_ID, role };
}
