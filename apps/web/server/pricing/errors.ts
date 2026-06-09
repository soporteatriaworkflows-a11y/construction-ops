/**
 * errors.ts — Errores de dominio del módulo de Price Intelligence (Fase 3A).
 * Propiedad: agent-pricing.
 */

export class ProviderNotFoundError extends Error {
  readonly code = 'provider_not_found' as const;
  readonly providerId: string;
  constructor(providerId: string) {
    super(`provider_not_found: ${providerId}`);
    this.name = 'ProviderNotFoundError';
    this.providerId = providerId;
  }
}

export class ProviderValidationError extends Error {
  readonly code = 'provider_validation' as const;
  readonly issues: Array<{ field: string; message: string }>;
  constructor(issues: Array<{ field: string; message: string }>) {
    super('provider_validation: ' + issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ProviderValidationError';
    this.issues = issues;
  }
}

export class ObservationNotFoundError extends Error {
  readonly code = 'observation_not_found' as const;
  readonly observationId: string;
  constructor(observationId: string) {
    super(`observation_not_found: ${observationId}`);
    this.name = 'ObservationNotFoundError';
    this.observationId = observationId;
  }
}

export class ObservationAlreadyReviewedError extends Error {
  readonly code = 'observation_already_reviewed' as const;
  readonly observationId: string;
  readonly currentStatus: string;
  constructor(observationId: string, currentStatus: string) {
    super(`observation_already_reviewed: ${observationId} (status=${currentStatus})`);
    this.name = 'ObservationAlreadyReviewedError';
    this.observationId = observationId;
    this.currentStatus = currentStatus;
  }
}

export class ObservationValidationError extends Error {
  readonly code = 'observation_validation' as const;
  readonly issues: Array<{ field: string; message: string }>;
  constructor(issues: Array<{ field: string; message: string }>) {
    super('observation_validation: ' + issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ObservationValidationError';
    this.issues = issues;
  }
}

export class PriceIntelligenceWriteNotSupportedError extends Error {
  readonly code = 'write_not_supported' as const;
  constructor() {
    super('write_not_supported: operación solo disponible con READ_MODEL_SOURCE=db');
    this.name = 'PriceIntelligenceWriteNotSupportedError';
  }
}

export class InsufficientRoleError extends Error {
  readonly code = 'insufficient_role' as const;
  constructor(required: string, got: string) {
    super(`insufficient_role: requires ${required}, got ${got}`);
    this.name = 'InsufficientRoleError';
  }
}
