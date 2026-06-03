/**
 * index.ts — Selector de la capa de escritura de proyectos (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §6`.
 *
 * `READ_MODEL_SOURCE` decide la implementación de `ProjectsWriteRepository`
 * (análogo a `getReadModel()`), SIN fallback silencioso db→fixture:
 *   - `db`      → `DbProjectsWriteRepository` (Supabase RLS-bound). Requiere
 *                 DATABASE_URL configurado, igual que el read-model `db`.
 *   - `fixture` → `FixtureProjectsWriteRepository` (demo/dev; escritura no aplica).
 *                 Por defecto cuando la variable falta.
 *
 * NO abre conexión al importarse: el repositorio sólo se instancia al resolver.
 */
import { resolveSource, type ReadModelLogger } from '@/server/read-model';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DbProjectsWriteRepository } from './db-repository';
import { FixtureProjectsWriteRepository } from './fixture-repository';
import type { ProjectsWriteRepository } from './types';

/** Indica si hay configuración suficiente para el modo `db` (sin conectar). */
function isDbConfigured(env: Partial<NodeJS.ProcessEnv>): boolean {
  const url = env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

const defaultLogger: ReadModelLogger = {
  info: (message: string) => {
    console.info(message);
  },
};

/** Opciones de resolución (facilitan testing sin tocar `process.env` global). */
export interface GetProjectsWriteRepositoryOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  logger?: ReadModelLogger;
}

/**
 * Resuelve la implementación activa de `ProjectsWriteRepository` según
 * `READ_MODEL_SOURCE`. Loguea el modo. NO hace fallback silencioso: si `db` está
 * seleccionado sin `DATABASE_URL`, lanza {@link ReadModelSourceNotConfiguredError}.
 */
export function getProjectsWriteRepository(
  options: GetProjectsWriteRepositoryOptions = {},
): ProjectsWriteRepository {
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
    logger.info('[projects-write] fuente activa: db (Supabase RLS-bound)');
    return new DbProjectsWriteRepository();
  }

  logger.info('[projects-write] fuente activa: fixture (demo/dev, solo lectura)');
  return new FixtureProjectsWriteRepository();
}

export { DbProjectsWriteRepository } from './db-repository';
export { FixtureProjectsWriteRepository } from './fixture-repository';
export {
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectWriteNotSupportedError,
  ProjectCodeGenerationError,
} from './errors';
export type { ProjectValidationIssue } from './errors';
export {
  validateCreateProjectInput,
  slugifyProjectCode,
  buildCodeCandidate,
  type NormalizedProjectInput,
} from './validation';
export type {
  CreateProjectInput,
  ProjectDetailView,
  ProjectsWriteRepository,
} from './types';
