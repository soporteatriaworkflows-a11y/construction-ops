/**
 * rls.ts — Vinculación RLS request-scoped para lecturas tenant-scoped (P1-A / H-01).
 *
 * Propiedad: orquestador (remediación de seguridad P1-A). Contrato/decisión:
 * `docs/audits/security-baseline/17_P1A_READ_MODEL_RLS_DECISION.md`.
 *
 * PROBLEMA (H-01): el read-model se conecta con `DATABASE_URL`, cuyo rol efectivo
 * es `postgres` con `rolbypassrls = true` (ver auditoría MV-01,
 * `DATABASE_URL_RLS_STATUS = BYPASSRLS_ROLE`). Con ese rol, RLS NO se aplica y la
 * aislación entre organizaciones dependía solo del filtro `WHERE organization_id`.
 *
 * SOLUCIÓN (Alternativa B): ejecutar cada lectura tenant-scoped dentro de una
 * TRANSACCIÓN aislada por solicitud que:
 *   1. asume el rol restringido `authenticated` (NO `bypassrls`) con `SET LOCAL ROLE`;
 *   2. fija `request.jwt.claims` (transaccional, `is_local = true`) con la
 *      identidad verificada server-side;
 *   3. permite que PostgreSQL aplique las policies RLS existentes
 *      (`app.current_org()` resuelve la organización del JWT/perfil);
 *   4. se limpia automáticamente al COMMIT/ROLLBACK (SET LOCAL es transaccional)
 *      ⇒ SIN estado global reutilizable por el pool (sin contaminación entre
 *      solicitudes).
 *
 * Defensa en profundidad: NO sustituye los filtros explícitos por organización
 * del read-model; los complementa. La identidad/organización SIEMPRE provienen de
 * una sesión autenticada verificada server-side, JAMÁS del navegador.
 *
 * NOTA: aunque el rol de login tenga `rolbypassrls = true`, tras `SET LOCAL ROLE
 * authenticated` el rol ACTUAL es `authenticated` (sin bypass) y RLS se aplica.
 */
import type { ReservedSql } from 'postgres';
import { getSql } from './index';

/** Claims mínimos que leen las policies (`app.current_org()` / `app._auth_uid()`). */
export interface RlsClaims {
  /** `auth.uid()` efectivo: identifica al usuario (policies resuelven org por perfil). */
  sub: string;
  /** Organización (belt-and-suspenders; `current_org()` la prioriza si está presente). */
  organization_id?: string;
  /** Rol de negocio (para `current_role()`). */
  user_role?: string;
}

/** Construye los claims RLS desde una identidad verificada server-side. */
export function buildRlsClaims(viewer: {
  userId: string;
  organizationId: string;
  role?: string;
}): RlsClaims {
  return {
    sub: viewer.userId,
    organization_id: viewer.organizationId,
    ...(viewer.role ? { user_role: viewer.role } : {}),
  };
}

/**
 * Ejecuta `fn` como rol `authenticated` con los `claims` dados, dentro de una
 * transacción READ ONLY que SIEMPRE se cierra (COMMIT al final; ROLLBACK ante
 * error). El contexto (`request.jwt.claims` + rol) es transaccional: nunca
 * persiste en la conexión del pool.
 *
 * Uso previsto: envolver lecturas tenant-scoped del read-model. La conexión
 * subyacente puede tener `bypassrls`; el `SET LOCAL ROLE authenticated` hace que
 * RLS aplique igualmente.
 *
 * @throws si `claims.sub` está vacío (deny-by-default: sin identidad no se lee).
 */
export async function withTenantRls<T>(
  claims: RlsClaims,
  fn: (q: ReservedSql) => Promise<T>,
): Promise<T> {
  if (!claims || !claims.sub || claims.sub.trim().length === 0) {
    throw new Error('withTenantRls: identidad requerida (claims.sub vacío).');
  }
  const r = await getSql().reserve();
  try {
    await r.unsafe('BEGIN READ ONLY');
    const claimsStr = JSON.stringify(claims);
    // is_local = true ⇒ el setting solo vive en esta transacción.
    await r`SELECT set_config('request.jwt.claims', ${claimsStr}, true)`;
    await r.unsafe('SET LOCAL ROLE authenticated');
    const out = await fn(r);
    await r.unsafe('COMMIT');
    return out;
  } catch (e) {
    try {
      await r.unsafe('ROLLBACK');
    } catch {
      /* noop */
    }
    throw e;
  } finally {
    r.release();
  }
}
