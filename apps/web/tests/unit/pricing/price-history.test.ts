import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FixtureObservationRepository } from '@/server/pricing/fixture-repository';
import type { AuthenticatedViewer } from '@/server/pricing/types';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../..');

function read(rel: string): string {
  return readFileSync(resolve(webRoot, rel), 'utf8');
}

const viewer: AuthenticatedViewer = {
  userId: 'demo-user',
  profileId: 'demo-profile',
  organizationId: '00000000-0000-0000-0000-0000000000a1',
  role: 'internal',
};

const resourceId = '00000000-0000-0000-0000-0000000000e1';

describe('V5.4.4a price history repository', () => {
  it('lista historico por recurso con limite y sin datos fake para recurso inexistente', async () => {
    const repo = new FixtureObservationRepository();
    await expect(repo.listResourcePriceHistory(viewer, resourceId, 2)).resolves.toHaveLength(2);
    await expect(repo.listResourcePriceHistory(viewer, 'missing-resource', 25)).resolves.toEqual([]);
  });

  it('mantiene aislamiento por organizacion en fixture', async () => {
    const repo = new FixtureObservationRepository();
    const rows = await repo.listResourcePriceHistory({ ...viewer, organizationId: 'other-org' }, resourceId, 25);
    expect(rows).toEqual([]);
  });

  it('calcula previous approved price y delta absoluto/porcentual en servidor', async () => {
    const repo = new FixtureObservationRepository();
    const rows = await repo.listResourcePriceHistory(viewer, resourceId, 25);
    const monitor = rows.find((row) => row.origin === 'monitor')!;
    expect(monitor.previousApprovedPrice).toBe('25760.0000000000');
    expect(monitor.deltaAbs).toBe('3740.00');
    expect(monitor.deltaPct).toBe('14.52');

    const firstApproved = rows.find((row) => row.id === '00000000-0000-0000-0000-000000001001')!;
    expect(firstApproved.previousApprovedPrice).toBeNull();
    expect(firstApproved.deltaAbs).toBeNull();
    expect(firstApproved.deltaPct).toBeNull();
  });

  it('detecta origen monitor, lote y manual con datos asociados existentes', async () => {
    const repo = new FixtureObservationRepository();
    const rows = await repo.listResourcePriceHistory(viewer, resourceId, 25);
    expect(rows.some((row) => row.origin === 'monitor' && row.monitorResultId && row.monitorWarnings.includes('price_changed'))).toBe(true);
    expect(rows.some((row) => row.origin === 'batch' && row.importBatchLabel === 'Lista junio Cemex')).toBe(true);
    expect(rows.some((row) => row.origin === 'manual' && row.sourceType === 'manual')).toBe(true);
  });

  it('cubre rejected reason, approved_at, expired y observacion sin proveedor', async () => {
    const repo = new FixtureObservationRepository();
    const rows = await repo.listResourcePriceHistory(viewer, resourceId, 25);
    expect(rows.some((row) => row.status === 'rejected' && row.rejectionReason === null)).toBe(true);
    expect(rows.some((row) => row.status === 'approved' && row.approvedAt)).toBe(true);
    expect(rows.some((row) => row.status === 'expired')).toBe(true);
    expect(rows.some((row) => row.supplierName === null)).toBe(true);
  });
});

describe('V5.4.4a source-scan invariants', () => {
  const dbRepo = read('server/pricing/db-observation-repository.ts');
  const page = read('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/page.tsx');
  const table = read('app/(dashboard)/catalog/resources/[resourceId]/price-intelligence/_components/price-history-table.tsx');

  it('db repository lee resource_price_observations org-scoped y por resource_id', () => {
    const method = dbRepo.slice(dbRepo.indexOf('async listResourcePriceHistory'), dbRepo.indexOf('async createResourcePriceObservation'));
    expect(method).toContain(".from('resource_price_observations')");
    expect(method).toContain(".eq('organization_id', viewer.organizationId)");
    expect(method).toContain(".eq('resource_id', resourceId)");
    expect(method).toContain(".from('price_monitor_results')");
    expect(method).toContain(".in('observation_id', observationIds)");
  });

  it('no usa modelo legacy como fuente principal', () => {
    const method = dbRepo.slice(dbRepo.indexOf('async listResourcePriceHistory'), dbRepo.indexOf('async createResourcePriceObservation'));
    expect(method).not.toContain(".from('price_observations')");
    expect(method).not.toContain(".from('supplier_products')");
  });

  it('page mantiene secciones previas y limita a 25 observaciones', () => {
    expect(page).toContain('PRICE_HISTORY_LIMIT = 25');
    expect(page).toContain('listResourcePriceHistory');
    expect(page).toContain('<MonitoringSection');
    expect(page).toContain('<ObservationForm');
    expect(page).toContain('<UrlValidationPanel');
    expect(page).toContain('Mostrando las ultimas 25 observaciones');
  });

  it('privacidad client-side: sanitiza antes de pasar filas al componente client', () => {
    expect(page).toContain('redactHistoryRows');
    expect(page).toContain('showInternalFields ? historyRows : redactHistoryRows(historyRows)');
    expect(page).toContain('monitorWarnings: []');
    expect(page).toContain('sourceReference: null');
    expect(page).toContain('suggestedNetPrice: null');
  });

  it('UI cubre filtros, estados vacios y comparacion derivada literal', () => {
    expect(table).toContain("'use client'");
    expect(table).toContain('FilterPills');
    expect(table).toContain('Limpiar filtros');
    expect(table).toContain('Ningún registro coincide con los filtros');
    expect(table).toContain('Sin proveedor');
    expect(table).toContain('Sin fuente registrada');
    expect(table).toContain('Sin precio anterior aprobado para comparar');
    expect(table).toContain('Rechazada (sin motivo registrado)');
    expect(table).toContain('Sin alertas del monitor');
    expect(table).toContain('Comparación derivada (referencial no es baseline histórica exacta)');
    expect(table).not.toContain('precio base usado por la corrida');
  });

  it('filtros MVP existen para estado, origen y proveedor', () => {
    expect(table).toContain('STATUS_OPTIONS');
    expect(table).toContain('ORIGIN_OPTIONS');
    expect(table).toContain('supplierOptions');
    expect(table).toContain("row.status !== status");
    expect(table).toContain("row.origin !== origin");
    expect(table).toContain("row.supplierName !== supplier");
  });
});