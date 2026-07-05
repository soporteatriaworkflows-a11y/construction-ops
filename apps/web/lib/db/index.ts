/**
 * Cliente Drizzle — Construction Ops.
 *
 * Propiedad: agent-db-rls.
 *
 * Conexión a PostgreSQL (Supabase) mediante el driver `postgres` (postgres.js)
 * y Drizzle ORM. La URL se lee SIEMPRE de la variable de entorno
 * `DATABASE_URL`; nunca se hardcodean credenciales (regla global no negociable).
 *
 * Notas de seguridad / RLS:
 * - La aislación multitenant la garantiza Row Level Security en PostgreSQL
 *   (ver `supabase/migrations/*_rls_*.sql` y `supabase/policies/`). Las
 *   políticas leen la organización del usuario vía el helper SQL
 *   `app.current_org()`.
 * - Para que RLS aplique, la conexión debe usar un rol NO privilegiado
 *   (p. ej. el rol `authenticated` de Supabase con el JWT del usuario). El
 *   rol de servicio (service_role) y el owner BYPASSAN RLS: úsalos solo en
 *   procesos administrativos controlados, nunca en peticiones de usuario.
 *
 * El cliente es lazy y singleton para evitar abrir múltiples pools en
 * desarrollo (HMR de Next).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export { schema };

const DEFAULT_POSTGRES_POOL_MAX = 1;
const MAX_CONFIGURABLE_POSTGRES_POOL = 10;

/** Lee y valida la URL de conexión desde el entorno. */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error(
      "DATABASE_URL no está definida. Configúrala en el entorno " +
        "(ver .env.example). No se permiten credenciales hardcodeadas.",
    );
  }
  return url;
}

export function resolvePostgresPoolMax(
  env: { [key: string]: string | undefined } = process.env,
): number {
  const raw = env.POSTGRES_POOL_MAX ?? env.DB_POOL_MAX;
  if (!raw) return DEFAULT_POSTGRES_POOL_MAX;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_POSTGRES_POOL_MAX;

  return Math.min(parsed, MAX_CONFIGURABLE_POSTGRES_POOL);
}

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

// Singleton entre recargas en dev (evita fugas de conexiones con HMR).
const globalForDb = globalThis as unknown as {
  __cops_sql?: ReturnType<typeof postgres>;
  __cops_db?: DbClient;
};

/** Conexión postgres.js subyacente (singleton). */
export function getSql(): ReturnType<typeof postgres> {
  if (!globalForDb.__cops_sql) {
    globalForDb.__cops_sql = postgres(resolveDatabaseUrl(), {
      // Supavisor en session mode tiene pool bajo; en serverless el fan-out de
      // lambdas multiplica conexiones. Default conservador, override opcional.
      max: resolvePostgresPoolMax(),
      prepare: false, // compatible con el pooler de Supabase (PgBouncer).
    });
  }
  return globalForDb.__cops_sql;
}

/** Instancia Drizzle (singleton) tipada con el esquema completo. */
export function getDb(): DbClient {
  if (!globalForDb.__cops_db) {
    globalForDb.__cops_db = drizzle(getSql(), { schema });
  }
  return globalForDb.__cops_db;
}

/**
 * `db` perezoso: solo crea la conexión cuando se accede a un método. Permite
 * importar este módulo en contextos sin `DATABASE_URL` (p. ej. herramientas)
 * sin fallar al cargar.
 */
export const db = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
