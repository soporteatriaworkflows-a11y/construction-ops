/**
 * boq-edit.test.ts — Edición manual de BOQ (4E.2A): validación pura, subtotal
 * derivado, repositorio fixture (solo lectura) y fuente de actions/UI.
 *
 * Las garantías DB-level (trigger de subtotal, PATCH-only ignorado, mover ítem,
 * versión bloqueada, trazabilidad) se validan en `scripts/rls-runtime/run.ts`
 * (sección 17) contra Postgres real. Aquí cubrimos la capa pura + fixture + UI.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  getEstimatesWriteRepository,
  BoqWriteNotSupportedError,
  BoqValidationError,
  BoqItemNotFoundError,
  ChapterNotFoundError,
  validateChapterInput,
  validateBoqItemInput,
  validateBoqItemUpdate,
  deriveSubtotal,
  parseNonNegativeDecimal,
} from '@/server/estimates';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const otherOrg: ViewerContext = { organizationId: '00000000-0000-4000-8000-0000000000ff', role: 'management' };
const writer: AuthenticatedViewer = { userId: 'u', profileId: 'p', organizationId: DEMO_ORGANIZATION_ID, role: 'management' };

const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const DEMO_CHAPTER_ID = '0c000000-0000-4000-8000-000000000001';
const DEMO_ITEM_ID = '0b000000-0000-4000-8000-000000000001';
const repo = () => getEstimatesWriteRepository({ env: { READ_MODEL_SOURCE: 'fixture' } });

describe('BOQ manual — validación de capítulo', () => {
  it('válido ⇒ normaliza code/name (trim)', () => {
    expect(validateChapterInput({ code: ' 11 ', name: ' Preliminares ' })).toEqual({ code: '11', name: 'Preliminares' });
  });
  it('código faltante ⇒ BoqValidationError(code)', () => {
    try {
      validateChapterInput({ code: '', name: 'X' });
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(BoqValidationError);
      expect((e as BoqValidationError).issues.some((i) => i.field === 'code')).toBe(true);
    }
  });
  it('nombre faltante ⇒ BoqValidationError(name)', () => {
    expect(() => validateChapterInput({ code: '11', name: '   ' })).toThrow(BoqValidationError);
  });
  it('código demasiado largo ⇒ BoqValidationError', () => {
    expect(() => validateChapterInput({ code: 'x'.repeat(61), name: 'X' })).toThrow(BoqValidationError);
  });
});

describe('BOQ manual — validación de ítem', () => {
  it('válido ⇒ normaliza y conserva cantidad/precio', () => {
    const out = validateBoqItemInput({ code: '11.01', description: ' Exc ', unit: ' m3 ', quantity: '2', unitPrice: '3' });
    expect(out).toMatchObject({ code: '11.01', description: 'Exc', unit: 'm3', quantity: '2', unitPrice: '3' });
  });
  it('cantidad negativa ⇒ BoqValidationError(quantity)', () => {
    try {
      validateBoqItemInput({ code: 'x', description: 'd', unit: 'u', quantity: '-1', unitPrice: '2' });
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(BoqValidationError);
      expect((e as BoqValidationError).issues.some((i) => i.field === 'quantity')).toBe(true);
    }
  });
  it('precio no numérico ⇒ BoqValidationError(unitPrice)', () => {
    expect(() => validateBoqItemInput({ code: 'x', description: 'd', unit: 'u', quantity: '2', unitPrice: 'abc' })).toThrow(BoqValidationError);
  });
  it('descripción excesiva ⇒ BoqValidationError', () => {
    expect(() => validateBoqItemInput({ code: 'x', description: 'z'.repeat(1001), unit: 'u', quantity: '1', unitPrice: '1' })).toThrow(BoqValidationError);
  });
  it('update con targetChapterId ⇒ se normaliza', () => {
    const out = validateBoqItemUpdate({ code: 'x', description: 'd', unit: 'u', quantity: '1', unitPrice: '1', targetChapterId: ' abc ' });
    expect(out.targetChapterId).toBe('abc');
  });
  it('update sin targetChapterId ⇒ null', () => {
    const out = validateBoqItemUpdate({ code: 'x', description: 'd', unit: 'u', quantity: '1', unitPrice: '1' });
    expect(out.targetChapterId).toBeNull();
  });
});

describe('BOQ manual — subtotal derivado (espejo del trigger)', () => {
  it('parseNonNegativeDecimal rechaza negativos y no numéricos', () => {
    expect(parseNonNegativeDecimal('-1')).toBeNull();
    expect(parseNonNegativeDecimal('abc')).toBeNull();
    expect(parseNonNegativeDecimal('')).toBeNull();
    expect(parseNonNegativeDecimal('2.5')).toBe('2.5');
  });
  it('deriveSubtotal = round(q×p, 10)', () => {
    expect(deriveSubtotal('2', '3')).toBe('6');
    expect(deriveSubtotal('198.2', '15693.79')).toBe(
      new Decimal('198.2').times('15693.79').toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(),
    );
  });
});

describe('BOQ manual — repositorio fixture (solo lectura)', () => {
  it('createEstimateChapter ⇒ BoqWriteNotSupportedError', async () => {
    await expect(repo().createEstimateChapter(writer, DEMO_ESTIMATE_ID, { code: '99', name: 'X' })).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
  });
  it('updateEstimateChapter ⇒ BoqWriteNotSupportedError', async () => {
    await expect(repo().updateEstimateChapter(writer, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID, { code: '99', name: 'X' })).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
  });
  it('createBoqItem ⇒ BoqWriteNotSupportedError', async () => {
    await expect(repo().createBoqItem(writer, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID, { code: 'x', description: 'd', unit: 'u', quantity: '1', unitPrice: '1' })).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
  });
  it('updateBoqItem ⇒ BoqWriteNotSupportedError', async () => {
    await expect(repo().updateBoqItem(writer, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID, DEMO_ITEM_ID, { code: 'x', description: 'd', unit: 'u', quantity: '1', unitPrice: '1' })).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
  });
  it('getEditableEstimateChapter ⇒ lee del fixture (no editable)', async () => {
    const ch = await repo().getEditableEstimateChapter(reader, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID);
    expect(ch.id).toBe(DEMO_CHAPTER_ID);
    expect(ch.editable).toBe(false);
  });
  it('getEditableBoqItem ⇒ lee del fixture + capítulos disponibles', async () => {
    const it = await repo().getEditableBoqItem(reader, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID, DEMO_ITEM_ID);
    expect(it.id).toBe(DEMO_ITEM_ID);
    expect(it.availableChapters.length).toBeGreaterThan(0);
    expect(it.editable).toBe(false);
  });
  it('cross-org ⇒ ChapterNotFoundError / BoqItemNotFoundError', async () => {
    await expect(repo().getEditableEstimateChapter(otherOrg, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID)).rejects.toBeInstanceOf(ChapterNotFoundError);
    await expect(repo().getEditableBoqItem(otherOrg, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID, DEMO_ITEM_ID)).rejects.toBeInstanceOf(BoqItemNotFoundError);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(here, '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]');
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');

describe('BOQ manual — actions/UI (fuente)', () => {
  it('chapter-actions: server, guard de modo + viewer; sin subtotal del navegador', () => {
    const src = read('chapter-actions.ts');
    expect(src).toMatch(/^'use server';/m);
    expect(src).toMatch(/isCreationModeEnabled\(\)/);
    expect(src).toMatch(/resolveAuthenticatedViewer\(\)/);
    expect(src).toMatch(/createEstimateChapter\(|updateEstimateChapter\(/);
    expect(src).not.toMatch(/formData\.get\('subtotal'\)/);
  });
  it('item-actions: server, guard + viewer; nunca lee subtotal/directTotal/grandTotal', () => {
    const src = read('item-actions.ts');
    expect(src).toMatch(/^'use server';/m);
    expect(src).toMatch(/isCreationModeEnabled\(\)/);
    expect(src).toMatch(/createBoqItem\(|updateBoqItem\(/);
    expect(src).not.toMatch(/formData\.get\('subtotal'\)/);
    expect(src).not.toMatch(/formData\.get\('directTotal'\)/);
    expect(src).not.toMatch(/formData\.get\('grandTotal'\)/);
  });
  it('item-form: subtotal solo preview + leyenda de recálculo', () => {
    const src = read('item-form.tsx');
    expect(src).toMatch(/^'use client';/m);
    expect(src).toMatch(/El subtotal definitivo se recalcula al guardar/);
    expect(src).toMatch(/Guardar ítem/);
  });
  it('chapter-form: Guardar capítulo + cancelar', () => {
    const src = read('chapter-form.tsx');
    expect(src).toMatch(/^'use client';/m);
    expect(src).toMatch(/Guardar capítulo/);
  });
  it('detalle: CTA Nuevo capítulo + Editar', () => {
    const src = read('page.tsx');
    expect(src).toMatch(/Nuevo capítulo/);
    expect(src).toMatch(/chapterEditHref/);
  });
});

describe('BOQ archive (4E.2B) — fixture solo lectura + fuente actions/UI', () => {
  it('fixture: archive/restore de capítulo e ítem ⇒ BoqWriteNotSupportedError', async () => {
    await expect(repo().archiveEstimateChapter(writer, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID)).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
    await expect(repo().restoreEstimateChapter(writer, DEMO_ESTIMATE_ID, DEMO_CHAPTER_ID)).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
    await expect(repo().archiveBoqItem(writer, DEMO_ESTIMATE_ID, DEMO_ITEM_ID)).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
    await expect(repo().restoreBoqItem(writer, DEMO_ESTIMATE_ID, DEMO_ITEM_ID)).rejects.toBeInstanceOf(BoqWriteNotSupportedError);
  });
  it('fixture: lecturas marcan archived=false (demo sin archivados)', async () => {
    const chs = await repo().listChaptersByEstimateVersion(reader, DEMO_ESTIMATE_ID, { includeArchived: true });
    expect(chs.every((c) => c.archived === false)).toBe(true);
    const its = await repo().listItemsByChapter(reader, DEMO_CHAPTER_ID, { includeArchived: true });
    expect(its.every((i) => i.archived === false)).toBe(true);
  });
  it('archive-actions: server, guard de modo + viewer; sin archived_by del navegador', () => {
    const src = read('archive-actions.ts');
    expect(src).toMatch(/^'use server';/m);
    expect(src).toMatch(/isCreationModeEnabled\(\)/);
    expect(src).toMatch(/resolveAuthenticatedViewer\(\)/);
    expect(src).toMatch(/archiveEstimateChapter\(|restoreEstimateChapter\(/);
    expect(src).toMatch(/archiveBoqItem\(|restoreBoqItem\(/);
    expect(src).not.toMatch(/formData\.get\('archived_by'\)/);
    expect(src).not.toMatch(/formData\.get\('organizationId'\)/);
  });
  it('archive-controls: client, confirm al archivar + Restaurar/Archivar', () => {
    const src = read('archive-controls.tsx');
    expect(src).toMatch(/^'use client';/m);
    expect(src).toMatch(/window\.confirm/);
    expect(src).toMatch(/Restaurar/);
    expect(src).toMatch(/Archivar/);
  });
  it('detalle: toggle Mostrar archivados + ArchiveControls', () => {
    const src = read('page.tsx');
    expect(src).toMatch(/Mostrar archivados/);
    expect(src).toMatch(/ArchiveControls/);
    expect(src).toMatch(/includeArchived/);
  });
});
