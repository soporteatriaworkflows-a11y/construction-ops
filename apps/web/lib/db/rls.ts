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
import { sql } from 'drizzle-orm';
import { getSql, db } from './index';

/**
 * Tipo del cliente Drizzle transaccional RLS-scoped que recibe `withTenantDb`.
 * Es la transacción que entrega `db.transaction(...)` (no el `db` global).
 */
export type TenantScopedDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Claims mínimos que leen las policies (`app.current_org()` / `app._auth_uid()`). */
export interface RlsClaims {
  /**
   * `auth.uid()` efectivo (claim `sub`): identifica al usuario; las policies
   * resuelven la organización por perfil cuando no hay claim `organization_id`.
   * Opcional si se aporta `organization_id` (autoridad server-side equivalente).
   */
  sub?: string;
  /** Organización (autoridad server-side; `current_org()` la prioriza si está presente). */
  organization_id?: string;
  /** Rol de negocio (para `current_role()`). */
  user_role?: string;
}

/**
 * Construye los claims RLS desde una identidad verificada server-side. Acepta
 * `userId` (escritura) y/o `profileId` (read-model: `ViewerContext.profileId`).
 * El `organization_id` SIEMPRE proviene del servidor, nunca del navegador.
 */
export function buildRlsClaims(viewer: {
  userId?: string;
  profileId?: string;
  organizationId: string;
  role?: string;
}): RlsClaims {
  const sub = viewer.userId ?? viewer.profileId;
  return {
    ...(sub ? { sub } : {}),
    organization_id: viewer.organizationId,
    ...(viewer.role ? { user_role: viewer.role } : {}),
  };
}

/** `true` si los claims contienen alguna autoridad server-side (sub u org). */
function hasIdentity(claims: RlsClaims | null | undefined): boolean {
  return !!claims && ((!!claims.sub && claims.sub.trim().length > 0) ||
    (!!claims.organization_id && claims.organization_id.trim().length > 0));
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
  if (!hasIdentity(claims)) {
    throw new Error('withTenantRls: identidad requerida (sub u organization_id).');
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

/**
 * Variante de `withTenantRls` que entrega un cliente **Drizzle** ligado a la
 * conexión RLS-scoped (rol `authenticated` + claims transaccionales). Pensada
 * para envolver lecturas del read-model que usan Drizzle. Mismas garantías:
 * transacción READ ONLY request-scoped, sin contaminación del pool, deny si no
 * hay identidad/organización server-side.
 */
export async function withTenantDb<T>(
  claims: RlsClaims,
  fn: (db: TenantScopedDb) => Promise<T>,
): Promise<T> {
  if (!hasIdentity(claims)) {
    throw new Error('withTenantDb: identidad requerida (sub u organization_id).');
  }
  // Transacción READ ONLY de Drizzle: toma UNA conexión del pool, fija el rol y
  // los claims de forma transaccional (`is_local=true` / `SET LOCAL`) y los
  // revierte al COMMIT/ROLLBACK ⇒ sin contaminación entre solicitudes.
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      return fn(tx);
    },
    { accessMode: 'read only' },
  );
}
