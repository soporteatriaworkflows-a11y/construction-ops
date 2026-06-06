/**
 * review-route-config.test.ts — Guardas de fuente de la UI de revisión (4D.1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(here, '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]');
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');

describe('detalle de presupuesto — tabla de capítulos (4D.1)', () => {
  const source = read('page.tsx');
  it('lista capítulos reales con listChaptersByEstimateVersion cuando hay contenido', () => {
    expect(source).toMatch(/listChaptersByEstimateVersion\(/);
    expect(source).toMatch(/hasContent/);
  });
  it('enlaza al detalle del capítulo (Ver detalle → chapters/[chapterId])', () => {
    expect(source).toMatch(/chapters\/\$\{/);
    expect(source).toMatch(/Ver detalle/);
  });
  it('indicador discreto "normalizado" cuando source_code ≠ code', () => {
    expect(source).toMatch(/ch\.sourceCode\s*!==\s*ch\.code/);
    expect(source).toMatch(/normalizado/);
  });
});

describe('detalle de capítulo + ítems BOQ (4D.1)', () => {
  const source = read('chapters/[chapterId]/page.tsx');
  it('viewer real + getChapterById + listItemsByChapter + notFound', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/getChapterById\(/);
    expect(source).toMatch(/listItemsByChapter\(/);
    expect(source).toMatch(/notFound\(\)/);
  });
  it('verifica pertenencia del capítulo al presupuesto/proyecto de la ruta', () => {
    expect(source).toMatch(/chapter\.estimateId\s*!==\s*estimateId/);
    expect(source).toMatch(/chapter\.projectId\s*!==\s*id/);
  });
  it('tabla de ítems con código/descripción/unidad/cantidad/precio/subtotal', () => {
    expect(source).toMatch(/Descripci[óo]n/);
    expect(source).toMatch(/Subtotal/);
    expect(source).toMatch(/it\.unitPrice/);
  });
  it('trazabilidad secundaria (código normalizado/original)', () => {
    expect(source).toMatch(/sourceCode/);
    expect(source).toMatch(/C[óo]digo normalizado/);
  });
});
