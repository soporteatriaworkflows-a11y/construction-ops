/**
 * manual-store.ts — Persistencia LOCAL (localStorage) de takeoffs manuales F3.
 *
 * Esto NO es la persistencia real (F2 define las tablas `steel_*`; aquí no hay
 * DB/Supabase/RLS). Solo guarda INPUTS del navegador de quien previsualiza:
 * descripciones + % desperdicio + varilla manual. Todo lo derivado se
 * recalcula con `manual-takeoff.ts` en cada carga (una sola fuente de verdad).
 *
 * `parseStoredManualTakeoffs`/`serializeManualTakeoffs` son puras (testeables
 * sin navegador); `loadManualTakeoffs`/`saveManualTakeoffs` son el borde de
 * I/O y se protegen contra SSR y JSON corrupto (fail-safe: lista vacía).
 */
import type { SteelTakeoffStatusView } from './types';
import type { ManualLineEvidence, ManualLineRecord, ManualTakeoffRecord } from './manual-takeoff';

export const MANUAL_TAKEOFFS_STORAGE_KEY = 'steel-ops-preview.manual-takeoffs.v1';

const VALID_STATUSES: readonly SteelTakeoffStatusView[] = ['draft', 'in_review', 'approved', 'locked'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const EVIDENCE_METHODS = ['native_text', 'ocr', 'manual'] as const;

/** Evidencia F6E: solo trazabilidad; campos corruptos se descartan sin lanzar. */
function parseEvidence(raw: unknown): ManualLineEvidence | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  const evidence: ManualLineEvidence = {
    sourceFileName: str(source.sourceFileName),
    pageNumber:
      typeof source.pageNumber === 'number' && Number.isFinite(source.pageNumber)
        ? source.pageNumber
        : undefined,
    sourceType: str(source.sourceType),
    readingMethod: EVIDENCE_METHODS.includes(source.readingMethod as (typeof EVIDENCE_METHODS)[number])
      ? (source.readingMethod as ManualLineEvidence['readingMethod'])
      : undefined,
    confidence: str(source.confidence),
    originalFragment: str(source.originalFragment),
    observation: str(source.observation),
  };
  return Object.values(evidence).some((value) => value !== undefined) ? evidence : undefined;
}

function parseLine(raw: unknown): ManualLineRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const line = raw as Record<string, unknown>;
  if (!isNonEmptyString(line.id) || !isNonEmptyString(line.originalDescription)) return undefined;
  const manualBarNumber =
    typeof line.manualBarNumber === 'number' && Number.isInteger(line.manualBarNumber)
      ? line.manualBarNumber
      : undefined;
  return {
    id: line.id,
    originalDescription: line.originalDescription,
    assumedWastePct: isNonEmptyString(line.assumedWastePct) && !Number.isNaN(Number(line.assumedWastePct))
      ? line.assumedWastePct
      : '0',
    manualBarNumber,
    evidence: parseEvidence(line.evidence),
  };
}

function parseTakeoff(raw: unknown): ManualTakeoffRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const takeoff = raw as Record<string, unknown>;
  if (!isNonEmptyString(takeoff.id) || !isNonEmptyString(takeoff.name)) return undefined;
  const status = VALID_STATUSES.includes(takeoff.status as SteelTakeoffStatusView)
    ? (takeoff.status as SteelTakeoffStatusView)
    : 'draft';
  const lines = Array.isArray(takeoff.lines)
    ? takeoff.lines.map(parseLine).filter((l): l is ManualLineRecord => l !== undefined)
    : [];
  return {
    id: takeoff.id,
    name: takeoff.name,
    projectName: typeof takeoff.projectName === 'string' ? takeoff.projectName : '',
    scopeLabel: typeof takeoff.scopeLabel === 'string' ? takeoff.scopeLabel : '',
    status,
    createdAt: typeof takeoff.createdAt === 'string' ? takeoff.createdAt : '',
    lines,
  };
}

/** Parseo defensivo: JSON inválido, no-array o items corruptos ⇒ se descartan sin lanzar. */
export function parseStoredManualTakeoffs(rawJson: string | null): ManualTakeoffRecord[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseTakeoff).filter((t): t is ManualTakeoffRecord => t !== undefined);
  } catch {
    return [];
  }
}

export function serializeManualTakeoffs(records: readonly ManualTakeoffRecord[]): string {
  return JSON.stringify(records);
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadManualTakeoffs(storage?: Storage): ManualTakeoffRecord[] {
  const target = resolveStorage(storage);
  if (!target) return [];
  try {
    return parseStoredManualTakeoffs(target.getItem(MANUAL_TAKEOFFS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveManualTakeoffs(records: readonly ManualTakeoffRecord[], storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.setItem(MANUAL_TAKEOFFS_STORAGE_KEY, serializeManualTakeoffs(records));
  } catch {
    // Cuota llena o storage bloqueado: el preview sigue funcionando en memoria.
  }
}
