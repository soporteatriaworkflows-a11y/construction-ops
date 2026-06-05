/**
 * scope-types.ts — Constantes CLIENT-SAFE de tipos de alcance (4B.2).
 *
 * FUENTE ÚNICA de los valores de `scope_type`. Vive bajo `lib/` (sin dependencias
 * de servidor) para poder importarse desde Client Components (formularios) sin
 * arrastrar el repositorio DB (`postgres`) al bundle del navegador.
 * `@/server/scopes/types` re-exporta de aquí para el lado servidor.
 */
import type { ScopeType } from '@/lib/contracts/read-model';

export type { ScopeType } from '@/lib/contracts/read-model';

/** Tipos de alcance permitidos por el esquema (`project_scopes_scope_type_valid`). */
export const SCOPE_TYPES: readonly ScopeType[] = [
  'floor',
  'tower',
  'stage',
  'package',
  'unit',
  'modification',
  'other',
] as const;

/** Valor inicial del select de tipo en el formulario (decisión 4B.2). */
export const DEFAULT_SCOPE_TYPE: ScopeType = 'floor';
