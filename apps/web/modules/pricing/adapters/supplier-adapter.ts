/**
 * Utilidades base del adaptador de proveedor — agent-homecenter (Oleada 2B).
 *
 * Contiene lógica reutilizable entre adaptadores:
 * - Validación de precio (DecimalString).
 * - Normalización de moneda.
 * - Conversión de propuestas aprobadas a `RecordObservationInput`.
 * - Helpers de matching por descripción.
 * - Auditoría de aprobación.
 *
 * Contrato congelado v1 — `docs/PRICING_ADAPTER_CONTRACT.md`.
 */

import type { PriceSourceType, Uuid } from "@/lib/utils/types";
import type { RecordObservationInput } from "@/modules/pricing/types";

/** Puerto mínimo para aplicar observaciones aprobadas (subconjunto de PricingApprovalPort). */
export interface MinimalApprovalPort {
  recordObservation(input: RecordObservationInput): Promise<{ observationId: Uuid }>;
  approveObservation(input: {
    observationId: Uuid;
    approvedBy: Uuid;
    approvedAt: string;
  }): Promise<unknown>;
}

import type {
  RawSupplierItem,
  SkuMatchCandidate,
  SkuMatchProposal,
} from "./types";

/* ----------------------------------------------------------------------------
 * Validación de precio
 * ------------------------------------------------------------------------- */

/** Monedas ISO-4217 soportadas. */
export const SUPPORTED_CURRENCIES = new Set(["COP", "USD", "EUR"]);

/** Verifica que un string sea un número decimal válido y positivo. */
export function isValidPrice(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Acepta enteros y decimales, sin notación científica, sin negativos.
  const num = Number(trimmed);
  return !isNaN(num) && isFinite(num) && num > 0;
}

/**
 * Parsea un string de precio a DecimalString normalizado.
 * Elimina separadores de miles (puntos en formato colombiano) y normaliza comas.
 * Lanza un error si el valor es inválido.
 */
export function parsePrice(raw: string, fieldName = "precio"): string {
  // Normalizar: remover separadores de miles y convertir coma decimal.
  let normalized = raw.trim();
  // Si tiene coma como decimal (p. ej. "28.000,50") → convertir.
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(normalized)) {
    // Formato europeo/colombiano: puntos como miles, coma como decimal.
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    // Formato con coma como miles (p. ej. "28,000.50").
    normalized = normalized.replace(/,/g, "");
  }

  const num = Number(normalized);
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    throw new Error(
      `Campo "${fieldName}" inválido: "${raw}" no es un precio positivo válido.`,
    );
  }
  return normalized;
}

/* ----------------------------------------------------------------------------
 * Normalización de moneda
 * ------------------------------------------------------------------------- */

/** Normaliza y valida la moneda ISO-4217. Usa 'COP' como default. */
export function normalizeCurrency(raw?: string): string {
  if (!raw) return "COP";
  const upper = raw.trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.has(upper)) return upper;
  // Moneda no reconocida → advertencia, usar como viene (no bloqueante).
  return upper;
}

/* ----------------------------------------------------------------------------
 * Conversión de propuestas aprobadas a RecordObservationInput
 * ------------------------------------------------------------------------- */

/**
 * Convierte propuestas `status='approved'` en entradas para
 * `PricingApprovalPort.recordObservation`.
 *
 * Reglas (contrato §2, regla 6):
 * - Solo procesa propuestas con `status='approved'`.
 * - Solo procesa propuestas con `chosen` definido.
 * - `sourceType` fijo = 'supplier_csv' (Oleada 2B).
 * - `sourceReference` = URL o SKU si existe (🔒 interno).
 */
export function proposalsToObservationInputs(
  proposals: SkuMatchProposal[],
  sourceType: PriceSourceType = "supplier_csv",
): RecordObservationInput[] {
  const results: RecordObservationInput[] = [];

  for (const proposal of proposals) {
    if (proposal.status !== "approved") continue;
    if (!proposal.chosen?.supplierProductId) continue;

    const item = proposal.rawItem;
    const input: RecordObservationInput = {
      supplierProductId: proposal.chosen.supplierProductId,
      observedPrice: item.onlinePublicPrice,
      sourceType,
      observedAt: item.observedAt,
    };

    // Campos opcionales (🔒 internos).
    if (item.sourceReference) {
      input.sourceReference = item.sourceReference;
    }
    if (item.url) {
      // URL como referencia interna (🔒).
      input.sourceReference = item.sourceReference ?? item.url;
    }

    results.push(input);
  }

  return results;
}

/* ----------------------------------------------------------------------------
 * Helpers de matching por descripción (score simple)
 * ------------------------------------------------------------------------- */

