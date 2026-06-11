/**
 * errors.ts — Errores de dominio explícitos del read-model.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §5`.
 *
 * El read-model NUNCA devuelve datos inventados ni hace fallback silencioso:
 * cuando un recurso no existe (o no es visible para la organización del viewer)
 * lanza el error correspondiente; cuando el selector `db` está mal configurado
 * lanza `ReadModelSourceNotConfiguredError`.
 */

import type { Uuid } from '@/lib/contracts/read-model';

/** Proyecto inexistente o no visible para la organización del viewer. */
export class ProjectNotFoundError extends Error {
  readonly code = 'project_not_found' as const;
  readonly projectId: Uuid;

  constructor(projectId: Uuid, message?: string) {
    super(message ?? `project_not_found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
    this.projectId = projectId;
  }
}

/** Versión de presupuesto inexistente o no visible para la organización. */
export class EstimateVersionNotFoundError extends Error {
  readonly code = 'estimate_version_not_found' as const;
  readonly estimateVersionId: Uuid;

  constructor(estimateVersionId: Uuid, message?: string) {
    super(message ?? `estimate_version_not_found: ${estimateVersionId}`);
    this.name = 'EstimateVersionNotFoundError';
    this.estimateVersionId = estimateVersionId;
  }
}

/** Plantilla APU inexistente o no visible para la organización del viewer. */
export class ApuNotFoundError extends Error {
  readonly code = 'apu_not_found' as const;
  readonly apuTemplateId: Uuid;

  constructor(apuTemplateId: Uuid, message?: string) {
    super(message ?? `apu_not_found: ${apuTemplateId}`);
    this.name = 'ApuNotFoundError';
    this.apuTemplateId = apuTemplateId;
  }
}

/**
 * El selector seleccionó `READ_MODEL_SOURCE=db` pero falta configuración
 * (p. ej. `DATABASE_URL`). NO se hace fallback silencioso a `fixture`: el modo
 * `db` exige configuración explícita.
 */
export class ReadModelSourceNotConfiguredError extends Error {
  readonly code = 'read_model_source_not_configured' as const;
  /** Fuente solicitada (p. ej. 'db'). */
  readonly source: string;

  constructor(source: string, message?: string) {
    super(
      message ??
        `read_model_source_not_configured: la fuente '${source}' requiere ` +
          `configuración (p. ej. DATABASE_URL). Sin fallback silencioso a 'fixture'.`,
    );
    this.name = 'ReadModelSourceNotConfiguredError';
    this.source = source;
  }
}
