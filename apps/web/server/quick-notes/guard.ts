/**
 * guard.ts — Guard de privacidad de APP para Quick Notes (V5.4.2b).
 *
 * DOBLE DEFENSA (privacidad = riesgo #1 del proyecto):
 *  1) **RLS (primera defensa, la REAL)**: org-scoped + rol-gated + archive-only,
 *     verificada en Cloud (V5.4.2a, harness 31/31). Aunque el app-layer fallara,
 *     RLS impide leer/crear/mutar fuera de la organización y del rol.
 *  2) **App guard (segunda defensa, esta capa)**: no sirve notas al bucket
 *     client-safe ni deja crear/archivar desde él.
 *
 * Decisión de privacidad (V5.4.2b): las notas son INTERNAS. En el mapeo congelado
 * `profiles.role → ViewerRole`, `consulta → 'client'` (único origen de 'client';
 * no hay login de cliente externo). Se resuelve **privacy-first**: `ViewerRole
 * === 'client'` NO ve, NO crea, NO archiva notas en el app-layer. Alinea con la
 * redacción ya existente para 'client' (no ve ruta crítica ni financieros).
 * RLS a nivel DB permitiría a `consulta` leer, pero el app-layer no expone notas
 * al bucket client-safe.
 */
import type { ViewerRole } from '@/lib/contracts/read-model';

/** ¿Este viewer puede VER notas en el app-layer? (privacy-first: client no). */
export function canViewQuickNotes(role: ViewerRole): boolean {
  return role !== 'client';
}

/**
 * ¿Este viewer puede CREAR notas? Roles operativos internos
 * (admin/gerencia/presupuestos/obra/compras → ViewerRole internal/management/site).
 * `consulta` (→ 'client') NO. RLS lo exige además a nivel DB.
 */
export function canCreateQuickNotes(role: ViewerRole): boolean {
  return role !== 'client';
}

/**
 * ¿Este viewer puede INTENTAR archivar? Guard coarse (deny client). La regla fina
 * "creador O admin/gerencia" la impone RLS (`created_by = auth.uid() OR
 * current_role IN (admin,gerencia)`); un intento no autorizado devuelve 0 filas.
 */
export function canAttemptArchiveQuickNote(role: ViewerRole): boolean {
  return role !== 'client';
}
