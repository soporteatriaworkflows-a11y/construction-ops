/**
 * build-fixture.mjs — Regenera el fixture sanitizado FILA POR FILA desde el
 * Excel golden master real (NO versionado). Propiedad de agent-excel-mapper
 * (regenerado por el orquestador en la validación empírica de Oleada 1).
 *
 * Qué hace:
 *  - Lee `COTIZACION 1 PISO`: extrae los 14 capítulos reales y TODOS sus ítems
 *    (código, ítem, descripción de actividad, unidad, cantidad, vr. unitario,
 *    vr. parcial) tal como están en el Excel.
 *  - Lee `RESUMEN 1 PISO`: los 9 totales de regresión (E27..E35) y las tasas
 *    AIU/IVA (D28..D31), todo desde celdas reales (valores cacheados).
 *  - Reemplaza en el fixture: chapters, boqItems, indirectCostRules,
 *    estimateTotals. SIN ítem de balanceo artificial.
 *  - Sanitiza: NUNCA copia contratante/contratista/encargado/N° cotización ni
 *    nombres de personas/empresas (denylist + verificación de fugas).
 *
 * Uso (desde la raíz, con xlsx en apps/web):
 *   node scripts/golden-master/build-fixture.mjs "private/COT.ENTRE PATIOS 1 PISO (1).xlsx"
 *
 * SEGURIDAD: lee el Excel privado; el archivo de salida es SANITIZADO y sí es
 * versionable. El Excel original jamás se commitea (.gitignore cubre private/).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const require = createRequire(path.join(repoRoot, 'apps', 'web', 'package.json'));
const XLSX = require('xlsx');

const xlsxArg = process.argv[2] || 'private/COT.ENTRE PATIOS 1 PISO (1).xlsx';
const xlsxPath = path.isAbsolute(xlsxArg) ? xlsxArg : path.join(repoRoot, xlsxArg);
const fixturePath = path.join(repoRoot, 'scripts', 'fixtures', 'entre-patios-first-floor.fixture.json');

// Datos privados que NUNCA deben aparecer en el fixture.
const DENYLIST = ['ramirez', 'calderon', 'noraida', 'franco', 'guillermo', 'andres felipe', 'cot.20251129', 'entre patrios'];

function s(ws, addr) {
  const c = ws[addr];
  return c && c.v !== undefined && c.v !== null ? c.v : null;
}
function str12(n) { return String(n).padStart(12, '0'); }

const wb = XLSX.readFile(xlsxPath, { cellFormula: true });
const cot = wb.Sheets['COTIZACION 1 PISO'];
const res = wb.Sheets['RESUMEN 1 PISO'];

// ── 1) Capítulos + ítems reales desde COTIZACION 1 PISO ──────────────────────
const range = XLSX.utils.decode_range(cot['!ref']);
const chapters = [];
const boqItems = [];
let current = null;
let chapterIdx = 0;
let itemIdx = 0;
const EST_VERSION_ID = '00000000-0000-4000-8000-0000000000b1';

for (let r = 12; r <= range.e.r; r++) {
  const row = r + 1; // dirección Excel 1-indexed
  const A = s(cot, `A${row}`);
  const B = s(cot, `B${row}`);
  const C = s(cot, `C${row}`);
  const D = s(cot, `D${row}`);
  const E = s(cot, `E${row}`);
  const F = s(cot, `F${row}`);
  const G = s(cot, `G${row}`);

  const cText = typeof C === 'string' ? C.trim() : '';
  const isSubtotal = cText.toUpperCase().startsWith('SUBTOTAL');
  const isChapterHeader = !A && typeof B === 'number' && cText && (G === null || G === '');
  const isItem = typeof A === 'string' && A.trim() !== '' && typeof G === 'number';

  if (isChapterHeader) {
    chapterIdx += 1;
    current = {
      id: `0c000000-0000-4000-8000-${str12(chapterIdx)}`,
      estimateVersionId: EST_VERSION_ID,
      code: `CAP-${String(chapterIdx).padStart(2, '0')}`,
      name: cText,
      sortOrder: chapterIdx - 1,
      _excelChapterNo: B,
      _subtotal: null,
    };
    chapters.push(current);
  } else if (isSubtotal && current) {
    current._subtotal = typeof G === 'number' ? G : null;
    current = current; // se cierra al abrir el siguiente
  } else if (isItem && current) {
    itemIdx += 1;
    boqItems.push({
      id: `0b000000-0000-4000-8000-${str12(itemIdx)}`,
      estimateVersionId: EST_VERSION_ID,
      chapterId: current.id,
      apuTemplateId: null,
      quantityGroupId: null,
      code: B !== null ? String(B) : (A ? String(A) : String(itemIdx)),
      descriptionSnapshot: typeof C === 'string' ? C.trim() : '',
      unitSnapshot: typeof D === 'string' ? D.trim() : (D !== null ? String(D) : ''),
      quantitySnapshot: E !== null ? String(E) : '0',
      unitPriceSnapshot: F !== null ? String(F) : '0',
      subtotal: String(G),
      sortOrder: itemIdx - 1,
      notes: null,
    });
  }
}

// ── 2) Totales (9) y tasas AIU desde RESUMEN 1 PISO (celdas reales) ───────────
const estimateTotals = {
  costos_directos: String(s(res, 'E27')),
  administracion: String(s(res, 'E28')),
  imprevistos: String(s(res, 'E29')),
  utilidad: String(s(res, 'E30')),
  iva_sobre_utilidad: String(s(res, 'E31')),
  costos_indirectos: String(s(res, 'E32')),
  total_costo: String(s(res, 'E33')),
  area_construida: String(s(res, 'D35')),
  valor_m2: String(s(res, 'E35')),
};
const rates = { A: String(s(res, 'D28')), I: String(s(res, 'D29')), U: String(s(res, 'D30')), IVA: String(s(res, 'D31')) };

// ── 3) Verificaciones (sin ajustar nada) ─────────────────────────────────────
const Decimal = require('decimal.js').Decimal;
const D = Decimal.clone({ precision: 50 });
const sumItems = boqItems.reduce((acc, it) => acc.plus(new D(it.subtotal)), new D(0));
const diffDirectos = sumItems.minus(new D(estimateTotals.costos_directos)).abs();

// Verificación por capítulo: Σ ítems del capítulo ≈ subtotal del capítulo.
const chapterCheck = chapters.map((ch) => {
  const items = boqItems.filter((b) => b.chapterId === ch.id);
  const sum = items.reduce((acc, it) => acc.plus(new D(it.subtotal)), new D(0));
  const diff = ch._subtotal !== null ? sum.minus(new D(String(ch._subtotal))).abs() : null;
  return { code: ch.code, name: ch.name, items: items.length, sum: sum.toString(), subtotal: ch._subtotal, diff: diff ? diff.toString() : 'n/a' };
});

// ── 4) Leak check de privacidad ──────────────────────────────────────────────
const haystack = JSON.stringify({ chapters, boqItems }).toLowerCase();
const leaks = DENYLIST.filter((d) => haystack.includes(d));
if (leaks.length) {
  console.error(`[FALLO PRIVACIDAD] El fixture contendría datos privados: ${leaks.join(', ')}`);
  process.exit(3);
}

// ── 5) Reescribir el fixture preservando las demás secciones sanitizadas ──────
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
// limpiar campos internos de capítulos
const cleanChapters = chapters.map(({ _excelChapterNo, _subtotal, ...rest }) => rest);
fixture.chapters = cleanChapters;
fixture.boqItems = boqItems;
fixture.estimateTotals = estimateTotals;
fixture.indirectCostRules = [
  { id: '00000000-0000-4000-8000-0000000000f0', estimateVersionId: EST_VERSION_ID, code: 'A', name: 'Administración', percentage: rates.A, baseType: 'direct_cost', sortOrder: 0, visibleToClient: true },
  { id: '00000000-0000-4000-8000-0000000000f1', estimateVersionId: EST_VERSION_ID, code: 'I', name: 'Imprevistos', percentage: rates.I, baseType: 'direct_cost', sortOrder: 1, visibleToClient: true },
  { id: '00000000-0000-4000-8000-0000000000f2', estimateVersionId: EST_VERSION_ID, code: 'U', name: 'Utilidad', percentage: rates.U, baseType: 'direct_cost', sortOrder: 2, visibleToClient: true },
  { id: '00000000-0000-4000-8000-0000000000f3', estimateVersionId: EST_VERSION_ID, code: 'IVA', name: 'IVA sobre utilidad', percentage: rates.IVA, baseType: 'utility', sortOrder: 3, visibleToClient: true },
];
fixture.meta.fixtureVersion = '2.0.0';
fixture.meta.boqProvenance = 'BOQ real fila por fila extraído de COTIZACION 1 PISO (14 capítulos). Totales de RESUMEN 1 PISO (E27..E35). Tasas AIU de D28..D31. SIN ítem de balanceo artificial.';
fixture.meta.cellCoordinates = {
  costos_directos: 'RESUMEN 1 PISO!E27 =SUM(E13:E26)',
  administracion: 'RESUMEN 1 PISO!E28 =E27*D28',
  imprevistos: 'RESUMEN 1 PISO!E29 =E27*D29',
  utilidad: 'RESUMEN 1 PISO!E30 =E27*D30',
  iva_sobre_utilidad: 'RESUMEN 1 PISO!E31 =E30*D31',
  costos_indirectos: 'RESUMEN 1 PISO!E32 =SUM(E28:E31)',
  total_costo: 'RESUMEN 1 PISO!E33 =E32+E27',
  area_construida: 'CANTIDADES 1 PISO!I187 -> COTIZACION 1 PISO!E45 -> RESUMEN 1 PISO!D35',
  valor_m2: 'RESUMEN 1 PISO!E35 =E33/D35',
};
delete fixture.meta.representativeSampleNote;
fixture.meta.sanitizationNotes = 'Contratante, contratista, encargado y N° de cotización del Excel NO se copian. Descripciones = actividades de obra (no son datos personales). Denylist verificada sin fugas.';

fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

// ── 6) Reporte ───────────────────────────────────────────────────────────────
console.log(`Capítulos: ${chapters.length} | Ítems BOQ: ${boqItems.length}`);
for (const c of chapterCheck) {
  console.log(`  ${c.code} "${c.name}" items=${c.items} Σ=${c.sum} subtotal=${c.subtotal} diff=${c.diff}`);
}
console.log(`Σ ítems BOQ = ${sumItems.toString()}`);
console.log(`costos_directos (§3.4) = ${estimateTotals.costos_directos}`);
console.log(`|Σítems - costos_directos| = ${diffDirectos.toString()} (tolerancia 0.01)`);
console.log(`Leak check privacidad: OK (sin coincidencias en denylist)`);
console.log(`Fixture escrito: ${path.relative(repoRoot, fixturePath)}`);
