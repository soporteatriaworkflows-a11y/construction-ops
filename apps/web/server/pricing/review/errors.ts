/**
 * errors.ts — Errores del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Propiedad: agent-pricing.
 */

export class BulkSelectionInvalidError extends Error {
  readonly code = 'bulk_selection_invalid' as const;
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`bulk_selection_invalid: ${issues.join('; ')}`);
    this.name = 'BulkSelectionInvalidError';
    this.issues = issues;
  }
}

export class BulkSelectionTooLargeError extends Error {
  readonly code = 'bulk_selection_too_large' as const;
  readonly max: number;
  readonly got: number;
  constructor(max: number, got: number) {
    super(`bulk_selection_too_large: max ${max}, got ${got}`);
    this.name = 'BulkSelectionTooLargeError';
    this.max = max;
    this.got = got;
  }
}

export class BulkActionDuplicateError extends Error {
  readonly code = 'bulk_action_duplicate' as const;
  readonly idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super(`bulk_action_duplicate: ${idempotencyKey}`);
    this.name = 'BulkActionDuplicateError';
    this.idempotencyKey = idempotencyKey;
  }
}

export class BulkRejectionReasonRequiredError extends Error {
  readonly code = 'bulk_rejection_reason_required' as const;
  constructor() {
    super('bulk_rejection_reason_required');
    this.name = 'BulkRejectionReasonRequiredError';
  }
}
