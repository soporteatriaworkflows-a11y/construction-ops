/**
 * export-service.ts — Implementación de `ExportService` (server-side).
 *
 * Propiedad: agent-exports. Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §4`.
 *
 * REGLAS:
 *  - Recibe `ReadModelPort` (inyectado); NO accede a tablas crudas.
 *  - Proyección por `profile` ANTES de generar el archivo (vía `ViewerContext`).
 *  - No recalcula finanzas. No usa float para dinero.
 *  - Genera archivo en memoria; sin temporales sensibles en disco.
 *  - Validación perfil×formato ANTES de consultar el read-model.
 *  - Errores tipados; sin stack técnico al consumidor.
 *  - Trazabilidad: log de requestedBy/requestedAt/profile/format sin datos sensibles.
 *  - Límite de tamaño razonable (EXPORT_SIZE_LIMIT_BYTES).
 */

import type { ReadModelPort, ViewerRole } from '@/lib/contracts/read-model';
import type {
  ExportRequest,
  ExportResult,
  ExportService,
} from '@/modules/exports/types';
import {
  EXPORT_SIZE_LIMIT_BYTES,
  ExportGenerationError,
  ExportSizeLimitError,
  FORMAT_CONTENT_TYPE,
} from '@/modules/exports/types';
import { validateProfileFormat } from '@/modules/exports/profile-validator';
import { buildFileName } from '@/modules/exports/filename';
import {
  generateXlsxClient,
  generateXlsxInternal,
  generatePdfClient,
  generatePdfManagement,
  generateCsvSchedule,
} from '@/modules/exports/generators';
import { DEMO_ORGANIZATION_ID, getDemoViewer } from '@/server/read-model';

/** Logger inyectable para trazabilidad (sin datos sensibles). */
export interface ExportLogger {
  info(message: string): void;
  error(message: string): void;
}

const defaultLogger: ExportLogger = {
  info: (m) => console.info(m),
  error: (m) => console.error(m),
};

/**
 * Implementación concreta del `ExportService`.
 *
 * Consume el `ReadModelPort` con el `ViewerContext` del perfil solicitado.
 * Toda la proyección ocurre en el read-model antes de serializar.
 */
export class ExportServiceImpl implements ExportService {
  constructor(
    private readonly readModel: ReadModelPort,
    private readonly logger: ExportLogger = defaultLogger,
  ) {}

