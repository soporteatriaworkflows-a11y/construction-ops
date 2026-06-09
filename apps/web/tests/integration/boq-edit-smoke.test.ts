/**
 * boq-edit-smoke.test.ts — Smoke AUTOMATIZADO no destructivo de edición manual de
 * BOQ (4E.2A) contra Postgres 17 / Supabase LOCAL, usando el REPOSITORIO REAL
 * (`DbEstimatesWriteRepository`) a través de PostgREST con RLS aplicada (JWT de
 * usuario sembrado). 100% sobre datos SINTÉTICOS locales; jamás toca ENTRE PATIOS
 * ni producción.
 *
 * Gated por `BOQ_SMOKE_DB=1` (requiere stack local). Ejecutar:
 *   BOQ_SMOKE_DB=1 corepack pnpm --filter web exec vitest run tests/integration/boq-edit-smoke.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DbEstimatesWriteRepository } from '@/server/estimates/db-repository';
import {
  getEstimatesWriteRepository,
  BoqWriteNotSupportedError,
  BoqVersionLockedError,
  BoqAlreadyArchivedError,
  BoqNotArchivedError,
  ChapterCodeDuplicateError,
  EstimateNotFoundError,
  VersionNotDraftError,
  VersionNotIssuedError,
  VersionMismatchError,
  AiuVersionLockedError,
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

const round10 = (q: string, p: string) => new Decimal(q).times(p).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed();
// PostgREST puede devolver numeric como número JS; normalizamos a la forma canónica.
const sub = (v: unknown) => new Decimal(v as Decimal.Value).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed();

describe.skipIf(!RUN)('4E.2A — smoke automatizado de edición (repo real + RLS local)', () => {
  const clientA = () => clientFor(USER_A);
  const clientB = () => clientFor(USER_B);
  const repoA = new DbEstimatesWriteRepository(async () => clientA());
  const repoB = new DbEstimatesWriteRepository(async () => clientB());

  let estimateId: string;
  let versionId: string;
  let chImportedId: string; // capítulo importado (con source)
  let chSecondId: string;   // 2.º capítulo (para mover)
  let itImportedId: string; // ítem importado (con source_code/source_row)

  // Baseline financiero/ítem.
  let base: {
    quantity: string; unitPrice: string; subtotal: string;
    chapterSubtotal: string; directTotal: string;
    administrationAmount: string; contingencyAmount: string; utilityAmount: string;
    utilityVatAmount: string; indirectTotal: string; grandTotal: string;
  };

  beforeAll(async () => {
    // Escenario sintético: estimate + V01 (draft) vía RPC real del repo.
    const est = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `Smoke 4E2A ${Date.now()}` });
    estimateId = est.id;
    versionId = est.activeVersion!.id;

    // Importa 2 capítulos + 1 ítem con source_code/source_row (camino real RPC).
    const chapters = [
      { code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 },
      { code: '12', name: 'Cimentación', sortOrder: 1, sourceCode: '8', sourceRow: 110 },
    ];
    const items = [
      { chapterCode: '11', code: '11.01', description: 'Excavación', unit: 'm3', quantity: '10', unitPrice: '100', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
    ];
    const { error: impErr } = await clientA().rpc('import_boq_into_version', {
      p_version_id: versionId, p_chapters: chapters, p_items: items,
    });
    expect(impErr).toBeNull();

    const { data: chs } = await clientA().from('chapters').select('id, code').eq('estimate_version_id', versionId);
    chImportedId = (chs as { id: string; code: string }[]).find((c) => c.code === '11')!.id;
    chSecondId = (chs as { id: string; code: string }[]).find((c) => c.code === '12')!.id;
    const { data: its } = await clientA().from('boq_items').select('id, code').eq('estimate_version_id', versionId);
    itImportedId = (its as { id: string; code: string }[]).find((i) => i.code === '11.01')!.id;

    // AIU por versión (camino real del repo): A 3.5 / I 2.5 / U 4 / IVA 19.
    await repoA.updateEstimateVersionAiu(viewerA, estimateId, {
      administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19',
    });

    const fin = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    const chList = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    const itList = await repoA.listItemsByChapter(viewerA, chImportedId);
    const it0 = itList[0]!;
    base = {
      quantity: it0.quantity, unitPrice: it0.unitPrice, subtotal: it0.subtotal,
      chapterSubtotal: chList.find((c) => c.id === chImportedId)!.subtotal,
      directTotal: fin.directTotal, administrationAmount: fin.administrationAmount,
      contingencyAmount: fin.contingencyAmount, utilityAmount: fin.utilityAmount,
      utilityVatAmount: fin.utilityVatAmount, indirectTotal: fin.indirectTotal, grandTotal: fin.grandTotal,
    };
  });

  it('D — db reset/baseline: subtotal = round(q×p,10) y AIU aplicada', () => {
    expect(sub(base.subtotal)).toBe(round10(base.quantity, base.unitPrice));
    expect(new Decimal(base.grandTotal).greaterThan(base.directTotal)).toBe(true);
  });

  it('A — editar cantidad recalcula subtotal/capítulo/directo/AIU/total y preserva origen', async () => {
    const newQty = new Decimal(base.quantity).plus(5).toFixed();
    const res = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: newQty, unitPrice: base.unitPrice,
    });
    expect(sub(res.subtotal)).toBe(round10(newQty, base.unitPrice));
    expect(sub(res.subtotal)).not.toBe(sub(base.subtotal));
    // Resumen financiero recalculado.
    expect(res.financial.directTotal).not.toBe(base.directTotal);
    expect(res.financial.administrationAmount).not.toBe(base.administrationAmount);
    expect(res.financial.contingencyAmount).not.toBe(base.contingencyAmount);
    expect(res.financial.utilityAmount).not.toBe(base.utilityAmount);
    expect(res.financial.indirectTotal).not.toBe(base.indirectTotal);
    expect(res.financial.grandTotal).not.toBe(base.grandTotal);
    // Subtotal del capítulo cambia.
    const chList = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    expect(chList.find((c) => c.id === chImportedId)!.subtotal).not.toBe(base.chapterSubtotal);
    // Trazabilidad preservada.
    const ev = await repoA.getEditableBoqItem(viewerA, estimateId, chImportedId, itImportedId);
    expect(ev.sourceCode).toBe('7.01');
    expect(ev.sourceRow).toBe(98);
    expect(ev.isManual).toBe(false);
  });

  it('B — restaurar cantidad ⇒ todo vuelve EXACTO al baseline', async () => {
    const res = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    });
    expect(sub(res.subtotal)).toBe(sub(base.subtotal));
    expect(res.financial.directTotal).toBe(base.directTotal);
    expect(res.financial.administrationAmount).toBe(base.administrationAmount);
    expect(res.financial.contingencyAmount).toBe(base.contingencyAmount);
    expect(res.financial.utilityAmount).toBe(base.utilityAmount);
    expect(res.financial.utilityVatAmount).toBe(base.utilityVatAmount);
    expect(res.financial.indirectTotal).toBe(base.indirectTotal);
    expect(res.financial.grandTotal).toBe(base.grandTotal);
    const chList = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    expect(chList.find((c) => c.id === chImportedId)!.subtotal).toBe(base.chapterSubtotal);
  });

  it('C — editar precio recalcula y restaurar vuelve al baseline', async () => {
    const newPrice = new Decimal(base.unitPrice).plus(50).toFixed();
    const up = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: newPrice,
    });
    expect(sub(up.subtotal)).toBe(round10(base.quantity, newPrice));
    expect(up.financial.grandTotal).not.toBe(base.grandTotal);
    const back = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    });
    expect(sub(back.subtotal)).toBe(sub(base.subtotal));
    expect(back.financial.grandTotal).toBe(base.grandTotal);
  });

  it('D — PATCH subtotal-only por PostgREST ⇒ trigger ignora el valor manipulado', async () => {
    const { error } = await clientA().from('boq_items').update({ subtotal: '999999999' }).eq('id', itImportedId);
    expect(error).toBeNull();
    const { data } = await clientA().from('boq_items').select('subtotal, quantity_snapshot, unit_price_snapshot').eq('id', itImportedId).single();
    const r = data as { subtotal: string; quantity_snapshot: string; unit_price_snapshot: string };
    expect(new Decimal(r.subtotal).toString()).toBe(round10(r.quantity_snapshot, r.unit_price_snapshot));
    expect(new Decimal(r.subtotal).equals('999999999')).toBe(false);
  });

  it('E — crear capítulo manual: origen NULL, sort_order append, código único', async () => {
    const created = await repoA.createEstimateChapter(viewerA, estimateId, { code: 'M-CAP', name: 'Capítulo manual' });
    const ev = await repoA.getEditableEstimateChapter(viewerA, estimateId, created.chapterId);
    expect(ev.isManual).toBe(true);
    expect(ev.sourceCode).toBeNull();
    expect(ev.sourceRow).toBeNull();
    const { data } = await clientA().from('chapters').select('sort_order').eq('id', created.chapterId).single();
    expect((data as { sort_order: number }).sort_order).toBe(2); // append tras 0,1
    // Código único por versión.
    await expect(repoA.createEstimateChapter(viewerA, estimateId, { code: 'M-CAP', name: 'dup' }))
      .rejects.toBeInstanceOf(ChapterCodeDuplicateError);
  });

  it('F — crear ítem manual: origen NULL, subtotal derivado, totales suben', async () => {
    const before = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    const res = await repoA.createBoqItem(viewerA, estimateId, chSecondId, {
      code: '12.01', description: 'Manual', unit: 'un', quantity: '3', unitPrice: '7',
    });
    expect(sub(res.subtotal)).toBe(round10('3', '7'));
    expect(new Decimal(res.financial.directTotal).greaterThan(before.directTotal)).toBe(true);
    expect(new Decimal(res.financial.grandTotal).greaterThan(before.grandTotal)).toBe(true);
    const ev = await repoA.getEditableBoqItem(viewerA, estimateId, chSecondId, res.itemId);
    expect(ev.isManual).toBe(true);
    expect(ev.sourceCode).toBeNull();
    expect(ev.sourceRow).toBeNull();
    // Limpieza lógica: restaurar totales borrando el ítem manual no aplica (no destructivo
    // sobre datos sintéticos locales). Se deja para no introducir borrado (fuera de 4E.2A).
  });

  it('G — editar ítem importado: code editable, source_code/source_row preservados', async () => {
    const res = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01-R', description: 'Excavación renombrada', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    });
    const ev = await repoA.getEditableBoqItem(viewerA, estimateId, chImportedId, res.itemId);
    expect(ev.code).toBe('11.01-R');
    expect(ev.sourceCode).toBe('7.01');
    expect(ev.sourceRow).toBe(98);
    // Restaurar code original.
    await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    });
  });

  it('H — mover ítem importado a otro capítulo (misma versión): origen intacto, sort append', async () => {
    const res = await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
      targetChapterId: chSecondId,
    });
    expect(res.chapterId).toBe(chSecondId);
    const ev = await repoA.getEditableBoqItem(viewerA, estimateId, chSecondId, itImportedId);
    expect(ev.chapterId).toBe(chSecondId);
    expect(ev.sourceCode).toBe('7.01'); // origen intacto tras mover
    const { data } = await clientA().from('boq_items').select('sort_order').eq('id', itImportedId).single();
    expect((data as { sort_order: number }).sort_order).toBeGreaterThanOrEqual(1); // append en destino
    // Volver al capítulo original.
    await repoA.updateBoqItem(viewerA, estimateId, chSecondId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
      targetChapterId: chImportedId,
    });
  });

  it('N (FASE 3) — export payload refleja la edición y luego restaura su pre-estado', async () => {
    // Snapshot local (tras casos previos que ya alteraron el total); robusto.
    const pre = await repoA.getEstimateExportPayload(viewerA, estimateId);
    const newQty = new Decimal(base.quantity).plus(2).toFixed();
    await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: newQty, unitPrice: base.unitPrice,
    });
    const payload = await repoA.getEstimateExportPayload(viewerA, estimateId);
    const item = payload.chapters.find((c) => c.code === '11')!.items.find((i) => i.code === '11.01')!;
    expect(sub(item.subtotal)).toBe(round10(newQty, base.unitPrice));
    expect(payload.financial.grandTotal).not.toBe(pre.financial.grandTotal);
    // Restaurar y confirmar que el total general vuelve EXACTO al pre-estado.
    await repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'Excavación', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    });
    const back = await repoA.getEstimateExportPayload(viewerA, estimateId);
    expect(back.financial.grandTotal).toBe(pre.financial.grandTotal);
  });

  it('I — seguridad: cross-org, fixture write, y versión emitida bloqueadas', async () => {
    // Cross-org: B no ve el presupuesto/capítulo de A (RLS oculta la versión ⇒ Not-Found).
    await expect(repoB.getEditableEstimateChapter(viewerB, estimateId, chImportedId))
      .rejects.toBeInstanceOf(EstimateNotFoundError);
    // Fixture: escritura bloqueada.
    const fixtureRepo = getEstimatesWriteRepository({ env: { READ_MODEL_SOURCE: 'fixture' } });
    await expect(fixtureRepo.createEstimateChapter(viewerA, estimateId, { code: 'X', name: 'X' }))
      .rejects.toBeInstanceOf(BoqWriteNotSupportedError);
    // Versión emitida: emitimos la versión (draft→approved permitido) y luego el editor se bloquea.
    const { error: lockErr } = await clientA().from('estimate_versions').update({ status: 'approved' }).eq('id', versionId);
    expect(lockErr).toBeNull();
    await expect(repoA.createEstimateChapter(viewerA, estimateId, { code: 'LOCKED', name: 'x' }))
      .rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.updateBoqItem(viewerA, estimateId, chImportedId, itImportedId, {
      code: '11.01', description: 'x', unit: 'm3', quantity: base.quantity, unitPrice: base.unitPrice,
    })).rejects.toBeInstanceOf(BoqVersionLockedError);
  });
});

describe.skipIf(!RUN)('4E.2B — archive/restore no destructivo (repo real + RLS local)', () => {
  const clientA = () => clientFor(USER_A);
  const repoA = new DbEstimatesWriteRepository(async () => clientA());
  const repoB = new DbEstimatesWriteRepository(async () => clientFor(USER_B));

  let estimateId: string;
  let versionId: string;
  let ch11: string;
  let ch12: string;
  let itA: string; // 11.01 (1000)
  let itB: string; // 11.02 (1000)
  let baseDirect: string;
  let baseGrand: string;

  beforeAll(async () => {
    const est = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `Smoke 4E2B ${Date.now()}` });
    estimateId = est.id;
    versionId = est.activeVersion!.id;
    const chapters = [
      { code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 },
      { code: '12', name: 'Cimentación', sortOrder: 1 },
    ];
    const items = [
      { chapterCode: '11', code: '11.01', description: 'A', unit: 'm3', quantity: '10', unitPrice: '100', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
      { chapterCode: '11', code: '11.02', description: 'B', unit: 'm3', quantity: '5', unitPrice: '200', sortOrder: 1 },
      { chapterCode: '12', code: '12.01', description: 'C', unit: 'un', quantity: '2', unitPrice: '50', sortOrder: 0 },
    ];
    await clientA().rpc('import_boq_into_version', { p_version_id: versionId, p_chapters: chapters, p_items: items });
    const { data: chs } = await clientA().from('chapters').select('id, code').eq('estimate_version_id', versionId);
    ch11 = (chs as { id: string; code: string }[]).find((c) => c.code === '11')!.id;
    ch12 = (chs as { id: string; code: string }[]).find((c) => c.code === '12')!.id;
    const { data: its } = await clientA().from('boq_items').select('id, code').eq('estimate_version_id', versionId);
    itA = (its as { id: string; code: string }[]).find((i) => i.code === '11.01')!.id;
    itB = (its as { id: string; code: string }[]).find((i) => i.code === '11.02')!.id;
    await repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' });
    const fin = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    baseDirect = fin.directTotal; // 2100
    baseGrand = fin.grandTotal;
  });

  it('baseline directo = 2100', () => {
    expect(sub(baseDirect)).toBe('2100');
  });

  it('archivar ítem reduce subtotal de capítulo, costo directo, AIU y total; restaurar recupera', async () => {
    const res = await repoA.archiveBoqItem(viewerA, estimateId, itB);
    expect(sub(res.financial.directTotal)).toBe('1100'); // 2100 - 1000
    expect(res.financial.grandTotal).not.toBe(baseGrand);
    const chList = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    expect(sub(chList.find((c) => c.id === ch11)!.subtotal)).toBe('1000'); // solo 11.01 activo
    // No DELETE físico: la fila sigue existiendo con archived_at + archived_by.
    const { data } = await clientA().from('boq_items').select('archived_at, archived_by').eq('id', itB).single();
    const r = data as { archived_at: string | null; archived_by: string | null };
    expect(r.archived_at).not.toBeNull();
    expect(r.archived_by).toBe(USER_A); // identidad server-side
    // Restaurar.
    const back = await repoA.restoreBoqItem(viewerA, estimateId, itB);
    expect(back.financial.directTotal).toBe(baseDirect);
    expect(back.financial.grandTotal).toBe(baseGrand);
  });

  it('archivar capítulo excluye todos sus ítems; restaurar recupera solo los activos individualmente', async () => {
    // Archivar 11.02 individualmente, luego archivar capítulo 11.
    await repoA.archiveBoqItem(viewerA, estimateId, itB);
    const afterItem = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(sub(afterItem.directTotal)).toBe('1100');
    const arch = await repoA.archiveEstimateChapter(viewerA, estimateId, ch11);
    expect(sub(arch.financial.directTotal)).toBe('100'); // solo 12.01
    // Restaurar capítulo: 11.01 vuelve activo, 11.02 sigue archivado.
    const rest = await repoA.restoreEstimateChapter(viewerA, estimateId, ch11);
    expect(sub(rest.financial.directTotal)).toBe('1100'); // 11.01 (1000) + 12.01 (100); 11.02 sigue archivado
    const archivedView = await repoA.listItemsByChapter(viewerA, ch11, { includeArchived: true });
    expect(archivedView.find((i) => i.id === itB)!.archived).toBe(true);
    expect(archivedView.find((i) => i.id === itA)!.archived).toBe(false);
    // Limpieza: restaurar 11.02 para dejar baseline.
    await repoA.restoreBoqItem(viewerA, estimateId, itB);
    const restored = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    expect(restored.directTotal).toBe(baseDirect);
  });

  it('archive duplicado y restore de activo se rechazan de forma segura', async () => {
    await repoA.archiveBoqItem(viewerA, estimateId, itB);
    await expect(repoA.archiveBoqItem(viewerA, estimateId, itB)).rejects.toBeInstanceOf(BoqAlreadyArchivedError);
    await repoA.restoreBoqItem(viewerA, estimateId, itB);
    await expect(repoA.restoreBoqItem(viewerA, estimateId, itB)).rejects.toBeInstanceOf(BoqNotArchivedError);
  });

  it('read model: vista activa excluye archivados; includeArchived los incluye', async () => {
    await repoA.archiveBoqItem(viewerA, estimateId, itB);
    const active = await repoA.listItemsByChapter(viewerA, ch11);
    expect(active.some((i) => i.id === itB)).toBe(false);
    const all = await repoA.listItemsByChapter(viewerA, ch11, { includeArchived: true });
    expect(all.some((i) => i.id === itB)).toBe(true);
    await repoA.restoreBoqItem(viewerA, estimateId, itB);
  });

  it('export payload activo excluye el ítem archivado y no filtra de más', async () => {
    await repoA.archiveBoqItem(viewerA, estimateId, itB);
    const payload = await repoA.getEstimateExportPayload(viewerA, estimateId);
    const ch = payload.chapters.find((c) => c.code === '11')!;
    expect(ch.items.some((i) => i.code === '11.02')).toBe(false); // archivado excluido
    expect(ch.items.some((i) => i.code === '11.01')).toBe(true); // activo presente
    await repoA.restoreBoqItem(viewerA, estimateId, itB);
  });

  it('seguridad: Org B no archiva elementos de Org A', async () => {
    await expect(repoB.archiveBoqItem(viewerB, estimateId, itA)).rejects.toBeInstanceOf(EstimateNotFoundError);
  });

  it('versión emitida bloquea archive/restore', async () => {
    await clientA().from('estimate_versions').update({ status: 'approved' }).eq('id', versionId);
    await expect(repoA.archiveBoqItem(viewerA, estimateId, itA)).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.archiveEstimateChapter(viewerA, estimateId, ch12)).rejects.toBeInstanceOf(BoqVersionLockedError);
  });
});

describe.skipIf(!RUN)('4E.3A — emisión/clonación de versiones (repo real + RLS local)', () => {
  const clientA = () => clientFor(USER_A);
  const repoA = new DbEstimatesWriteRepository(async () => clientA());
  const repoB = new DbEstimatesWriteRepository(async () => clientFor(USER_B));

  let estimateId: string;
  let v1Id: string; // versión 1 (se emite)
  let ch11_v1: string;
  let itArchived_v1: string;
  let issuedDirect: string;

  beforeAll(async () => {
    const est = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `Smoke 4E3A ${Date.now()}` });
    estimateId = est.id;
    v1Id = est.activeVersion!.id;
    const chapters = [{ code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 }];
    const items = [
      { chapterCode: '11', code: '11.01', description: 'A', unit: 'm3', quantity: '10', unitPrice: '100', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
      { chapterCode: '11', code: '11.02', description: 'B', unit: 'm3', quantity: '5', unitPrice: '200', sortOrder: 1 },
    ];
    await clientA().rpc('import_boq_into_version', { p_version_id: v1Id, p_chapters: chapters, p_items: items });
    const { data: chs } = await clientA().from('chapters').select('id, code').eq('estimate_version_id', v1Id);
    ch11_v1 = (chs as { id: string; code: string }[]).find((c) => c.code === '11')!.id;
    const { data: its } = await clientA().from('boq_items').select('id, code').eq('estimate_version_id', v1Id);
    itArchived_v1 = (its as { id: string; code: string }[]).find((i) => i.code === '11.02')!.id;
    await repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' });
    // Archivar 11.02 ⇒ activo directo = 1000 (solo 11.01).
    await repoA.archiveBoqItem(viewerA, estimateId, itArchived_v1);
    const fin = await repoA.calculateEstimateFinancialSummary(viewerA, estimateId);
    issuedDirect = fin.directTotal; // 1000
  });

  it('emitir: draft → issued, issued_at/issued_by server-side', async () => {
    const res = await repoA.issueEstimateVersion(viewerA, estimateId);
    expect(res.status).toBe('issued');
    expect(res.issuedBy).toBe(USER_A);
    expect(res.issuedAt).not.toBeNull();
    const { data } = await clientA().from('estimate_versions').select('status, issued_by, issued_at').eq('id', v1Id).single();
    const r = data as { status: string; issued_by: string | null; issued_at: string | null };
    expect(r.status).toBe('issued');
    expect(r.issued_by).toBe(USER_A);
  });

  it('issued inmutable: archive/create/AIU rechazados', async () => {
    await expect(repoA.archiveBoqItem(viewerA, estimateId, itArchived_v1)).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.createEstimateChapter(viewerA, estimateId, { code: 'X', name: 'x' })).rejects.toBeInstanceOf(BoqVersionLockedError);
    await expect(repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '1', contingencyRate: '1', utilityRate: '1', utilityVatRate: '1' })).rejects.toBeInstanceOf(AiuVersionLockedError);
  });

  it('re-emitir una issued ⇒ VersionNotDraftError', async () => {
    await expect(repoA.issueEstimateVersion(viewerA, estimateId)).rejects.toBeInstanceOf(VersionNotDraftError);
  });

  it('clonar issued ⇒ nueva draft activa V02 con source y mismo total; origen intacto', async () => {
    const issuedExportBefore = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const clone = await repoA.cloneIssuedEstimateVersion(viewerA, estimateId);
    expect(clone.status).toBe('draft');
    expect(clone.versionNumber).toBe(2);
    expect(clone.sourceVersionId).toBe(v1Id);
    expect(clone.isActive).toBe(true);
    // Total activo idéntico al issued origen.
    expect(sub(clone.directTotal)).toBe(sub(issuedDirect));
    // Origen issued intacto (export por versionId no cambia).
    const issuedExportAfter = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    expect(issuedExportAfter.financial.grandTotal).toBe(issuedExportBefore.financial.grandTotal);
    expect(issuedExportAfter.version.status).toBe('issued');
  });

  it('clon: capítulos/ítems clonados con remapeo, origen y estado archivado preservados', async () => {
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId, { includeArchived: true });
    expect(chs.length).toBe(1);
    const newCh = chs[0]!;
    expect(newCh.id).not.toBe(ch11_v1); // remapeado (nuevo capítulo)
    const items = await repoA.listItemsByChapter(viewerA, newCh.id, { includeArchived: true });
    const active = items.filter((i) => !i.archived);
    const archived = items.filter((i) => i.archived);
    expect(active.length).toBe(1); // 11.01
    expect(archived.length).toBe(1); // 11.02 sigue archivado
    expect(active[0]!.sourceCode).toBe('7.01'); // origen preservado
    expect(active[0]!.sourceRow).toBe(98);
  });

  it('listEstimateVersions: 2 versiones (issued + draft), tenant-scoped', async () => {
    const versions = await repoA.listEstimateVersions(viewerA, estimateId);
    expect(versions.length).toBe(2);
    expect(versions.find((v) => v.versionNumber === 1)!.status).toBe('issued');
    expect(versions.find((v) => v.versionNumber === 2)!.status).toBe('draft');
    expect(versions.find((v) => v.versionNumber === 2)!.isActive).toBe(true);
    // Cross-org: B no ve versiones de A.
    const vb = await repoB.listEstimateVersions(viewerB, estimateId);
    expect(vb.length).toBe(0);
  });

  it('editar la nueva draft NO altera el export del issued origen', async () => {
    const issuedBefore = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    const newCh = chs[0]!;
    const items = await repoA.listItemsByChapter(viewerA, newCh.id);
    await repoA.updateBoqItem(viewerA, estimateId, newCh.id, items[0]!.id, {
      code: '11.01', description: 'A', unit: 'm3', quantity: '999', unitPrice: '100',
    });
    const issuedAfter = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    expect(issuedAfter.financial.grandTotal).toBe(issuedBefore.financial.grandTotal); // issued intacto
    const draftExport = await repoA.getEstimateExportPayload(viewerA, estimateId); // activa (draft)
    expect(draftExport.financial.grandTotal).not.toBe(issuedAfter.financial.grandTotal); // draft cambió
  });

  it('clonar una draft (activa actual) ⇒ VersionNotIssuedError', async () => {
    await expect(repoA.cloneIssuedEstimateVersion(viewerA, estimateId)).rejects.toBeInstanceOf(VersionNotIssuedError);
  });

  it('seguridad: Org B no clona ni emite versiones de A', async () => {
    await expect(repoB.cloneIssuedEstimateVersion(viewerB, estimateId)).rejects.toBeInstanceOf(EstimateNotFoundError);
    await expect(repoB.issueEstimateVersion(viewerB, estimateId)).rejects.toBeInstanceOf(EstimateNotFoundError);
  });
});

describe.skipIf(!RUN)('4E.3B — comparación de versiones (repo real + RLS local)', () => {
  const clientA = () => clientFor(USER_A);
  const repoA = new DbEstimatesWriteRepository(async () => clientA());
  const repoB = new DbEstimatesWriteRepository(async () => clientFor(USER_B));

  let estimateId: string;
  let v1Id: string;
  let v2Id: string;
  let otherEstimateId: string;
  let otherVersionId: string;

  beforeAll(async () => {
    // Estimate con V1 (issued) y V2 (draft clonada, editada).
    const est = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `Smoke 4E3B ${Date.now()}` });
    estimateId = est.id;
    v1Id = est.activeVersion!.id;
    await clientA().rpc('import_boq_into_version', {
      p_version_id: v1Id,
      p_chapters: [{ code: '11', name: 'Preliminares', sortOrder: 0 }],
      p_items: [{ chapterCode: '11', code: '11.01', description: 'A', unit: 'm3', quantity: '10', unitPrice: '100', sortOrder: 0 }],
    });
    await repoA.updateEstimateVersionAiu(viewerA, estimateId, { administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' });
    await repoA.issueEstimateVersion(viewerA, estimateId);
    const clone = await repoA.cloneIssuedEstimateVersion(viewerA, estimateId);
    v2Id = clone.id;
    // Editar V2: cambiar cantidad del 11.01.
    const chs = await repoA.listChaptersByEstimateVersion(viewerA, estimateId);
    const items = await repoA.listItemsByChapter(viewerA, chs[0]!.id);
    await repoA.updateBoqItem(viewerA, estimateId, chs[0]!.id, items[0]!.id, {
      code: '11.01', description: 'A', unit: 'm3', quantity: '15', unitPrice: '100',
    });
    // Segundo estimate (para cross-estimate).
    const est2 = await repoA.insertEstimateWithInitialVersion(viewerA, SCOPE_A, { name: `Smoke 4E3B other ${Date.now()}` });
    otherEstimateId = est2.id;
    otherVersionId = est2.activeVersion!.id;
  });

  it('compara dos versiones del mismo estimate; refleja el delta de la edición', async () => {
    const r = await repoA.compareEstimateVersions(viewerA, estimateId, v1Id, v2Id);
    expect(r.base.id).toBe(v1Id);
    expect(r.target.id).toBe(v2Id);
    // V1 directo = 1000, V2 directo = 1500 ⇒ delta 500.
    expect(sub(r.financial.directTotal.base)).toBe('1000');
    expect(sub(r.financial.directTotal.target)).toBe('1500');
    expect(sub(r.financial.directTotal.delta)).toBe('500');
    expect(r.chapters[0]!.items[0]!.status).toBe('changed');
  });

  it('rechaza versiones de estimates distintos (VersionMismatchError)', async () => {
    await expect(repoA.compareEstimateVersions(viewerA, estimateId, v1Id, otherVersionId)).rejects.toBeInstanceOf(VersionMismatchError);
  });

  it('cross-org: Org B no compara versiones de A', async () => {
    await expect(repoB.compareEstimateVersions(viewerB, estimateId, v1Id, v2Id)).rejects.toBeInstanceOf(EstimateNotFoundError);
  });

  it('comparar NO muta datos (V1 issued intacta)', async () => {
    const before = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    await repoA.compareEstimateVersions(viewerA, estimateId, v1Id, v2Id);
    const after = await repoA.getEstimateExportPayload(viewerA, estimateId, v1Id);
    expect(after.financial.grandTotal).toBe(before.financial.grandTotal);
    expect(after.version.status).toBe('issued');
  });
});
