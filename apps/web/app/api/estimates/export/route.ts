/**
 * route.ts — GET /api/estimates/export (4E.1).
 *
 * Descarga protegida del presupuesto real a Excel/PDF, generada server-side
 * desde los datos persistidos (no del Excel original).
 * Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §7,§8`.
 *
 * Query:
 *   - format (req): 'xlsx' | 'pdf'
 *   - estimateId (req): UUID del presupuesto
 *   - projectId (req): UUID del proyecto (validación de cadena)
 *   - scopeId (req): UUID del alcance (validación de cadena)
 *   - kind (opt): 'budget' (def.) | 'apu' | 'package' (APU_EXPORTS_V1)
 *
 * Reglas: viewer requerido (sin sesión ⇒ 401 en modo supabase); cadena
 * proyecto/alcance/presupuesto validada; cross-org ⇒ 404 (RLS); cliente
 * RLS-bound (sin credenciales de servicio); en memoria; filename sanitizado;
 * Cache-Control no-store.
 */
import type { NextRequest } from 'next/server';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import {
  getEstimatesWriteRepository,
  EstimateNotFoundError,
} from '@/server/estimates';
import {
  generateEstimateExcelExport,
  generateEstimatePdfExport,
  EstimateExportSizeError,
} from '@/server/estimates/export';
import { generateApuExport } from '@/server/estimates/export/apu-annex';
import type { EstimateExportFormat } from '@/lib/estimates/export-types';
import type { ExportKind } from '@/lib/estimates/apu-export-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function isFormat(v: string): v is EstimateExportFormat {
  return v === 'xlsx' || v === 'pdf';
}

function isKind(v: string): v is ExportKind {
  return v === 'budget' || v === 'apu' || v === 'package';
}

export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;
  const format = sp.get('format') ?? '';
  const estimateId = sp.get('estimateId') ?? '';
  const projectId = sp.get('projectId') ?? '';
  const scopeId = sp.get('scopeId') ?? '';
  const kindParam = sp.get('kind') ?? 'budget';

  if (!format) return err(400, 'Parámetro "format" requerido.');
  if (!isFormat(format)) return err(400, 'Formato no válido. Use "xlsx" o "pdf".');
  if (!isKind(kindParam)) return err(400, 'Tipo de export no válido.');
  if (!estimateId) return err(400, 'Parámetro "estimateId" requerido.');
  if (!projectId) return err(400, 'Parámetro "projectId" requerido.');
  if (!scopeId) return err(400, 'Parámetro "scopeId" requerido.');
  const kind = kindParam;

  // Viewer requerido (demo → fixture; supabase → sesión válida).
  let viewer;
  try {
    viewer = await resolveViewer();
  } catch {
    return err(401, 'Sesión requerida.');
  }

  // Validación de cadena proyecto/alcance/presupuesto (RLS ⇒ cross-org NotFound).
  try {
    const estimate = await getEstimatesWriteRepository().getEstimateById(viewer, estimateId);
    if (estimate.projectScopeId !== scopeId || (estimate.projectId ?? '') !== projectId) {
      return err(404, 'Presupuesto no encontrado.');
    }
  } catch (e) {
    if (e instanceof EstimateNotFoundError) return err(404, 'Presupuesto no encontrado.');
    return err(404, 'Presupuesto no encontrado.');
  }

  try {
    const result =
      kind === 'budget'
        ? format === 'xlsx'
          ? await generateEstimateExcelExport(viewer, estimateId)
          : await generateEstimatePdfExport(viewer, estimateId)
        : await generateApuExport(viewer, estimateId, kind, format);

    const body = new Uint8Array(result.buffer);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Content-Length': String(result.sizeBytes),
        'X-Export-Format': format,
        'X-Generated-At': result.generatedAt,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof EstimateNotFoundError) return err(404, 'Presupuesto no encontrado.');
    if (e instanceof EstimateExportSizeError) {
      return err(413, 'La exportación supera el tamaño máximo permitido.');
    }
    return err(500, 'Error interno al generar la exportación.');
  }
}
