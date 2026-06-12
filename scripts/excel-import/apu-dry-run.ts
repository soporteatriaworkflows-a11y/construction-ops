/**
 * apu-dry-run.ts — Dry-run LOCAL del parser estructurado de la hoja APU
 * (ENTRE_PATIOS_APU_IMPORT_V1). NO escribe en base de datos; NO sube nada.
 *
 * Uso (desde la raíz del repo; requiere el workbook privado local):
 *   pnpm --filter web exec tsx ../../scripts/excel-import/apu-dry-run.ts
 *   pnpm --filter web exec tsx ../../scripts/excel-import/apu-dry-run.ts -- --file "..\\..\\private\\COT.ENTRE PATIOS 1 PISO (1).xlsx"
 *
 * El workbook es PRIVADO (gitignored). Este script solo imprime un resumen
 * sanitizable en consola para validación humana del parseo y el recálculo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseApuWorkbook } from '@/server/apu-import/parse-workbook';
import { parseApuSheet } from '@/server/apu-import/parse-apu-sheet';
import { buildApuImportPreview } from '@/server/apu-import/preview';

const DEFAULT_RELATIVE = path.join('..', '..', 'private', 'COT.ENTRE PATIOS 1 PISO (1).xlsx');

function resolveFileArg(): string {
  const idx = process.argv.indexOf('--file');
  const arg = idx >= 0 ? process.argv[idx + 1] : undefined;
  return path.resolve(process.cwd(), arg ?? DEFAULT_RELATIVE);
}

async function main(): Promise<void> {
  const filePath = resolveFileArg();
  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    console.error(`[STOP] Workbook no disponible localmente: ${filePath}`);
    console.error('Coloca el golden master en private/ (no se versiona) e intenta de nuevo.');
    process.exitCode = 1;
    return;
  }

  const sheet = parseApuWorkbook(buffer, path.basename(filePath));
  const parsed = parseApuSheet(sheet.grid, sheet.lastRow);

  // --with-fixture-boq: evalúa el linking contra el fixture sanitizado local
  // (131 boq_items reales) SIN base de datos.
  let boqCandidates: import('@/server/apu-import/preview').BoqCandidateItem[] | null = null;
  if (process.argv.includes('--with-fixture-boq')) {
    const fixturePath = path.resolve(
      process.cwd(),
      path.join('..', '..', 'scripts', 'fixtures', 'entre-patios-first-floor.fixture.json'),
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      boqItems: Array<{
        id: string;
        code: string;
        descriptionSnapshot: string;
        unitSnapshot: string;
        apuTemplateId: string | null;
      }>;
    };
    boqCandidates = fixture.boqItems.map((item) => ({
      id: item.id,
      code: item.code,
      description: item.descriptionSnapshot,
      unit: item.unitSnapshot,
      apuTemplateId: item.apuTemplateId,
    }));
  }

  const { preview } = buildApuImportPreview({
    fileName: path.basename(filePath),
    sheetName: sheet.sheetName,
    digest: sheet.digest,
    parsed,
    identifiers: [],
    existingLaborRoles: [],
    existingApuCodes: new Set(),
    baselinePrices: new Map(),
    linkVersionId: null,
    boqCandidates,
  });

  console.log('— APU DRY-RUN (local, sin escritura) —');
  console.log(`Hoja: ${sheet.sheetName} · filas: ${sheet.lastRow} · digest: ${sheet.digest.slice(0, 16)}…`);
  console.log(`Errores de hoja: ${parsed.errors.length}`, parsed.errors);
  console.log(`Advertencias de hoja: ${parsed.warnings.length}`);

  console.log('\nROLES SALARIALES:');
  for (const role of preview.laborRoles) {
    console.log(
      `  ${role.role.padEnd(9)} bloque="${role.blockLabel}" horaExcel=${role.hourlyExcel} horaRecalc=${role.hourlyRecalculated} acción=${role.action} warns=${role.warnings.length}`,
    );
  }

  const t = preview.totals;
  console.log('\nTOTALES:');
  console.log(
    `  actividades=${t.activities} componentes=${t.components} listas=${t.readyToImport} omitidas=${t.omitted} existentes=${t.skippedExisting}`,
  );
  console.log(
    `  matching: exact=${t.exactMatches} sugeridos=${t.suggested} sinResolver=${t.unresolved} ambiguos=${t.ambiguous}`,
  );
  console.log(`  advertencias=${t.warnings} erroresCríticos=${t.criticalErrors}`);

  const repeated = new Map<string, number>();
  for (const a of preview.activities) {
    repeated.set(a.visibleCode, Math.max(repeated.get(a.visibleCode) ?? 0, a.occurrenceIndex));
  }
  const dupes = [...repeated.entries()].filter(([, n]) => n > 1);
  console.log(`\nCÓDIGOS VISIBLES REPETIDOS (${dupes.length}):`);
  for (const [code, n] of dupes) console.log(`  ${code} ×${n}`);

  const toolPcts = new Map<string, number>();
  for (const a of preview.activities) {
    toolPcts.set(a.defaultToolPct, (toolPcts.get(a.defaultToolPct) ?? 0) + 1);
  }
  console.log('\nHERRAMIENTA DERIVADA (default_tool_pct → actividades):');
  for (const [pct, n] of [...toolPcts.entries()].sort()) console.log(`  ${pct} → ${n}`);

  const withDelta = preview.activities.filter(
    (a) => a.costDelta !== null && Math.abs(Number(a.costDelta)) > 0.01,
  );
  console.log(`\nACTIVIDADES CON DIFERENCIA RECALC vs EXCEL > 0.01: ${withDelta.length}`);
  for (const a of withDelta.slice(0, 12)) {
    console.log(
      `  ${a.key.padEnd(14)} excel=${a.excelTotal} recalc=${a.recalculatedTotal} Δ=${a.costDelta}`,
    );
  }

  const errored = preview.activities.filter((a) => a.status === 'error');
  console.log(`\nACTIVIDADES EN ERROR (${errored.length}):`);
  for (const a of errored) console.log(`  ${a.key}: ${a.errors[0] ?? ''}`);

  if (boqCandidates !== null) {
    const linkCounts = new Map<string, number>();
    for (const a of preview.activities) {
      linkCounts.set(a.boqLink.status, (linkCounts.get(a.boqLink.status) ?? 0) + 1);
    }
    console.log('\nLINKING BOQ (contra fixture local, 131 ítems):');
    for (const [status, n] of [...linkCounts.entries()].sort()) console.log(`  ${status} → ${n}`);
  }

  console.log('\nMUESTRA (primeras 5 actividades):');
  for (const a of preview.activities.slice(0, 5)) {
    console.log(
      `  ${a.key.padEnd(10)} "${a.description.slice(0, 44)}" unidad=${a.rawUnit} comp=${a.componentCount} tool=${a.defaultToolPct} excel=${a.excelTotal} recalc=${a.recalculatedTotal}`,
    );
  }
}

void main();
