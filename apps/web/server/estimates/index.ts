/**
 * index.ts — Selector de la capa de escritura/lectura RLS-bound de presupuestos (4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6`.
 *
 * `READ_MODEL_SOURCE` decide la implementación (análogo a los demás selectores),
 * SIN fallback silencioso db→fixture.
 */
import { resolveSource, type ReadModelLogger } from '@/server/read-model';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import { DbEstimatesWriteRepository } from './db-repository';
import { FixtureEstimatesWriteRepository } from './fixture-repository';
import type { EstimatesWriteRepository } from './types';

function isDbConfigured(env: Partial<NodeJS.ProcessEnv>): boolean {
  const url = env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

const defaultLogger: ReadModelLogger = {
  info: (message: string) => {
    console.info(message);
  },
};

export interface GetEstimatesWriteRepositoryOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  logger?: ReadModelLogger;
}

export function getEstimatesWriteRepository(
  options: GetEstimatesWriteRepositoryOptions = {},
): EstimatesWriteRepository {
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
    logger.info('[estimates-write] fuente activa: db (Supabase RLS-bound)');
    return new DbEstimatesWriteRepository();
  }

  logger.info('[estimates-write] fuente activa: fixture (demo/dev, solo lectura)');
  return new FixtureEstimatesWriteRepository();
}

export { DbEstimatesWriteRepository } from './db-repository';
export { FixtureEstimatesWriteRepository } from './fixture-repository';
export {
  ScopeNotFoundError,
  ChapterNotFoundError,
  EstimateNotFoundError,
  EstimateValidationError,
  EstimateWriteNotSupportedError,
  EstimateCodeGenerationError,
  AiuValidationError,
  AiuWriteNotSupportedError,
  AiuVersionLockedError,
  BoqValidationError,
  BoqWriteNotSupportedError,
  BoqVersionLockedError,
  BoqItemNotFoundError,
  BoqAlreadyArchivedError,
  BoqNotArchivedError,
  ChapterCodeDuplicateError,
  TargetChapterNotFoundError,
  VersionNotDraftError,
  VersionNotIssuedError,
} from './errors';
export type { BoqValidationIssue } from './errors';
export {
  validateChapterInput,
  validateBoqItemInput,
  validateBoqItemUpdate,
  deriveSubtotal,
  parseNonNegativeDecimal,
} from './boq-validation';
export {
  validateAiuRates,
  computeFinancialSummary,
  humanToFraction,
  fractionToHuman,
} from './aiu-calc';
export type { EstimateValidationIssue } from './errors';
export {
  validateCreateEstimateInput,
  slugifyEstimateCode,
  buildEstimateCodeCandidate,
  type NormalizedEstimateInput,
} from './validation';
export type {
  CreateEstimateInput,
  EstimateListItem,
  EstimateActiveVersionView,
  EstimateDetailView,
  EstimateStatus,
  EstimatesWriteRepository,
} from './types';
