/**
 * Drizzle config — ESQUELETO MÍNIMO (Paso 0 / orchestrator).
 *
 * Propiedad real: agent-db-rls (ver docs/AGENT_REGISTRY.md).
 * agent-db-rls debe:
 *   - solicitar `drizzle-kit` vía docs/INTEGRATION_REQUESTS.md,
 *   - sustituir este objeto por `defineConfig(...)` de drizzle-kit,
 *   - definir `schema`, `out` (supabase/migrations) y `dialect: 'postgresql'`.
 *
 * Sin credenciales reales: la URL se lee de la variable de entorno.
 * Este esqueleto NO importa drizzle-kit para no añadir dependencias en Paso 0.
 */
const config = {
  dialect: "postgresql",
  schema: "./apps/web/lib/db/schema.ts",
  out: "./supabase/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} as const;

export default config;
