/**
 * types.ts — Tipos del módulo de exportaciones (Oleada 3C).
 *
 * Propiedad: agent-exports. Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §1,§3,§4`.
 *
 * REGLAS:
 *  - `ExportProfile` es alias 1:1 de `ViewerRole`.
 *  - Cada exportación pasa por proyección server-side ANTES de serializar.
 *  - Dinero como `DecimalString` (política Q9: ROUND_HALF_UP solo en presentación).
 *  - Errores tipados; nunca exponer stack técnico al consumidor.
 *  - Generar en memoria; sin temporales sensibles en disco.
 */

import type { Uuid, IsoDateTime } from '@/lib/contracts/read-model';

/* ---------------------------------------------------------------------------
 * ExportProfile — 1:1 con ViewerRole
 * ------------------------------------------------------------------------- */

/**
 * Perfil de exportación. Mapea 1:1 con `ViewerRole` del read-model canónico.
 * Determina la proyección de datos que se aplica ANTES de generar el archivo.
 */
export type ExportProfile = 'client' | 'site' | 'management' | 'internal';

/* ---------------------------------------------------------------------------
 * ExportFormat — 5 formatos MVP
 * ------------------------------------------------------------------------- */

/**
 * Formato de exportación disponible en el MVP (Oleada 3C).
 * Ver `EXPORT_PROFILES_CONTRACT.md §3`.
 */
export type ExportFormat =
  | 'xlsx-client'      // Excel presupuesto para cliente
  | 'xlsx-internal'    // Excel técnico interno (perfil `internal`)
  | 'pdf-client'       // PDF presupuesto para cliente
  | 'pdf-management'   // PDF gerencial (perfil `management`)
  | 'csv-schedule';    // CSV cronograma (proyectado por perfil)

/* ---------------------------------------------------------------------------
 * Compatibilidad perfil × formato
 * ------------------------------------------------------------------------- */

/**
 * Mapa de compatibilidad explícita entre formato y perfil(es) permitidos.
 * `csv-schedule` admite cualquier perfil (proyectado por rol).
 */
export const FORMAT_PROFILE_COMPAT: Record<ExportFormat, ExportProfile[]> = {
  'xlsx-client':    ['client'],
  'xlsx-internal':  ['internal'],
  'pdf-client':     ['client'],
  'pdf-management': ['management'],
  'csv-schedule':   ['client', 'site', 'management', 'internal'],
} as const;

/* ---------------------------------------------------------------------------
 * ExportRequest
 * ------------------------------------------------------------------------- */

/** Petición de exportación. Todos los campos se validan antes de generar. */
export interface ExportRequest {
  /** Perfil de exportación (proyección de datos a aplicar). */
  profile: ExportProfile;
  /** ID del proyecto a exportar. */
  projectId: Uuid;
  /** Versión del presupuesto (opcional; usa la vigente si se omite). */
  estimateVersionId?: Uuid;
  /** Formato de salida. */
  format: ExportFormat;
  /** Si se incluye el cronograma (aplica a xlsx-internal y csv-schedule). */
  includeSchedule?: boolean;
  /** Si se incluyen entradas de avance. */
  includeProgress?: boolean;
  /** ID del usuario que solicita (para trazabilidad). */
  requestedBy: Uuid;
  /** Timestamp de la solicitud (ISO 8601). */
  requestedAt: IsoDateTime;
}

/* ---------------------------------------------------------------------------
 * ExportResult
 * ------------------------------------------------------------------------- */

/** Resultado de exportación: archivo generado en memoria. */
export interface ExportResult {
  /** Nombre de archivo sanitizado (sin PII, sin rutas, sin chars peligrosos). */
  fileName: string;
  /** MIME type del archivo. Ver §3. */
  contentType: string;
  /** Contenido del archivo generado en memoria. */
  buffer: Uint8Array;
  /** Tamaño del buffer en bytes. */
  sizeBytes: number;
  /** Timestamp de generación (ISO 8601). */
  generatedAt: IsoDateTime;
  /** Perfil con el que se generó. */
  profile: ExportProfile;
}

/* ---------------------------------------------------------------------------
 * ExportService
 * ------------------------------------------------------------------------- */

/**
 * Servicio de exportación. Única entrada pública para generar archivos.
 * Implementado en `apps/web/server/exports/export-service.ts`.
 */
export interface ExportService {
  generate(request: ExportRequest): Promise<ExportResult>;
}

/* ---------------------------------------------------------------------------
 * Errores de exportación
 * ------------------------------------------------------------------------- */

/** Error de validación de combinación perfil×formato. */
export class ExportProfileFormatMismatchError extends Error {
  constructor(
    public readonly profile: ExportProfile,
    public readonly format: ExportFormat,
  ) {
    super(
      `El formato "${format}" no es compatible con el perfil "${profile}". ` +
      `Perfiles permitidos: ${FORMAT_PROFILE_COMPAT[format].join(', ')}.`,
    );
    this.name = 'ExportProfileFormatMismatchError';
  }
}

/** Error de tamaño de exportación excedido. */
export class ExportSizeLimitError extends Error {
  constructor(
    public readonly sizeBytes: number,
    public readonly limitBytes: number,
  ) {
    super(
      `La exportación supera el límite de tamaño (${sizeBytes} bytes > ${limitBytes} bytes).`,
    );
    this.name = 'ExportSizeLimitError';
  }
}

/** Error al generar el archivo (sin detalles técnicos internos). */
export class ExportGenerationError extends Error {
  constructor(
    public readonly format: ExportFormat,
    message: string,
  ) {
    super(`Error generando exportación "${format}": ${message}`);
    this.name = 'ExportGenerationError';
  }
}

/* ---------------------------------------------------------------------------
 * Content-types por formato
 * ------------------------------------------------------------------------- */

export const FORMAT_CONTENT_TYPE: Record<ExportFormat, string> = {
  'xlsx-client':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'xlsx-internal':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pdf-client':    'application/pdf',
  'pdf-management': 'application/pdf',
  'csv-schedule':  'text/csv; charset=utf-8',
} as const;

/* ---------------------------------------------------------------------------
 * Extensiones por formato
 * ------------------------------------------------------------------------- */

export const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  'xlsx-client':    'xlsx',
  'xlsx-internal':  'xlsx',
  'pdf-client':     'pdf',
  'pdf-management': 'pdf',
  'csv-schedule':   'csv',
} as const;

/* ---------------------------------------------------------------------------
 * Límite de tamaño razonable (10 MB)
 * ------------------------------------------------------------------------- */

export const EXPORT_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
