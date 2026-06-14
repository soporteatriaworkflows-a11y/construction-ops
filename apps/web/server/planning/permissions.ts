/**
 * permissions.ts — Permisos de planificación (SCHEDULE_FROM_BOQ_V1 §6).
 *
 * Fuente de verdad en la APP; la barrera REAL es el backend (RPC valida
 * app.current_role() ∈ {admin,gerencia,presupuestos} + RLS FORCE). Estos helpers
 * gatean la UI y los caminos de escritura del servicio. NO bastan por sí solos:
 * el RPC/RLS rechaza igual a un rol no autorizado aunque la UI muestre el botón.
 *
 * Mapeo ViewerRole (role-map): internal=admin/presupuestos/compras,
 * management=gerencia, site=obra, client=consulta. A nivel ViewerRole no se puede
 * separar `compras` de `presupuestos` (ambos `internal`); la separación fina
 * (compras NO crea) la aplica el RPC con app.current_role(). Deuda registrada.
 */
import type { ViewerRole } from '@/lib/contracts/read-model';

/** ¿Puede crear/editar cronogramas? (admin/gerencia/presupuestos; el RPC excluye compras). */
export function canManageSchedules(role: ViewerRole): boolean {
  return role === 'internal' || role === 'management';
}

/** ¿Puede actualizar avance/estado de tareas? (gestión + obra). */
export function canUpdateScheduleProgress(role: ViewerRole): boolean {
  return role === 'internal' || role === 'management' || role === 'site';
}

/** ¿Puede ver cronogramas? Todos los roles autenticados (campos 🔒 ocultos a client). */
export function canViewSchedules(_role: ViewerRole): boolean {
  return true;
}
