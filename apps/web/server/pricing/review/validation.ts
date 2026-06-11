/**
 * validation.ts — Lógica PURA del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1). Sin DB, sin red.
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §6.
 */
import Decimal from 'decimal.js';
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import { unitsEquivalent } from '../units';
import { BulkSelectionInvalidError, BulkSelectionTooLargeError } from './errors';
import type {
  BulkSkippedRow,
  PendingReviewObservationView,
  ReviewWarning,
  Uuid,
} from './types';

/**
 * Máximo de filas por acción masiva. Selecciones mayores deben ejecutarse en
 * varias confirmaciones (cada una con su propia clave de idempotencia).
 * Documentado en el contrato §7.
 */
export const MAX_BULK_ROWS = 500;

/** Tamaño de chunk del UPDATE masivo (cada chunk es un solo statement SQL). */
export const BULK_UPDATE_CHUNK = 100;

/** Límite de observaciones cargadas en la pantalla de revisión. */
export const REVIEW_LIST_LIMIT = 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida la selección explícita: lista no vacía de UUIDs únicos, dentro del
 * máximo documentado. Duplicados en la selección se reportan como skip
 * (no como error fatal) para que el reporte sea completo.
 */
export function validateBulkSelection(observationIds: unknown): {
  validIds: Uuid[];
  duplicates: BulkSkippedRow[];
} {
  if (!Array.isArray(observationIds)) {
    throw new BulkSelectionInvalidError(['La selección debe ser una lista de IDs.']);
  }
  if (observationIds.length === 0) {
    throw new BulkSelectionInvalidError(['Selecciona al menos una observación.']);
  }
  if (observationIds.length > MAX_BULK_ROWS) {
    throw new BulkSelectionTooLargeError(MAX_BULK_ROWS, observationIds.length);
  }
  const seen = new Set<string>();
  const validIds: Uuid[] = [];
  const duplicates: BulkSkippedRow[] = [];
  const issues: string[] = [];
  for (const raw of observationIds) {
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
      issues.push(`ID inválido: ${String(raw).slice(0, 40)}`);
      continue;
    }
    const id = raw.toLowerCase();
    if (seen.has(id)) {
      duplicates.push({ observationId: id, reason: 'duplicate_in_selection' });
      continue;
    }
    seen.add(id);
    validIds.push(id);
  }
  if (issues.length > 0) throw new BulkSelectionInvalidError(issues);
  return { validIds, duplicates };
}

const UUID_KEY_RE = /^[0-9a-zA-Z_-]{8,128}$/;

/** Clave de idempotencia: token opaco acotado (el UNIQUE real vive en DB). */
export function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || !UUID_KEY_RE.test(key)) {
    throw new BulkSelectionInvalidError(['Clave de idempotencia inválida.']);
  }
  return key;
}

/**
 * Advertencias NO críticas de una observación pendiente. Visibles en la
 * tabla; no bloquean la aprobación (la usuaria decide conscientemente).
 *  - unit_mismatch: unidad RAW no equivalente a la canónica del recurso.
 *  - zero_price: precio observado en 0.
 *  - monitor_origin: cambio detectado por el monitor automático (política D:
 *    nunca auto-approve; selección consciente desde el review center).
 *  - foreign_currency: moneda distinta de COP.
 */
export function computeReviewWarnings(obs: {
  unit: string;
  resourceUnit: string;
  observedPrice: string;
  currency: string;
  fromMonitor: boolean;
}): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  if (obs.fromMonitor) {
    warnings.push({
      code: 'monitor_origin',
      message: 'Cambio detectado por el monitor automático. Revisa antes de aprobar.',
    });
  }
  if (!unitsEquivalent(obs.unit, obs.resourceUnit)) {
    warnings.push({
      code: 'unit_mismatch',
      message: `Unidad de la observación ("${obs.unit}") difiere de la del recurso ("${obs.resourceUnit}").`,
    });
  }
  try {
    if (new Decimal(obs.observedPrice).isZero()) {
      warnings.push({ code: 'zero_price', message: 'Precio observado en 0.' });
    }
  } catch {
    /* el precio ya fue validado al crear la observación */
  }
  if (obs.currency !== 'COP') {
    warnings.push({
      code: 'foreign_currency',
      message: `Moneda ${obs.currency} (distinta de COP).`,
    });
  }
  return warnings;
}

const SKIP_LABELS: Record<BulkSkippedRow['reason'], string> = {
  not_pending: 'Omitida (ya revisada)',
  not_found: 'Omitida (no encontrada en tu organización)',
  duplicate_in_selection: 'Omitida (duplicada en la selección)',
  update_failed: 'Omitida (no se pudo actualizar)',
};

/** Reporte CSV sanitizado del resultado de la acción masiva. */
export function buildBulkReviewReportCsv(
  actionType: 'approve' | 'reject',
  succeededIds: ReadonlyArray<Uuid>,
  skipped: ReadonlyArray<BulkSkippedRow>,
  byId: ReadonlyMap<Uuid, PendingReviewObservationView>,
): string {
  const actionLabel = actionType === 'approve' ? 'Aprobada' : 'Rechazada';
  const rows: Array<Array<string | number | null>> = [];
  for (const id of succeededIds) {
    const o = byId.get(id);
    rows.push([
      o?.resourceCode ?? '',
      o?.resourceName ?? '',
      o?.supplierName ?? '',
      o?.observedPrice ?? '',
      o?.unit ?? '',
      o?.sourceType ?? '',
      o?.batchLabel ?? '',
      actionLabel,
      '',
      id,
    ]);
  }
  for (const s of skipped) {
    const o = byId.get(s.observationId);
    rows.push([
      o?.resourceCode ?? '',
      o?.resourceName ?? '',
      o?.supplierName ?? '',
      o?.observedPrice ?? '',
      o?.unit ?? '',
      o?.sourceType ?? '',
      o?.batchLabel ?? '',
      SKIP_LABELS[s.reason],
      s.reason,
      s.observationId,
    ]);
  }
  return buildSanitizedCsv(
    [
      'Código',
      'Recurso',
      'Proveedor',
      'Precio observado',
      'Unidad',
      'Fuente',
      'Lote',
      'Resultado',
      'Motivo',
      'ID observación',
    ],
    rows,
  );
}
