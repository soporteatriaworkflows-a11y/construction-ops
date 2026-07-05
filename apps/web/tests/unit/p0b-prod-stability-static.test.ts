import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const BOQ_WORKSPACE = read('../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/boq-workspace.tsx');
const BOQ_WORKSPACE_PAGE = read('../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx');
const APU_PAGE = read('../../app/(dashboard)/apu/page.tsx');
const CATALOG_PAGE = read('../../app/(dashboard)/catalog/page.tsx');
const READ_MODEL = read('../../server/read-model/drizzle-repository.ts');

describe('P0B production stability and admin APU actions', () => {
  it('keeps deep APU/BOQ actions explicit for existing edit-capable roles only', () => {
    expect(BOQ_WORKSPACE).toContain('{canEdit && (');
    expect(BOQ_WORKSPACE).toContain('Editar detalle');
    expect(BOQ_WORKSPACE).toContain('Ver vinculo');
    expect(BOQ_WORKSPACE).toContain('Abrir APU');
    expect(BOQ_WORKSPACE).toContain('href={`/apu/${item.apuTemplateId}`}');
  });

  it('does not reintroduce workspace fan-out for chapters/items or summary/AIU', () => {
    expect(BOQ_WORKSPACE_PAGE).toContain('for (const chapter of chapters)');
    expect(BOQ_WORKSPACE_PAGE).not.toContain('const data: WorkspaceChapterData[] = await Promise.all');
    expect(BOQ_WORKSPACE_PAGE).not.toContain('const [financialSummary, aiu] = await Promise.all');
  });

  it('keeps critical read-model page loads sequential under DB pressure', () => {
    expect(READ_MODEL).toContain('const chapters = await this.repo.chaptersByVersion(versionId);');
    expect(READ_MODEL).toContain('const resources = await this.repo.resources(viewer.organizationId);');
    expect(READ_MODEL).not.toContain('const [resources, observations] = await Promise.all');
  });

  it('preserves admin navigation/actions when APU or catalog data load fails', () => {
    expect(APU_PAGE).toContain('actions={actions}');
    expect(APU_PAGE).toContain('No pudimos cargar la biblioteca APU');
    expect(CATALOG_PAGE).toContain('actions={headerActions}');
    expect(CATALOG_PAGE).toContain('No pudimos cargar el cat');
    expect(CATALOG_PAGE).toContain('Intenta actualizar en unos segundos.');
  });
});
