/**
 * index.ts — Selector de la capa de escritura/lectura RLS-bound de alcances (4B.2).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §6`.
 *
 * `READ_MODEL_SOURCE` decide la implementación de `ScopesWriteRepository`
 * (análogo a `getProjectsWriteRepository()`), SIN fallback silencioso db→fixture:
 *   - `db`      → `DbScopesWriteRepository` (Supabase RLS-bound). Requiere
 *                 DATABASE_URL.
 *   - `fixture` → `FixtureScopesWriteRepository` (demo/dev; escritura no aplica).
 *
 * NO abre conexión al importarse: el repositorio sólo se instancia al resolver.
 */
import { resolveSource, type ReadModelLogger } from '@/server/read-model';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DbScopesWriteRepository } from './db-repository';
import { FixtureScopesWriteRepository } from './fixture-repository';
import type { ScopesWriteRepository } from './types';

function isDbConfigured(env: Partial<NodeJS.ProcessEnv>): boolean {
  const url = env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

const defaultLogger: ReadModelLogger = {
  info: (message: string) => {
    console.info(message);
  },
};

export interface GetScopesWriteRepositoryOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  logger?: ReadModelLogger;
}

/**
 * Resuelve la implementación activa de `ScopesWriteRepository` según
 * `READ_MODEL_SOURCE`. NO hace fallback silencioso: si `db` está seleccionado sin
 * `DATABASE_URL`, lanza {@link ReadModelSourceNotConfiguredError}.
 */
export function getScopesWriteRepository(
  options: GetScopesWriteRepositoryOptions = {},
): ScopesWriteRepository {
  const env = options.env ?? process.env;
  const logger = options.logger ?? defaultLogger;
  const source = resolveSource(env.READ_MODEL_SOURCE);

  if (source === 'db') {
    if (!isDbConfigured(env)) {
      throw new ReadModelSourceNotConfiguredError(
        'db',
        'READ_MODEL_SOURCE=db requiere DATABASE_URL. No hay fallback a fixture.',
      );
    }
    logger.info('[scopes-write] fuente activa: db (Supabase RLS-bound)');
    return new DbScopesWriteRepository();
  }

  logger.info('[scopes-write] fuente activa: fixture (demo/dev, solo lectura)');
  return new FixtureScopesWriteRepository();
}

export { DbScopesWriteRepository } from './db-repository';
export { FixtureScopesWriteRepository } from './fixture-repository';
export {
  ProjectNotFoundError,
  ScopeNotFoundError,
  ScopeValidationError,
  ScopeWriteNotSupportedError,
  ScopeCodeGenerationError,
} from './errors';
export type { ScopeValidationIssue } from './errors';
export {
  validateCreateScopeInput,
  slugifyScopeCode,
  buildScopeCodeCandidate,
  type NormalizedScopeInput,
} from './validation';
export {
  SCOPE_TYPES,
  DEFAULT_SCOPE_TYPE,
} from './types';
export type {
  CreateScopeInput,
  ScopeListItem,
  ScopeDetailView,
  ScopeType,
  ScopesWriteRepository,
} from './types';
