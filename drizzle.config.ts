/**
 * Drizzle config — Construction Ops.
 *
 * Propiedad: agent-db-rls (ver docs/AGENT_REGISTRY.md).
 *
 * - `schema`: esquema Drizzle tipado (fuente del DDL generado).
 * - `out`: las migraciones SQL se escriben en `supabase/migrations`.
 * - `dialect`: PostgreSQL (Supabase).
 *
 * Sin credenciales hardcodeadas: `DATABASE_URL` se lee del entorno.
 * `pnpm db:generate` (raíz) genera el SQL desde el schema. NO se ejecuta
 * `migrate`/`push` contra ninguna base remota desde este agente.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./apps/web/lib/db/schema.ts",
  out: "./supabase/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
