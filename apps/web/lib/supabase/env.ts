/**
 * env.ts — Lectura tipada y segura de las variables públicas de Supabase y del
 * modo de autenticación. Propiedad: orquestador (runtime auth 4A.2).
 *
 * Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §1-2`.
 *
 * Reglas:
 *  - Solo variables PÚBLICAS (`NEXT_PUBLIC_*`) o de modo. NUNCA service_role.
 *  - Sin fallback silencioso: combinaciones de modo inválidas => error explícito.
 */

/** Modo de autenticación de la app. */
export type AppAuthMode = 'demo' | 'supabase';

/** Fuente de datos del read-model. */
export type ReadModelSource = 'fixture' | 'db';

/** Error de configuración de entorno (mensaje legible, sin secretos). */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

/** Parsea `APP_AUTH_MODE` (por defecto `demo`). Lanza si es inválido. */
export function parseAuthMode(raw: string | undefined): AppAuthMode {
  const v = (raw ?? 'demo').trim().toLowerCase();
  if (v === 'demo' || v === 'supabase') return v;
  throw new AuthConfigError(
    `APP_AUTH_MODE inválido: "${raw}". Valores: demo | supabase.`,
  );
}

/** Parsea `READ_MODEL_SOURCE` (por defecto `fixture`). Lanza si es inválido. */
export function parseReadModelSource(raw: string | undefined): ReadModelSource {
  const v = (raw ?? 'fixture').trim().toLowerCase();
  if (v === 'fixture' || v === 'db') return v;
  throw new AuthConfigError(
    `READ_MODEL_SOURCE inválido: "${raw}". Valores: fixture | db.`,
  );
}

/**
 * Valida la combinación modo×fuente (AUTH_RUNTIME_CONTRACT §1). Sin fallback
 * silencioso: la combinación prohibida `demo + db` lanza error explícito.
 */
export function validateModeCombo(
  mode: AppAuthMode,
  source: ReadModelSource,
): void {
  if (mode === 'demo' && source === 'db') {
    throw new AuthConfigError(
      'Combinación prohibida: APP_AUTH_MODE=demo con READ_MODEL_SOURCE=db. ' +
        'El modo demo solo opera con fixture sanitizado.',
    );
  }
}

/** Resuelve el modo activo desde `env` (sin valores reales en repo). */
export function resolveAuthMode(
  env: Record<string, string | undefined> = process.env,
): AppAuthMode {
  return parseAuthMode(env.APP_AUTH_MODE);
}

/**
 * Lee las variables PÚBLICAS de Supabase. Lanza `AuthConfigError` si faltan
 * (necesarias solo en modo `supabase`). Acepta la clave como
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o, por compat, `..._ANON_KEY`.
 */
export function getPublicSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): { url: string; publishableKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new AuthConfigError(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        'para APP_AUTH_MODE=supabase. Configúralas en .env.local (no versionado).',
    );
  }
  return { url, publishableKey };
}
