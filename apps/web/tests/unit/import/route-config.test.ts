/**
 * route-config.test.ts — Guardas a nivel de fuente de la UI/flujo de importación (4C.1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(
  here,
  '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]',
);
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');

describe('detalle de presupuesto — sección Importar Excel', () => {
  const source = read('page.tsx');
  it('ya NO muestra el placeholder de "siguiente fase"', () => {
    expect(source).not.toMatch(/importaci[óo]n del Excel estar[áa] disponible en la siguiente fase/i);
  });
  it('muestra estado vacío + CTA Importar Excel (Button asChild + Link a /import)', () => {
    expect(source).toMatch(/V01 todav[ií]a no contiene cap[ií]tulos ni [íi]tems/);
    expect(source).toMatch(/<Button\s+asChild[^>]*>\s*<Link\s+href=\{importHref\}>/);
  });
  it('muestra estado "Importación completada" y bloquea reimportación', () => {
    expect(source).toMatch(/Importaci[óo]n completada/);
    expect(source).toMatch(/reimportaci[óo]n[\s\S]*?fase posterior/i);
  });
  it('muestra el total directo', () => {
    expect(source).toMatch(/directTotal/);
  });
});

describe('página de importación — request-time + guardas', () => {
  const source = read('import/page.tsx');
  it('force-dynamic + resolveViewer + valida estimate visible', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/getEstimateById\(/);
  });
  it('bloquea si la versión ya tiene contenido (mensaje honesto)', () => {
    expect(source).toMatch(/getEstimateImportStatus\(/);
    expect(source).toMatch(/ya contiene informaci[óo]n/i);
  });
});

describe('flujo cliente de importación', () => {
  const source = read('import/import-flow.tsx');
  it('es client component y maneja el File en estado (sin persistir)', () => {
    expect(source).toMatch(/^'use client';/m);
    expect(source).toMatch(/useState<File \| null>/);
  });
  it('dos pasos: previewExcelImportAction y confirmExcelImportAction', () => {
    expect(source).toMatch(/previewExcelImportAction/);
    expect(source).toMatch(/confirmExcelImportAction/);
  });
  it('reenvía el digest del preview en la confirmación', () => {
    expect(source).toMatch(/fd\.set\('digest', preview\.digest\)/);
  });
  it('bloquea doble submit con isPending/transition', () => {
    expect(source).toMatch(/useTransition/);
    expect(source).toMatch(/disabled=\{[^}]*pending/);
  });
  it('sección "Revisar numeración" editable + Revalidar + envío de overrides (4C.3)', () => {
    expect(source).toMatch(/Revisar numeración/);
    expect(source).toMatch(/preview\.mappings\.map/);
    expect(source).toMatch(/Revalidar/);
    expect(source).toMatch(/fd\.set\('overrides'/);
    expect(source).toMatch(/setOverrides/);
  });
});

describe('actions de importación — seguridad', () => {
  const source = read('import/actions.ts');
  it("'use server' + guard de modo + viewer autenticado", () => {
    expect(source).toMatch(/^'use server';/m);
    expect(source).toMatch(/isCreationModeEnabled\(\)/);
    expect(source).toMatch(/resolveAuthenticatedViewer\(\)/);
  });
  it('confirma comparando digest (no confía en datos del cliente)', () => {
    expect(source).toMatch(/confirmEstimateExcelImport\(/);
    expect(source).toMatch(/digest/);
  });
});