/**
 * Tokeniza un string a palabras normalizadas (lowercase, sin caracteres especiales).
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remover diacríticos
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Score de similitud Jaccard entre dos strings normalizados.
 * Valor 0..1; mayor = más similar.
 */
export function jaccardScore(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Umbral de score por encima del cual se considera un candidato como claro.
 * Por debajo → `requiresManualReview=true`.
 */
export const CLEAR_MATCH_THRESHOLD = 0.5;

/**
 * Umbral de score mínimo para incluir un candidato en la lista.
 */
export const MIN_CANDIDATE_THRESHOLD = 0.15;

/**
 * Determina si una propuesta es ambigua (requiere revisión humana).
 * Una propuesta es ambigua si:
 * - No tiene candidatos.
 * - El mejor candidato tiene score < `CLEAR_MATCH_THRESHOLD`.
 * - Hay más de un candidato con score similar (diferencia < 0.1).
 */
export function isAmbiguous(candidates: SkuMatchCandidate[]): boolean {
  if (candidates.length === 0) return true;
  const best = candidates[0];
  if (best === undefined) return true;
  if (best.score < CLEAR_MATCH_THRESHOLD) return true;
  if (candidates.length > 1) {
    const second = candidates[1];
    if (second !== undefined && best.score - second.score < 0.1) return true;
  }
  return false;
}

/* ----------------------------------------------------------------------------
 * Auditoría de aprobación
 * ------------------------------------------------------------------------- */

/**
 * Registro de auditoría de una aprobación de importación.
 * Almacena el mínimo de información necesaria para trazabilidad.
 * Campos 🔒 INTERNOS: nunca exponer a cliente.
 */
export interface ImportApprovalAudit {
  /** ID interno del aprobador (profiles.id). 🔒 */
  approvedBy: Uuid;
  /** Timestamp de la aprobación. 🔒 */
  approvedAt: string;
  /** Nombre del archivo fuente (trazabilidad). 🔒 */
  sourceFileName: string;
  /** Tipo de fuente. */
  sourceType: PriceSourceType;
  /** IDs de las observaciones registradas. 🔒 */
  observationIds: Uuid[];
  /** Número de duplicados ignorados. */
  duplicates: number;
  /** Número de ítems rechazados. */
  rejected: number;
  /** Motivo o notas del aprobador (opcional). 🔒 */
  reason?: string;
}

/**
 * Aplica las propuestas aprobadas vía el puerto de aprobación y devuelve
 * un registro de auditoría.
 *
 * Esta función es el punto de entrada para la persistencia tras la aprobación
 * humana. Llama a `PricingApprovalPort.recordObservation` por cada ítem
 * aprobado y luego llama a `PricingApprovalPort.approveObservation`.
 *
 * @param proposals - Propuestas del preview (mezcla de pending/approved/rejected).
 * @param port - Puerto de aprobación (implementado por pricing).
 * @param approvedBy - ID del aprobador humano.
 * @param approvedAt - Timestamp de la aprobación.
 * @param sourceFileName - Nombre del archivo fuente (trazabilidad).
 * @param idempotencyKeys - Claves ya registradas (para detectar duplicados).
 * @param sourceType - Tipo de fuente (default 'supplier_csv').
 */
export async function applyApprovedProposals(
  proposals: SkuMatchProposal[],
  port: MinimalApprovalPort,
  approvedBy: Uuid,
  approvedAt: string,
  sourceFileName: string,
  idempotencyKeys: Set<string>,
  sourceType: PriceSourceType = "supplier_csv",
): Promise<ImportApprovalAudit & { errors: string[] }> {
  const observationIds: Uuid[] = [];
  const errors: string[] = [];
  let duplicates = 0;
  let rejected = 0;

  const observationInputs = proposalsToObservationInputs(proposals, sourceType);

  for (const input of observationInputs) {
    // Clave de idempotencia para este input.
    const key = [
      input.supplierProductId,
      input.observedAt,
      input.sourceType,
    ].join("|");

    if (idempotencyKeys.has(key)) {
      duplicates++;
      continue;
    }

    try {
      const { observationId } = await port.recordObservation(input);
      await port.approveObservation({
        observationId,
        approvedBy,
        approvedAt,
      });
      observationIds.push(observationId);
      idempotencyKeys.add(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error al registrar observación: ${msg}`);
    }
  }

  // Contar rechazados explícitamente.
  rejected = proposals.filter((p) => p.status === "rejected").length;

  return {
    approvedBy,
    approvedAt,
    sourceFileName,
    sourceType,
    observationIds,
    duplicates,
    rejected,
    errors,
  };
}
