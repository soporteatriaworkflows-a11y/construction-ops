/**
 * index.ts — Fabrica del repositorio de catalogo de recursos (Bootstrap CTAs).
 * Propiedad: agent-frontend-boq.
 *
 * Devuelve DbCatalogRepository cuando READ_MODEL_SOURCE=db.
 * Lanza ResourceWriteNotSupportedError en modo fixture/demo.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { DbCatalogRepository } from './db-repository';
import { ResourceWriteNotSupportedError } from './errors';

export type { ResourceView, ResourceCreateInput, ResourceType, AuthenticatedViewer } from './types';
export { ResourceValidationError, ResourceWriteNotSupportedError } from './errors';
export { validateResourceCreateInput } from './validation';

export function getResourceRepository(): DbCatalogRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbCatalogRepository();
  throw new ResourceWriteNotSupportedError();
}
