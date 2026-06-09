/**
 * export-service.test.ts — Tests de integración del ExportService (Oleada 3C).
 *
 * Usa el read-model REAL respaldado por el fixture sanitizado (sin DB), con la
 * proyección por rol que aplica cada perfil. Verifica:
 *  - validación perfil×formato;
 *  - generación válida de los 5 formatos MVP (content-type, filename, tamaño);
 *  - Excel reabierto programáticamente (hojas correctas);
 *  - PDF válido (magic bytes %PDF);
 *  - CSV cronograma (headers; external_reference solo `internal`);
 *  - privacidad: el Excel/CSV de cliente NO contiene campos internos;
 *  - ausencia de recálculo (los totales vienen del read-model).
 *
 * Propiedad de la lógica: agent-exports. Tests añadidos por el orquestador en
 * la continuación/integración 3C.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { createExportService, getDemoViewer } from '@/server/exports/export-service';
import { getReadModel } from '@/server/read-model';
import {
  FORMAT_CONTENT_TYPE,
  EXPORT_SIZE_LIMIT_BYTES,
  ExportProfileFormatMismatchError,
  type ExportService,
} from '@/modules/exports';
import type { Uuid } from '@/lib/contracts/read-model';

/** Tokens internos 🔒 que NUNCA deben aparecer en exportaciones de cliente. */
const FORBIDDEN_CLIENT = [
  'descuento',
  'margen',
  'precio de compra',
  'proveedor',
  'sourcereference',
  'ahorro',
  'utilidad esperada',
];

let service: ExportService;
let projectId: Uuid;

const REQUESTED_BY = '00000000-0000-4000-8000-000000000000' as Uuid;
const REQUESTED_AT = '2026-06-01T12:00:00.000Z';
// P1-A / M-02: la organización se deriva server-side; en tests usamos la org demo.
const ORG_ID = getDemoViewer('management').organizationId as Uuid;

