/**
 * index.ts — Selector explícito de la fuente del read-model (Oleada 3A).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §2`.
 *
 * `READ_MODEL_SOURCE` decide la implementación del `ReadModelPort`:
 *   - `fixture` → `FixtureReadModelRepository` (preview local desde el golden
 *     master sanitizado; modo demo/dev). Por defecto cuando la variable falta.
 *   - `db`      → `DrizzleReadModelRepository` (Postgres local vía Drizzle).
 *
 * REGLAS:
 *  - SIN fallback silencioso `db` → `fixture`: si se selecciona `db` y falta la
 *    configuración (`DATABASE_URL`), se lanza `ReadModelSourceNotConfiguredError`.
 *  - El modo activo se LOGUEA claramente al resolver el puerto.
 *  - No abre conexión a la base al importarse: el repositorio Drizzle sólo se
 *    instancia cuando `getReadModel()` resuelve `db` con config válida.
 */

import type { ReadModelPort } from '@/lib/contracts/read-model';
import { FixtureReadModelRepository } from './fixture-repository';
import { DrizzleReadModelRepository } from './drizzle-repository';
import { ReadModelSourceNotConfiguredError } from './errors';

/** Fuentes válidas del read-model. */
export type ReadModelSource = 'fixture' | 'db';

/** Valor por defecto cuando `READ_MODEL_SOURCE` no está definido. */
const DEFAULT_SOURCE: ReadModelSource = 'fixture';

/**
 * Normaliza y valida el valor de `READ_MODEL_SOURCE`. Un valor desconocido es
 * un error de configuración explícito (no se asume un default silencioso para
 * valores no vacíos e inválidos).
 *
 * @param raw - Valor crudo de la variable de entorno.
 * @returns Fuente válida.
 * @throws ReadModelSourceNotConfiguredError si el valor es inválido.
 */
export function resolveSource(raw: string | undefined): ReadModelSource {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return DEFAULT_SOURCE;
  if (value === 'fixture' || value === 'db') return value;
  throw new ReadModelSourceNotConfiguredError(
    value,
    `READ_MODEL_SOURCE='${value}' inválido. Use 'fixture' o 'db'.`,
  );
}

/** Indica si hay configuración suficiente para el modo `db` (sin conectar). */
function isDbConfigured(env: Partial<NodeJS.ProcessEnv>): boolean {
  const url = env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

/** Logger inyectable (por defecto `console`) para registrar el modo activo. */
export interface ReadModelLogger {
  info(message: string): void;
}

const defaultLogger: ReadModelLogger = {
  info: (message: string) => {
    console.info(message);
  },
};

/** Opciones de resolución (facilitan testing sin tocar `process.env` global). */
export interface GetReadModelOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  logger?: ReadModelLogger;
}

/**
 * Resuelve la implementación activa del `ReadModelPort` según
 * `READ_MODEL_SOURCE`. Loguea el modo activo. NO hace fallback silencioso: si
 * `db` está seleccionado sin configuración, lanza
 * {@link ReadModelSourceNotConfiguredError}.
 *
 * @param options - `env` y `logger` inyectables (por defecto globales).
 * @returns Implementación del puerto (fixture o Drizzle).
 * @throws ReadModelSourceNotConfiguredError cuando `db` no está configurado.
 */
export function getReadModel(options: GetReadModelOptions = {}): ReadModelPort {
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
    logger.info('[read-model] fuente activa: db (Drizzle/PostgreSQL local)');
    return new DrizzleReadModelRepository();
  }

  logger.info('[read-model] fuente activa: fixture (demo/dev, golden master sanitizado)');
  return new FixtureReadModelRepository();
}

export { getDemoViewer, DEMO_ORGANIZATION_ID } from './viewer';
export { FixtureReadModelRepository } from './fixture-repository';
export { DrizzleReadModelRepository } from './drizzle-repository';
export {
  ProjectNotFoundError,
  EstimateVersionNotFoundError,
  ReadModelSourceNotConfiguredError,
} from './errors';
export { projectDashboardForRole, canSeeInternalDashboardFields } from './types';
export type {
  ViewerRole,
  ViewerContext,
  ProjectListItem,
  ProjectOverview,
  EstimateSummary,
  ChapterSummary,
  BoqItemView,
  ApuSummary,
  QuantityGroupView,
  QuantityLineView,
  CatalogResourceView,
  ChapterDistributionSlice,
  DashboardSummary,
  ProgressSummary,
  ReadModelPort,
} from '@/lib/contracts/read-model';