  async generate(request: ExportRequest): Promise<ExportResult> {
    // 1. Validar combinación perfil×formato (antes de cualquier consulta)
    validateProfileFormat(request.profile, request.format);

    // 2. Log de trazabilidad (sin datos sensibles ni stack)
    this.logger.info(
      `[export] start profile=${request.profile} format=${request.format} ` +
      `requestedAt=${request.requestedAt} requestedBy=<redacted>`,
    );

    // 3. Construir ViewerContext para el perfil.
    // P1-A / M-02: la organización se deriva SERVER-SIDE de la sesión autenticada
    // (request.organizationId), NUNCA hardcodeada a la org demo ni recibida del
    // navegador. En modo demo el route pasa DEMO_ORGANIZATION_ID explícitamente.
    const viewerRole: ViewerRole = request.profile;
    // V5.6.4: `projectGrants` viene del usuario AUTENTICADO (route handler),
    // no del perfil solicitado. Si falta y el perfil es `client`, el read-model
    // queda fail-closed (0 proyectos) — nunca fail-open.
    const viewer = {
      organizationId: request.organizationId,
      role: viewerRole,
      projectGrants: request.projectGrants,
    };

    const now = new Date().toISOString();

    try {
      // 4. Consultar el read-model proyectado por rol
      const [overview, scheduleResult] = await Promise.all([
        this.readModel.getProjectOverview(viewer, request.projectId),
        request.includeSchedule || request.format === 'csv-schedule' || request.format === 'xlsx-internal'
          ? this.readModel.getSchedule(viewer, request.projectId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const estimateDetail = await this.readModel.getEstimateDetail(
        viewer,
        request.estimateVersionId ?? overview.budgetSummary.versionId,
      );

      const dashboardResult =
        (request.format === 'pdf-management')
          ? await this.readModel.getDashboardSummary(viewer, request.projectId).catch(() => null)
          : null;

      // 5. Generar buffer en memoria
      let buffer: Uint8Array;
      const projectName = overview.project.name;

      switch (request.format) {
        case 'xlsx-client':
          buffer = await generateXlsxClient({
            projectName,
            projectLocation: overview.project.location,
            estimate: estimateDetail.estimate,
            chapters: estimateDetail.chapters,
            items: estimateDetail.items,
            generatedAt: now,
          });
          break;

        case 'xlsx-internal':
          buffer = await generateXlsxInternal({
            projectName,
            projectLocation: overview.project.location,
            estimate: estimateDetail.estimate,
            chapters: estimateDetail.chapters,
            items: estimateDetail.items,
            schedule: scheduleResult ?? undefined,
            generatedAt: now,
          });
          break;

        case 'pdf-client':
          buffer = await generatePdfClient({
            projectName,
            projectLocation: overview.project.location,
            estimate: estimateDetail.estimate,
            chapters: estimateDetail.chapters,
            generatedAt: now,
          });
          break;

        case 'pdf-management':
          buffer = await generatePdfManagement({
            projectName,
            projectLocation: overview.project.location,
            estimate: estimateDetail.estimate,
            chapters: estimateDetail.chapters,
            dashboard: dashboardResult ?? undefined,
            schedule: scheduleResult ?? undefined,
            generatedAt: now,
          });
          break;

        case 'csv-schedule': {
          if (!scheduleResult) {
            throw new ExportGenerationError(
              request.format,
              'No hay datos de cronograma disponibles para este proyecto.',
            );
          }
          buffer = generateCsvSchedule({
            schedule: scheduleResult,
            profile: request.profile,
          });
          break;
        }

        default: {
          // TypeScript narrowing exhaustivo
          const _exhaustive: never = request.format;
          throw new ExportGenerationError(
            request.format as string as typeof request.format,
            `Formato desconocido: ${_exhaustive}`,
          );
        }
      }

      // 6. Verificar tamaño
      if (buffer.byteLength > EXPORT_SIZE_LIMIT_BYTES) {
        throw new ExportSizeLimitError(buffer.byteLength, EXPORT_SIZE_LIMIT_BYTES);
      }

      // 7. Construir resultado
      const fileName = buildFileName(request.format, projectName, now);
      const result: ExportResult = {
        fileName,
        contentType: FORMAT_CONTENT_TYPE[request.format],
        buffer,
        sizeBytes: buffer.byteLength,
        generatedAt: now,
        profile: request.profile,
      };

      this.logger.info(
        `[export] done format=${request.format} file=${fileName} size=${result.sizeBytes}`,
      );

      return result;
    } catch (err) {
      // Re-lanzar errores tipados sin stack técnico
      if (
        err instanceof ExportGenerationError ||
        err instanceof ExportSizeLimitError
      ) {
        this.logger.error(`[export] error=${err.name} message=${err.message}`);
        throw err;
      }
      // Envolver errores inesperados sin exponer detalles técnicos
      const message =
        err instanceof Error ? err.message.substring(0, 200) : 'Error desconocido';
      this.logger.error(`[export] unexpected error=${message}`);
      throw new ExportGenerationError(request.format, 'Error interno al generar la exportación.');
    }
  }
}

/**
 * Factory para crear el `ExportService` con las dependencias correctas.
 */
export function createExportService(
  readModel: ReadModelPort,
  logger?: ExportLogger,
): ExportService {
  return new ExportServiceImpl(readModel, logger);
}

// Exportar getDemoViewer para uso en tests y route handlers
export { getDemoViewer, DEMO_ORGANIZATION_ID };
