/**
 * route.ts — Route handler GET /api/exports
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §4`.
 *
 * Query params:
 *   - `format` (requerido): ExportFormat
 *   - `profile` (requerido): ExportProfile
 *   - `projectId` (requerido): UUID del proyecto
 *   - `estimateVersionId` (opcional): UUID de la versión de presupuesto
 *   - `includeSchedule` (opcional): 'true'|'false'
 *
 * REGLAS:
 *  - Valida perfil×formato antes de generar.
 *  - Devuelve el archivo con Content-Type correcto y Content-Disposition: attachment.
 *  - Errores explícitos sin stack técnico (JSON {error: string}).
 *  - Nombre de archivo sanitizado.
 *  - Generación en memoria; sin temporales en disco.
 */

import type { NextRequest } from 'next/server';
import { getReadModel, getDemoViewer } from '@/server/read-model';
import { createExportService } from '@/server/exports/export-service';
import {
  ExportProfileFormatMismatchError,
  ExportSizeLimitError,
  ExportGenerationError,
} from '@/modules/exports/types';
import type { ExportFormat, ExportProfile } from '@/modules/exports/types';
import { FORMAT_PROFILE_COMPAT, FORMAT_CONTENT_TYPE } from '@/modules/exports/types';
import { resolveAuthMode } from '@/lib/supabase/env';
import { resolveAuthenticatedViewer, isSameOrLessPrivileged } from '@/server/auth';

const VALID_FORMATS = Object.keys(FORMAT_PROFILE_COMPAT) as ExportFormat[];
const VALID_PROFILES = ['client', 'site', 'management', 'internal'] as ExportProfile[];

function isValidFormat(v: string): v is ExportFormat {
  return VALID_FORMATS.includes(v as ExportFormat);
}

function isValidProfile(v: string): v is ExportProfile {
  return VALID_PROFILES.includes(v as ExportProfile);
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl;
  const format = url.searchParams.get('format') ?? '';
  const profile = url.searchParams.get('profile') ?? '';
  const projectId = url.searchParams.get('projectId') ?? '';
  const estimateVersionId = url.searchParams.get('estimateVersionId') ?? undefined;
  const includeSchedule = url.searchParams.get('includeSchedule') === 'true';

  // Validación de parámetros
  if (!format) {
    return errorResponse(400, 'Parámetro "format" requerido.');
  }
  if (!isValidFormat(format)) {
    return errorResponse(400, `Formato no válido: "${format}". Valores permitidos: ${VALID_FORMATS.join(', ')}.`);
  }
  if (!profile) {
    return errorResponse(400, 'Parámetro "profile" requerido.');
  }
  if (!isValidProfile(profile)) {
    return errorResponse(400, `Perfil no válido: "${profile}". Valores permitidos: ${VALID_PROFILES.join(', ')}.`);
  }
  if (!projectId) {
    return errorResponse(400, 'Parámetro "projectId" requerido.');
  }

  // --- Guard de autenticación (AUTH_RUNTIME_CONTRACT §8) ---
  // Modo demo: fixture sanitizado, sin sesión. Modo supabase: exige viewer
  // autenticado y NO permite escalamiento de perfil por query param.
  const mode = resolveAuthMode();
  let requestedBy = '00000000-0000-4000-8000-000000000000';
  if (mode === 'supabase') {
    let viewer;
    try {
      viewer = await resolveAuthenticatedViewer();
    } catch {
      return errorResponse(401, 'Sesión requerida.');
    }
    // Anti-escalamiento: el perfil solicitado debe ser igual o menos
    // privilegiado que el ViewerRole autenticado (deny-by-default).
    if (!isSameOrLessPrivileged(profile, viewer.role)) {
      return errorResponse(403, 'Perfil no autorizado para la sesión actual.');
    }
    requestedBy = viewer.userId;
  }

  // Construir el servicio de exportación
  const readModel = getReadModel({ env: process.env });
  const exportService = createExportService(readModel);

  const requestedAt = new Date().toISOString();

  try {
    const result = await exportService.generate({
      profile,
      format,
      projectId,
      estimateVersionId: estimateVersionId || undefined,
      includeSchedule,
      requestedBy,
      requestedAt,
    });

    // `Uint8Array<ArrayBuffer>` es un BodyInit válido; se reconstruye la vista
    // sobre un ArrayBuffer para satisfacer el tipado de `Response` (lib.dom).
    const body = new Uint8Array(result.buffer);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Content-Length': String(result.sizeBytes),
        'X-Export-Profile': result.profile,
        'X-Generated-At': result.generatedAt,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof ExportProfileFormatMismatchError) {
      return errorResponse(400, err.message);
    }
    if (err instanceof ExportSizeLimitError) {
      return errorResponse(413, 'La exportación supera el tamaño máximo permitido.');
    }
    if (err instanceof ExportGenerationError) {
      return errorResponse(500, err.message);
    }
    // Error inesperado — sin stack técnico
    return errorResponse(500, 'Error interno al procesar la exportación.');
  }
}
