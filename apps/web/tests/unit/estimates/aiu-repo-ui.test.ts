/**
 * aiu-repo-ui.test.ts — Repositorio fixture de AIU + guardas de fuente de la UI (4D.2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getEstimatesWriteRepository, AiuWriteNotSupportedError } from '@/server/estimates';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const writer: AuthenticatedViewer = { userId: 'u', profileId: 'p', organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const repo = () => getEstimatesWriteRepository({ env: { READ_MODEL_SOURCE: 'fixture' } });

describe('AIU — repositorio fixture', () => {
  it('getEstimateVersionAiu demo ⇒ vacío y no editable', async () => {
    const aiu = await repo().getEstimateVersionAiu(reader, DEMO_ESTIMATE_ID);
    expect(aiu.isEmpty).toBe(true);
    expect(aiu.editable).toBe(false);
  });
  it('calculateEstimateFinancialSummary demo ⇒ total general = costo directo (sin AIU)', async () => {
    const s = await repo().calculateEstimateFinancialSummary(reader, DEMO_ESTIMATE_ID);
    expect(s.grandTotal).toBe(s.directTotal);
    expect(Math.abs(Number(s.directTotal) - 336084479.93690735)).toBeLessThan(1);
  });
  it('updateEstimateVersionAiu en fixture ⇒ AiuWriteNotSupportedError', async () => {
    await expect(
      repo().updateEstimateVersionAiu(writer, DEMO_ESTIMATE_ID, { administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' }),
    ).rejects.toBeInstanceOf(AiuWriteNotSupportedError);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(here, '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]');
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');

describe('AIU — UI/action (fuente)', () => {
  it('action: solo 4 porcentajes del navegador; viewer + guard server-side', () => {
    const src = read('aiu-actions.ts');
    expect(src).toMatch(/^'use server';/m);
    expect(src).toMatch(/isCreationModeEnabled\(\)/);
    expect(src).toMatch(/resolveAuthenticatedViewer\(\)/);
    expect(src).toMatch(/administrationRate/);
    expect(src).toMatch(/updateEstimateVersionAiu\(/);
    expect(src).not.toMatch(/formData\.get\('directTotal'\)/);
    expect(src).not.toMatch(/formData\.get\('grandTotal'\)/);
  });
  it('form: preview client-side + Guardar ajustes + "AIU ajustable por versión" + read-only', () => {
    const src = read('aiu-form.tsx');
    expect(src).toMatch(/^'use client';/m);
    expect(src).toMatch(/Guardar ajustes/);
    expect(src).toMatch(/AIU ajustable por versión/);
    expect(src).toMatch(/Total general/);
    expect(src).toMatch(/aiu\.editable/);
  });
  it('detalle: sección AIU cargada server-side (getEstimateVersionAiu + summary)', () => {
    const src = read('page.tsx');
    expect(src).toMatch(/getEstimateVersionAiu\(/);
    expect(src).toMatch(/calculateEstimateFinancialSummary\(/);
    expect(src).toMatch(/AIU y costos indirectos/);
  });
});
