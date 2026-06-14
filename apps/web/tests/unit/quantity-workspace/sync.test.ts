/**
 * sync.test.ts — Preview PURO de sincronización Cantidad → BOQ (§4).
 * Cubre: preview sin escritura, bloqueo de versión emitida, crear vs actualizar,
 * antes/después/diferencia, advertencias.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBoqSyncPreview,
  summarizeSyncPreview,
  isEditableVersion,
  type SyncLineInput,
} from '@/server/quantity-workspace/sync';

const line = (over: Partial<SyncLineInput> = {}): SyncLineInput => ({
  workspaceLineId: 'wl-1',
  description: 'Muro board',
  resultNet: '12',
  resultUnit: 'm²',
  apuTemplateId: 'apu-1',
  boqItemId: null,
  apuHasComponents: true,
  ...over,
});

describe('isEditableVersion', () => {
  it('draft/review editables; approved/issued/archived bloqueadas', () => {
    expect(isEditableVersion('draft')).toBe(true);
    expect(isEditableVersion('review')).toBe(true);
    expect(isEditableVersion('approved')).toBe(false);
    expect(isEditableVersion('issued')).toBe(false);
    expect(isEditableVersion('archived')).toBe(false);
  });
});

describe('buildBoqSyncPreview — crear ítem nuevo', () => {
  it('propone crear con antes=0, después=resultNet, diferencia', () => {
    const r = buildBoqSyncPreview(line(), { versionStatus: 'draft', chapterId: 'ch-1' });
    expect(r.action).toBe('create');
    expect(r.quantityBefore).toBe('0');
    expect(r.quantityAfter).toBe('12');
    expect(r.difference).toBe('12');
    expect(r.blocked).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it('advierte y bloquea si no hay APU vinculado', () => {
    const r = buildBoqSyncPreview(line({ apuTemplateId: null }), {
      versionStatus: 'draft',
      chapterId: 'ch-1',
    });
    expect(r.warnings).toContain('no_apu');
    expect(r.blocked).toBe(true);
  });

  it('advierte y bloquea si no hay capítulo destino', () => {
    const r = buildBoqSyncPreview(line(), { versionStatus: 'draft', chapterId: null });
    expect(r.warnings).toContain('no_chapter');
    expect(r.blocked).toBe(true);
  });

  it('advierte (no bloquea) si el APU está incompleto', () => {
    const r = buildBoqSyncPreview(line({ apuHasComponents: false }), {
      versionStatus: 'draft',
      chapterId: 'ch-1',
    });
    expect(r.warnings).toContain('apu_incomplete');
    expect(r.blocked).toBe(false);
  });
});

describe('buildBoqSyncPreview — actualizar ítem editable', () => {
  it('propone actualizar mostrando antes/después/diferencia', () => {
    const r = buildBoqSyncPreview(line({ boqItemId: 'bi-1', resultNet: '15' }), {
      versionStatus: 'draft',
      chapterId: null,
      existing: { quantitySnapshot: '10' },
    });
    expect(r.action).toBe('update');
    expect(r.quantityBefore).toBe('10');
    expect(r.quantityAfter).toBe('15');
    expect(r.difference).toBe('5');
    expect(r.blocked).toBe(false);
  });

  it('bloquea si el ítem vinculado ya no existe', () => {
    const r = buildBoqSyncPreview(line({ boqItemId: 'bi-x' }), {
      versionStatus: 'draft',
      chapterId: null,
      existing: null,
    });
    expect(r.warnings).toContain('linked_item_missing');
    expect(r.blocked).toBe(true);
  });
});

describe('buildBoqSyncPreview — versión emitida (inmutable)', () => {
  it('bloquea toda escritura en versión emitida', () => {
    for (const status of ['approved', 'issued', 'archived'] as const) {
      const r = buildBoqSyncPreview(line({ boqItemId: 'bi-1' }), {
        versionStatus: status,
        chapterId: null,
        existing: { quantitySnapshot: '10' },
      });
      expect(r.blocked).toBe(true);
      expect(r.action).toBe('blocked');
      expect(r.warnings).toContain('version_locked');
    }
  });
});

describe('summarizeSyncPreview', () => {
  it('cuenta creates/updates/bloqueados y marca versión bloqueada', () => {
    const rows = [
      buildBoqSyncPreview(line(), { versionStatus: 'draft', chapterId: 'ch-1' }),
      buildBoqSyncPreview(line({ boqItemId: 'bi-1', resultNet: '9' }), {
        versionStatus: 'draft',
        chapterId: null,
        existing: { quantitySnapshot: '8' },
      }),
      buildBoqSyncPreview(line({ apuTemplateId: null }), {
        versionStatus: 'draft',
        chapterId: 'ch-1',
      }),
    ];
    const s = summarizeSyncPreview(rows, 'draft');
    expect(s.total).toBe(3);
    expect(s.creates).toBe(1);
    expect(s.updates).toBe(1);
    expect(s.blockedCount).toBe(1);
    expect(s.versionLocked).toBe(false);
  });
});
