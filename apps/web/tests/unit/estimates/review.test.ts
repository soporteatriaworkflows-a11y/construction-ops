/**
 * review.test.ts — Revisión operativa del presupuesto importado (4D.1).
 *
 * Ejercita los métodos de lectura sobre el repositorio FIXTURE (golden master):
 * capítulos con conteo/subtotal, detalle con contexto, ítems ordenados, y el
 * aislamiento cross-org. Propiedad: agent-frontend-boq / agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  getEstimatesWriteRepository,
  ChapterNotFoundError,
} from '@/server/estimates';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const otherOrg: ViewerContext = { organizationId: 'otra-org', role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const DEMO_CHAPTER_ID = '0c000000-0000-4000-8000-000000000001';

function repo() {
  return getEstimatesWriteRepository({ env: { READ_MODEL_SOURCE: 'fixture' } });
}

describe('listChaptersByEstimateVersion (fixture)', () => {
  it('devuelve los 14 capítulos del golden master, ordenados', async () => {
    const out = await repo().listChaptersByEstimateVersion(reader, DEMO_ESTIMATE_ID);
    expect(out).toHaveLength(14);
    const orders = out.map((c) => c.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
  it('cada capítulo trae itemCount y subtotal (DecimalString)', async () => {
    const out = await repo().listChaptersByEstimateVersion(reader, DEMO_ESTIMATE_ID);
    const first = out.find((c) => c.id === DEMO_CHAPTER_ID)!;
    expect(first.itemCount).toBeGreaterThan(0);
    expect(typeof first.subtotal).toBe('string');
    expect(Number(first.subtotal)).toBeGreaterThan(0);
  });
  it('Σ subtotales de capítulos ≈ total directo del golden master (±1 COP)', async () => {
    const out = await repo().listChaptersByEstimateVersion(reader, DEMO_ESTIMATE_ID);
    const sum = out.reduce((acc, c) => acc + Number(c.subtotal), 0);
    expect(Math.abs(sum - 336084479.93690735)).toBeLessThan(1);
  });
  it('cross-org ⇒ [] (aislamiento)', async () => {
    expect(await repo().listChaptersByEstimateVersion(otherOrg, DEMO_ESTIMATE_ID)).toEqual([]);
  });
});

describe('getChapterById (fixture)', () => {
  it('devuelve detalle con contexto proyecto/alcance/presupuesto/versión', async () => {
    const ch = await repo().getChapterById(reader, DEMO_CHAPTER_ID);
    expect(ch.id).toBe(DEMO_CHAPTER_ID);
    expect(ch.estimateId).toBe(DEMO_ESTIMATE_ID);
    expect(ch.versionNumber).toBe(1);
    expect(ch.projectName).toBeTruthy();
    expect(ch.scopeName).toBeTruthy();
    expect(ch.itemCount).toBeGreaterThan(0);
  });
  it('cross-org ⇒ ChapterNotFoundError', async () => {
    await expect(repo().getChapterById(otherOrg, DEMO_CHAPTER_ID)).rejects.toBeInstanceOf(ChapterNotFoundError);
  });
  it('id desconocido ⇒ ChapterNotFoundError', async () => {
    await expect(repo().getChapterById(reader, 'desconocido')).rejects.toBeInstanceOf(ChapterNotFoundError);
  });
});

describe('listItemsByChapter (fixture)', () => {
  it('devuelve los ítems del capítulo, ordenados por sortOrder', async () => {
    const items = await repo().listItemsByChapter(reader, DEMO_CHAPTER_ID);
    expect(items.length).toBeGreaterThan(0);
    const orders = items.map((i) => i.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(typeof items[0]!.quantity).toBe('string');
    expect(typeof items[0]!.unitPrice).toBe('string');
    expect(typeof items[0]!.subtotal).toBe('string');
  });
  it('capítulo cross-org / desconocido ⇒ []', async () => {
    expect(await repo().listItemsByChapter(otherOrg, DEMO_CHAPTER_ID)).toEqual([]);
    expect(await repo().listItemsByChapter(reader, 'nope')).toEqual([]);
  });
});
