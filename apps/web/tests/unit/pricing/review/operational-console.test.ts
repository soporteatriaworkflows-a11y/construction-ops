import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(webRoot, rel), 'utf8');
}

const dbRepo = read('server/pricing/review/db-repository.ts');
const types = read('server/pricing/review/types.ts');
const page = read('app/(dashboard)/catalog/prices/review/page.tsx');
const consoleComponent = read('app/(dashboard)/catalog/prices/review/_components/operational-review-console.tsx');
const table = read('app/(dashboard)/catalog/prices/review/_components/review-table.tsx');
const actions = read('app/(dashboard)/catalog/prices/review/actions.ts');

describe('V5.5.1a operational review console read-model', () => {
  it('declares the read-only console contract on the review repository', () => {
    expect(types).toContain('OperationalReviewConsole');
    expect(types).toContain('OperationalReviewItem');
    expect(types).toContain('OperationalReviewSeverity');
    expect(types).toContain('getOperationalReviewConsole');
  });

  it('keeps DB reads org-scoped and RLS-bound without service-role', () => {
    const block = dbRepo.match(/async getOperationalReviewConsole[\s\S]*?^  async getObservationStatuses/m)?.[0] ?? '';
    expect(block).toContain("viewer.organizationId");
    expect(block).toMatch(/\.eq\('organization_id', viewer\.organizationId\)/);
    expect(block).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('uses current tables and not the legacy price model as the primary source', () => {
    expect(dbRepo).toContain("from('resource_price_observations')");
    expect(dbRepo).toContain("from('resources')");
    expect(dbRepo).toContain("from('price_monitor_targets')");
    expect(dbRepo).toContain("from('price_monitor_results')");
    expect(dbRepo).not.toContain("from('price_observations')");
    expect(dbRepo).not.toContain("from('supplier_products')");
  });

  it('covers pending, recent approved/rejected, missing approved, stale, targets and warnings signals', () => {
    for (const token of [
      "eq('status', 'pending')",
      "['approved', 'rejected']",
      'missing_approved_price',
      'stale_price',
      'target_overdue',
      'target_failing',
      'monitor_warning',
      'recent_approved',
      'recent_rejected',
    ]) {
      expect(dbRepo).toContain(token);
    }
  });

  it('derives delta, no previous approved copy, severity and list limits server-side', () => {
    expect(dbRepo).toContain('computeConsoleDelta');
    expect(dbRepo).toContain('previousApproved');
    expect(dbRepo).toContain('Sin precio anterior aprobado');
    expect(dbRepo).toContain('HIGH_DELTA_PCT');
    expect(dbRepo).toContain('severity:');
    expect(dbRepo).toContain('clampLimit');
    expect(dbRepo).toContain('slice(0, cfg.urgent)');
    expect(dbRepo).toContain('slice(0, cfg.coverage)');
    expect(dbRepo).toContain('slice(0, cfg.sourceHealth)');
  });

  it('does not invent exact historical baseline language', () => {
    expect(`${dbRepo}\n${consoleComponent}`).not.toMatch(/baseline historica exacta|hist[oó]rica exacta/i);
    expect(consoleComponent).toContain('Comparacion derivada');
  });
});

describe('V5.5.1a operational review console UI', () => {
  it('renders on /catalog/prices/review before the existing review table', () => {
    expect(page).toContain('getOperationalReviewConsole');
    expect(page.indexOf('OperationalReviewConsole')).toBeLessThan(page.indexOf('ReviewTable'));
    expect(page).toContain('REVIEW_ROLES.includes(viewerRole)');
  });

  it('keeps the route internal and does not serialize data for client roles', () => {
    expect(page).toContain("REVIEW_ROLES = ['management', 'internal']");
    expect(page).toContain('Acceso restringido');
    expect(page).toContain('solo roles autorizados cargan datos');
  });

  it('shows KPI labels, three MVP lists, filters and clear action', () => {
    for (const text of [
      'Consola operativa',
      'Pendientes',
      'Con warnings',
      'Del monitor',
      'Sin approved',
      'Stale',
      'Fuentes con alerta',
      'Revision urgente',
      'Cobertura de catalogo',
      'Salud de fuentes',
      'Severidad',
      'Proveedor',
      'Recurso',
      'Limpiar filtros',
    ]) {
      expect(consoleComponent).toContain(text);
    }
  });

  it('uses only read-only navigation CTAs from the console', () => {
    expect(consoleComponent).toContain('Link href={item.href}');
    expect(consoleComponent).not.toContain('bulkApproveAction');
    expect(consoleComponent).not.toContain('bulkRejectAction');
    expect(consoleComponent).not.toContain('Confirmar aprobacion');
  });

  it('does not touch the existing approval/rejection workflow surface', () => {
    expect(table).toContain('bulkApproveAction');
    expect(table).toContain('bulkRejectAction');
    expect(actions).toContain('bulkApproveObservations');
    expect(actions).toContain('bulkRejectObservations');
    expect(consoleComponent).not.toContain("status: 'approved'");
    expect(consoleComponent).not.toContain("status: 'rejected'");
  });
});