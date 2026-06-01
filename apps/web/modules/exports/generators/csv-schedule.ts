/**
 * csv-schedule.ts — Generador CSV cronograma base.
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §3.E`.
 *
 * Columnas: wbs_code, name, planned_start, planned_end, planned_duration_days,
 *           progress_pct, predecessor_wbs, dependency_type, lag_days,
 *           is_milestone, external_reference (solo perfil `internal`).
 *
 * REGLAS:
 *  - `external_reference` SOLO se incluye en perfil `internal`.
 *  - Proyección ya aplicada por el read-model: `ScheduleSummary` ya tiene los
 *    campos filtrados por rol. No necesita re-filtrar aquí.
 *  - CSV manual con encoding UTF-8; sin BOM; separador `,`.
 *  - Generado en memoria (Uint8Array); sin temporales en disco.
 */

import type { ScheduleSummary, DependencyView } from '@/lib/contracts/read-model';
import type { ExportProfile } from '../types';
import Decimal from 'decimal.js';

/** Escapar un valor para CSV (RFC 4180). */
function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  // Si contiene coma, comilla doble o salto de línea, envolver en comillas
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(csvEscape).join(',');
}

export interface CsvScheduleInput {
  schedule: ScheduleSummary;
  profile: ExportProfile;
}

export function generateCsvSchedule(input: CsvScheduleInput): Uint8Array {
  const { schedule, profile } = input;
  const includeExternalRef = profile === 'internal';

  // Índice de dependencias: sucesor → primera dependencia (para simplificar CSV)
  const depBySuccessor = new Map<string, DependencyView>();
  for (const dep of schedule.dependencies) {
    // Guardar la primera dependencia encontrada para cada sucesor
    if (!depBySuccessor.has(dep.successorTaskId)) {
      depBySuccessor.set(dep.successorTaskId, dep);
    }
  }

  // Índice de tareas por ID para lookup de WBS
  const taskWbs = new Map<string, string>();
  for (const task of schedule.tasks) {
    taskWbs.set(task.id, task.wbsCode);
  }

  // Encabezados
  const headers = [
    'wbs_code',
    'name',
    'planned_start',
    'planned_end',
    'planned_duration_days',
    'progress_pct',
    'predecessor_wbs',
    'dependency_type',
    'lag_days',
    'is_milestone',
  ];
  if (includeExternalRef) {
    headers.push('external_reference');
  }

  const lines: string[] = [csvRow(headers)];

  for (const task of schedule.tasks) {
    const dep = depBySuccessor.get(task.id);
    const predecessorWbs = dep ? (taskWbs.get(dep.predecessorTaskId) ?? '') : '';
    const depType = dep?.dependencyType ?? '';
    const lagDays = dep
      ? new Decimal(dep.lagDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
      : '';

    const row: (string | number | boolean | null)[] = [
      task.wbsCode,
      task.name,
      task.plannedStart,
      task.plannedEnd,
      new Decimal(task.plannedDurationDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      new Decimal(task.progressPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      predecessorWbs,
      depType,
      lagDays,
      task.isMilestone,
    ];

    // external_reference: el campo no existe en ScheduleTaskView (proyectado por rol)
    // Solo en raw fixture; el DTO ya lo omite para perfiles no-internal.
    // Para `internal`, el fixture tiene externalReference en la capa raw, pero
    // el DTO ScheduleTaskView no lo expone (el contrato no lo incluye en el DTO).
    // Dejamos '' para todos los perfiles (el DTO no lo proyecta en ningún perfil).
    // En una futura extensión del contrato se agregaría externalReference al DTO.
    if (includeExternalRef) {
      row.push('');
    }

    lines.push(csvRow(row));
  }

  const csv = lines.join('\r\n');
  const encoder = new TextEncoder();
  return encoder.encode(csv);
}
