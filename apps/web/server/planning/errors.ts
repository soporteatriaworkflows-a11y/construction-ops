/**
 * errors.ts — Errores del dominio server-side de planificación (SCHEDULE_FROM_BOQ_V1).
 */

/** El viewer no tiene permiso para la acción solicitada sobre cronogramas. */
export class SchedulePermissionError extends Error {
  constructor(message = 'No tienes permiso para esta acción de cronograma.') {
    super(message);
    this.name = 'SchedulePermissionError';
  }
}

/** Datos de entrada inválidos para crear/editar un cronograma. */
export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleValidationError';
  }
}

/** La escritura requiere Supabase + base de datos (no disponible en modo fixture). */
export class ScheduleWriteNotSupportedError extends Error {
  constructor(message = 'La gestión de cronogramas requiere modo Supabase + base de datos.') {
    super(message);
    this.name = 'ScheduleWriteNotSupportedError';
  }
}

/** Recurso de cronograma no encontrado (o fuera de la organización por RLS). */
export class ScheduleNotFoundError extends Error {
  constructor(message = 'Cronograma no encontrado.') {
    super(message);
    this.name = 'ScheduleNotFoundError';
  }
}