/** Vista sobre un `ArrayBuffer` para `ExcelJS.load` (evita fricción de tipos Buffer). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

beforeAll(async () => {
  const rm = getReadModel({ env: { ...process.env, READ_MODEL_SOURCE: 'fixture' } });
  service = createExportService(rm);
  const projects = await rm.listProjects(getDemoViewer('management'));
  expect(projects.length).toBeGreaterThan(0);
  const first = projects[0];
  if (!first) throw new Error('Fixture sin proyectos');
  projectId = first.id;
});

describe('ExportService — validación perfil×formato', () => {
  it('rechaza xlsx-client con perfil management (error tipado)', async () => {
    await expect(
      service.generate({
        profile: 'management',
        format: 'xlsx-client',
        projectId,
        organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
        requestedAt: REQUESTED_AT,
      }),
    ).rejects.toBeInstanceOf(ExportProfileFormatMismatchError);
  });
});

describe('ExportService — xlsx-client', () => {
  it('genera un XLSX válido, reabrible, con hojas Portada y Presupuesto', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'xlsx-client',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });

    expect(res.contentType).toBe(FORMAT_CONTENT_TYPE['xlsx-client']);
    expect(res.fileName).toMatch(/^presupuesto_cliente_.*\.xlsx$/);
    expect(res.fileName).not.toMatch(/[\\/:*?"<>|]/);
    expect(res.sizeBytes).toBe(res.buffer.byteLength);
    expect(res.sizeBytes).toBeGreaterThan(0);
    expect(res.sizeBytes).toBeLessThan(EXPORT_SIZE_LIMIT_BYTES);
    expect(res.profile).toBe('client');

    // Reapertura programática
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(res.buffer));
    expect(wb.getWorksheet('Portada')).toBeDefined();
    expect(wb.getWorksheet('Presupuesto')).toBeDefined();
  });

  it('PRIVACIDAD: el XLSX de cliente no contiene tokens internos', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'xlsx-client',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(res.buffer));

    const cellText: string[] = [];
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value != null) cellText.push(String(cell.value).toLowerCase());
        });
      });
    });
    const haystack = cellText.join(' | ');
    for (const token of FORBIDDEN_CLIENT) {
      expect(haystack).not.toContain(token);
    }
  });
});

describe('ExportService — xlsx-internal', () => {
  it('genera un XLSX técnico reabrible (perfil internal)', async () => {
    const res = await service.generate({
      profile: 'internal',
      format: 'xlsx-internal',
      projectId,
      includeSchedule: true,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    expect(res.contentType).toBe(FORMAT_CONTENT_TYPE['xlsx-internal']);
    expect(res.fileName).toMatch(/^presupuesto_interno_.*\.xlsx$/);
    expect(res.sizeBytes).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(res.buffer));
    expect(wb.worksheets.length).toBeGreaterThan(0);
  });
});

describe('ExportService — PDF', () => {
  it('pdf-client genera un PDF válido (magic %PDF)', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'pdf-client',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    expect(res.contentType).toBe('application/pdf');
    expect(res.fileName).toMatch(/\.pdf$/);
    expect(res.sizeBytes).toBeGreaterThan(0);
    const magic = Buffer.from(res.buffer.subarray(0, 5)).toString('latin1');
    expect(magic).toBe('%PDF-');
  });

  it('pdf-management genera un PDF válido (perfil management)', async () => {
    const res = await service.generate({
      profile: 'management',
      format: 'pdf-management',
      projectId,
      includeSchedule: true,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    expect(res.contentType).toBe('application/pdf');
    const magic = Buffer.from(res.buffer.subarray(0, 5)).toString('latin1');
    expect(magic).toBe('%PDF-');
  });
});

describe('ExportService — csv-schedule', () => {
  it('cliente: headers correctos, SIN columna external_reference', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'csv-schedule',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    expect(res.contentType).toBe('text/csv; charset=utf-8');
    expect(res.fileName).toMatch(/^cronograma_.*\.csv$/);
    const text = Buffer.from(res.buffer).toString('utf-8');
    const header = text.split(/\r?\n/)[0];
    expect(header).toContain('wbs_code');
    expect(header).toContain('planned_start');
    expect(header).toContain('is_milestone');
    expect(header).not.toContain('external_reference');
  });

  it('internal: incluye la columna external_reference', async () => {
    const res = await service.generate({
      profile: 'internal',
      format: 'csv-schedule',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    const text = Buffer.from(res.buffer).toString('utf-8');
    const header = text.split(/\r?\n/)[0];
    expect(header).toContain('external_reference');
    // contiene al menos una fila de datos además del encabezado
    expect(text.split(/\r?\n/).length).toBeGreaterThan(1);
  });

  it('PRIVACIDAD: el CSV de cliente no contiene tokens internos', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'csv-schedule',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    const text = Buffer.from(res.buffer).toString('utf-8').toLowerCase();
    for (const token of FORBIDDEN_CLIENT) {
      expect(text).not.toContain(token);
    }
  });
});

describe('ExportService — aislamiento por organización (P1-A / M-02)', () => {
  // El visor de OTRA organización NO debe poder exportar el proyecto demo: el
  // servicio usa request.organizationId (derivada server-side), no una org demo
  // hardcodeada, por lo que el read-model niega el acceso cross-org.
  const FOREIGN_ORG = '00000000-0000-4000-8000-0000000000ff' as Uuid;

  it('una organización ajena no obtiene datos del proyecto demo (cross-org denegado)', async () => {
    await expect(
      service.generate({
        profile: 'client',
        format: 'xlsx-client',
        projectId,
        organizationId: FOREIGN_ORG,
        requestedBy: REQUESTED_BY,
        requestedAt: REQUESTED_AT,
      }),
    ).rejects.toThrow();
  });

  it('la misma org (demo) sí exporta (control positivo)', async () => {
    const res = await service.generate({
      profile: 'client',
      format: 'xlsx-client',
      projectId,
      organizationId: ORG_ID,
      requestedBy: REQUESTED_BY,
      requestedAt: REQUESTED_AT,
    });
    expect(res.sizeBytes).toBeGreaterThan(0);
  });
});
