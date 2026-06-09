/**
 * mvp-internal-flow-smoke.test.ts — Smoke END-TO-END del MVP interno (cierre).
 *
 * Recorre, sobre UN MISMO estimate sintético local, el ciclo completo:
 * crear → importar BOQ → editar → archive/restore → emitir → clonar → editar V02
 * → comparar V01 vs V02 → seguridad cross-org → no-destrucción.
 *
 * Repositorio REAL (`DbEstimatesWriteRepository`) vía PostgREST con RLS (JWT de
 * usuario sembrado). 100% local; jamás toca ENTRE PATIOS ni producción.
 * Gated por `BOQ_SMOKE_DB=1`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DbEstimatesWriteRepository } from '@/server/estimates/db-repository';
import {
  BoqVersionLockedError,
  AiuVersionLockedError,
  EstimateNotFoundError,
  VersionNotDraftError,
} from '@/server/estimates';
import type { AuthenticatedViewer } from '@/server/auth/types';

const RUN = process.env.BOQ_SMOKE_DB === '1';
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const APIKEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.LOCAL_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const USER_A = '00000000-0000-0000-0000-0000000000b1';
const SCOPE_A = '00000000-0000-0000-0000-0000000000d1';
const ORG_B = '00000000-0000-0000-0000-0000000000a2';
const USER_B = '00000000-0000-0000-0000-0000000000b7';

function b64url(buf: crypto.BinaryLike) {
  return Buffer.from(buf as Buffer).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintJwt(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
function clientFor(sub: string): SupabaseClient {
  return createClient(URL, APIKEY, {
    global: { headers: { Authorization: `Bearer ${mintJwt(sub)}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const viewerA: AuthenticatedViewer = { userId: USER_A, profileId: USER_A, organizationId: ORG_A, role: 'management' };
const viewerB: AuthenticatedViewer = { userId: USER_B, profileId: USER_B, organizationId: ORG_B, role: 'management' };
const dec = (v: unknown) => new Decimal(v as Decimal.Value).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed();

describe.skipIf(!RUN)('MVP interno — flujo end-to-end (repo real + RLS local)', () => {
  const clientA = () => clientFor(USER_A);
  const repoA = new DbEstimatesWriteRepository(async () => clientA());
  const repoB = new DbEstimatesWriteRepository(async () => clientFor(USER_B));

  let estimateId: string;
  let v1Id: string;
  let v2Id: string;
  let ch11: string;
  let ch12: string;
  let it1101: string; // 1000
  let it1102: string; // 1000

  beforeAll(async () => {
    // A. Crear presupuesto + V01 draft.
    const est = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `MVP ${Date.now()}` });
    estimateId = est.id;
    v1Id = est.activeVersion!.id;
    // B. Cargar BOQ.
    await clientA().rpc('import_boq_into_version', {
      p_version_id: v1Id,
      p_chapters: [
        { code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 },
        { code: '12', name: 'Cimentación', sortOrder: 1 },
      ],
      p_items: [
        { chapterCode: '11', code: '11.01', description: 'A', unit: 'm3', quantity: '10', unitPrice: '100', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
        { chapterCode: '11', code: '11.02', description: 'B', unit: 'm3', quantity: '5', unitPrice: '200', sortOrder: 1 },
        { chapterCode: '12', code: '12.01', description: 'C', unit: 'un', quantity: '2', unitPrice: '50', sortOrder: 0 },
      ],
    });
    await repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' });
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    ch11 = chs.find((c) => c.code === '11')!.id;
    ch12 = chs.find((c) => c.code === '12')!.id;
    const its = await repoA.listItemsByChapter(viewerA, ch11);
    it1101 = its.find((i) => i.code === '11.01')!.id;
    it1102 = its.find((i) => i.code === '11.02')!.id;
  });

  it('B — costo directo inicial = 2100 y total general > directo (AIU aplicada)', async () => {
    const fin = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(dec(fin.directTotal)).toBe('2100');
    expect(new Decimal(fin.grandTotal).greaterThan(fin.directTotal)).toBe(true);
  });

  it('C — editar cantidad/precio recalcula; subtotal arbitrario del cliente no prevalece; crear manual', async () => {
    const r1 = await repoA.updateBoqItem(viewerA, estimateId, ch11, it1101, { code: '11.01', description: 'A', unit: 'm3', quantity: '12', unitPrice: '100' });
    expect(dec(r1.subtotal)).toBe('1200');
    const r2 = await repoA.updateBoqItem(viewerA, estimateId, ch11, it1102, { code: '11.02', description: 'B', unit: 'm3', quantity: '5', unitPrice: '250' });
    expect(dec(r2.subtotal)).toBe('1250');
    // PATCH directo de subtotal arbitrario ⇒ el trigger lo recalcula.
    await clientA().from('boq_items').update({ subtotal: '999999' }).eq('id', it1101);
    const { data } = await clientA().from('boq_items').select('subtotal, quantity_snapshot, unit_price_snapshot').eq('id', it1101).single();
    const r = data as { subtotal: string; quantity_snapshot: string; unit_price_snapshot: string };
    expect(dec(r.subtotal)).toBe(dec(new Decimal(r.quantity_snapshot).times(r.unit_price_snapshot)));
    // Crear capítulo + ítem manual (origen NULL).
    const mc = await repoA.createEstimateChapter(viewerA, estimateId, { code: '99', name: 'Manual' });
    const mi = await repoA.createBoqItem(viewerA, estimateId, mc.chapterId, { code: '99.01', description: 'M', unit: 'un', quantity: '3', unitPrice: '7' });
    expect(dec(mi.subtotal)).toBe('21');
    const ev = await repoA.getEditableBoqItem(viewerA, estimateId, mc.chapterId, mi.itemId);
    expect(ev.isManual).toBe(true);
    // Restaurar baseline editado: directo = 1200 + 1250 + 100 + 21 = 2571.
    const fin = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(dec(fin.directTotal)).toBe('2571');
  });

  it('D — archive/restore: exclusión efectiva, sin DELETE físico, archivado individual persiste', async () => {
    const before = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    // Archivar 11.02 (1250) ⇒ directo baja a 1321.
    await repoA.archiveBoqItem(viewerA, estimateId, it1102);
    const afterItem = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(new Decimal(before.directTotal).minus(afterItem.directTotal).toFixed()).toBe(dec('1250'));
    // Fila persiste (sin DELETE físico).
    const { data } = await clientA().from('boq_items').select('archived_at').eq('id', it1102).single();
    expect((data as { archived_at: string | null }).archived_at).not.toBeNull();
    // Archivar capítulo 11 ⇒ excluye 11.01 (y 11.02 ya archivado). Restaurar.
    await repoA.archiveEstimateChapter(viewerA, estimateId, ch11);
    const afterCh = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(new Decimal(afterCh.directTotal).lessThan(afterItem.directTotal)).toBe(true);
    await repoA.restoreEstimateChapter(viewerA, estimateId, ch11);
    // 11.02 sigue archivado tras restaurar el capítulo.
    const items = await repoA.listItemsByChapter(viewerA, ch11, { includeArchived: true });
    expect(items.find((i) => i.id === it1102)!.archived).toBe(true);
    // Restaurar 11.02 ⇒ vuelve al estado editado (directo 2571).
    await repoA.restoreBoqItem(viewerA, estimateId, it1102);
    const restored = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(dec(restored.directTotal)).toBe('2571');
  });

  it('E — emitir V01: issued_at/issued_by server-side + inmutabilidad total', async () => {
    const issued = await repoA.issueEstimateVersion(viewerA, estimateId);
    expect(issued.status).toBe('issued');
    expect(issued.issuedBy).toBe(USER_A);
    expect(issued.issuedAt).not.toBeNull();
    // Inmutabilidad: cada camino de escritura rechaza.
    await expect(repoA.updateBoqItem(viewerA, estimateId, ch11, it1101, { code: '11.01', description: 'A', unit: 'm3', quantity: '1', unitPrice: '1' })).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.createEstimateChapter(viewerA, estimateId, { code: 'Z', name: 'z' })).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.createBoqItem(viewerA, estimateId, ch11, { code: 'z', description: 'z', unit: 'u', quantity: '1', unitPrice: '1' })).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.archiveBoqItem(viewerA, estimateId, it1101)).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.restoreBoqItem(viewerA, estimateId, it1101)).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '1', contingencyRate: '1', utilityRate: '1', utilityVatRate: '1' })).rejects.toBeInstanceOf(AiuVersionLockedError);
    await expect(repoA.issueEstimateVersion(viewerA, estimateId)).rejects.toBeInstanceOf(VersionNotDraftError);
  });

  it('F — clonar V01 issued → V02 draft activa; clon completo; total activo idéntico', async () => {
    const v1Export = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const clone = await repoA.cloneIssuedEstimateVersion(viewerA, estimateId);
    v2Id = clone.id;
    expect(clone.status).toBe('draft');
    expect(clone.versionNumber).toBe(2);
    expect(clone.sourceVersionId).toBe(v1Id);
    expect(clone.isActive).toBe(true);
    expect(dec(clone.directTotal)).toBe(dec(v1Export.financial.directTotal)); // total activo idéntico
    // Capítulos/ítems clonados con origen preservado (chapter_id remapeado).
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId, { includeArchived: true });
    const newCh11 = chs.find((c) => c.code === '11')!;
    expect(newCh11.id).not.toBe(ch11);
    const items = await repoA.listItemsByChapter(viewerA, newCh11.id, { includeArchived: true });
    expect(items.find((i) => i.code === '11.01')!.sourceCode).toBe('7.01');
  });

  it('G — editar V02 no altera V01 (snapshots de export por versionId)', async () => {
    const v1Before = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    const newCh11 = chs.find((c) => c.code === '11')!;
    const items = await repoA.listItemsByChapter(viewerA, newCh11.id);
    await repoA.updateBoqItem(viewerA, estimateId, newCh11.id, items.find((i) => i.code === '11.01')!.id, { code: '11.01', description: 'A', unit: 'm3', quantity: '99', unitPrice: '100' });
    const v1After = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const v2After = await repoA.getEstimateExportPayload(viewerA, estimateId, v2Id);
    expect(v1After.financial.grandTotal).toBe(v1Before.financial.grandTotal); // V01 intacta
    expect(v2After.financial.grandTotal).not.toBe(v1After.financial.grandTotal); // V02 cambió
  });

  it('H — comparar V01 vs V02: delta, changed, read-only', async () => {
    const before = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const cmp = await repoA.compareEstimateVersions(viewerA, estimateId, v1Id, v2Id);
    expect(cmp.base.id).toBe(v1Id);
    expect(cmp.target.id).toBe(v2Id);
    expect(new Decimal(cmp.financial.directTotal.delta).abs().greaterThan(0)).toBe(true);
    expect(cmp.financial.directTotal.deltaPct).not.toBeNull();
    const ch11Diff = cmp.chapters.find((c) => c.code === '11')!;
    expect(ch11Diff.status).toBe('changed');
    expect(ch11Diff.items.find((i) => i.code === '11.01')!.status).toBe('changed');
    // Read-only: V01 intacta tras comparar.
    const after = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    expect(after.financial.grandTotal).toBe(before.financial.grandTotal);
  });

  it('H2 — comparación con código de ítem repetido empareja por orden + duplicateCodeWarning', async () => {
    // Crear dos ítems con el mismo code en el capítulo activo (V02) ⇒ duplicado.
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    const cap = chs.find((c) => c.code === '12')!;
    await repoA.createBoqItem(viewerA, estimateId, cap.id, { code: 'DUP', description: 'd1', unit: 'u', quantity: '1', unitPrice: '10' });
    await repoA.createBoqItem(viewerA, estimateId, cap.id, { code: 'DUP', description: 'd2', unit: 'u', quantity: '1', unitPrice: '20' });
    const cmp = await repoA.compareEstimateVersions(viewerA, estimateId, v1Id, v2Id);
    expect(cmp.duplicateCodeWarning).toBe(true);
    const dupItems = cmp.chapters.find((c) => c.code === '12')!.items.filter((i) => i.code === 'DUP');
    expect(dupItems.map((i) => i.occurrenceIndex).sort()).toEqual([1, 2]);
  });

  it('I — seguridad: Org B no lee/edita/archiva/emite/clona/compara el estimate de A', async () => {
    await expect(repoB.getEstimateById(viewerB, estimateId)).rejects.toBeInstanceOf(EstimateNotFoundError);
    await expect(repoB.createEstimateChapter(viewerB, estimateId, { code: 'x', name: 'x' })).rejects.toBeInstanceOf(EstimateNotFoundError);
    await expect(repoB.archiveBoqItem(viewerB, estimateId, it1101)).rejects.toBeInstanceOf(EstimateNotFoundError);
    await expect(repoB.cloneIssuedEstimateVersion(viewerB, estimateId)).rejects.toBeInstanceOf(EstimateNotFoundError);
    await expect(repoB.compareEstimateVersions(viewerB, estimateId, v1Id, v2Id)).rejects.toBeInstanceOf(EstimateNotFoundError);
  });

  it('J — no destrucción: V01 issued histórica sigue consultable y exportable', async () => {
    const versions = await repoA.listEstimateVersions(viewerA, estimateId);
    expect(versions.find((v) => v.id === v1Id)!.status).toBe('issued');
    const v1 = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    expect(v1.version.status).toBe('issued');
    expect(v1.chapters.length).toBeGreaterThan(0);
  });
});
