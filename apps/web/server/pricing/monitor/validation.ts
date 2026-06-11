/**
 * validation.ts — Validación pura de inputs del monitor (Fase 4A).
 * Propiedad: agent-pricing.
 */
import { MONITOR_CADENCES } from './types';
import type { CreateTargetInput } from './types';

export interface MonitorValidationIssue {
  field: string;
  message: string;
}

export class MonitorValidationError extends Error {
  readonly issues: MonitorValidationIssue[];
  constructor(issues: MonitorValidationIssue[]) {
    super('Entrada de monitoreo inválida.');
    this.name = 'MonitorValidationError';
    this.issues = issues;
  }
}

const MAX_URL_LEN = 2000;

/** Valida cadencia contra el set permitido {1,7,15,30}. */
export function isValidCadence(value: number): boolean {
  return (MONITOR_CADENCES as readonly number[]).includes(value);
}

/**
 * Validación sintáctica del input de creación de target. La validación SSRF
 * profunda (DNS incluida) la hace la Server Action con validatePublicUrl
 * ANTES de persistir; aquí solo forma.
 */
export function validateCreateTargetInput(input: CreateTargetInput): MonitorValidationIssue[] {
  const issues: MonitorValidationIssue[] = [];

  if (!input.resourceId || input.resourceId.trim().length === 0) {
    issues.push({ field: 'resourceId', message: 'El recurso es obligatorio.' });
  }

  const url = (input.sourceUrl ?? '').trim();
  if (!url) {
    issues.push({ field: 'sourceUrl', message: 'La URL de la fuente es obligatoria.' });
  } else if (url.length > MAX_URL_LEN) {
    issues.push({ field: 'sourceUrl', message: `La URL no puede superar ${MAX_URL_LEN} caracteres.` });
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push({ field: 'sourceUrl', message: 'Solo se permiten URLs http(s).' });
      }
    } catch {
      issues.push({ field: 'sourceUrl', message: 'La URL no es válida.' });
    }
  }

  if (!isValidCadence(input.cadenceDays)) {
    issues.push({
      field: 'cadenceDays',
      message: 'La frecuencia debe ser 1, 7, 15 o 30 días.',
    });
  }

  return issues;
}
