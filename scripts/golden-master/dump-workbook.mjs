/**
 * dump-workbook.mjs — Volcado estructural del Excel golden master.
 *
 * Propiedad de agent-excel-mapper. Herramienta de ingeniería inversa:
 * NO modifica el Excel. Solo lee y produce un reporte estructural en
 * stdout (y opcionalmente un JSON) con:
 *   - lista de hojas y rango usado (!ref)
 *   - por cada celda: dirección, tipo, valor calculado, fórmula (si la hay)
 *   - conteo de fórmulas, celdas input (sin fórmula) y derivadas (con fórmula)
 *   - referencias cruzadas detectadas (nombres de hoja citados en fórmulas)
 *
 * Uso (desde la raíz del repo, con xlsx instalado en apps/web):
 *   node scripts/golden-master/dump-workbook.mjs "private/COT.ENTRE PATIOS 1 PISO (1).xlsx"
 *   node scripts/golden-master/dump-workbook.mjs <ruta> --json out.json
 *   node scripts/golden-master/dump-workbook.mjs <ruta> --sheet "RESUMEN 1 PISO"
 *
 * Resolución de xlsx: se carga desde apps/web/node_modules (allí está
 * instalado, según docs/DECISIONS.md). El script es ESM (.mjs).
 *
 * SEGURIDAD: este script lee el Excel privado. NUNCA debe commitearse su
 * salida cruda sin sanitizar. El JSON resultante puede contener datos
 * privados y por tanto NO debe escribirse dentro de scripts/fixtures/ sin
 * sanitizar (queda fuera del alcance versionable).
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Cargar xlsx desde apps/web/node_modules (donde está instalado).
const require = createRequire(path.join(repoRoot, 'apps', 'web', 'package.json'));
let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  // Fallback: resolución estándar (monorepo hoisting).
  const requireRoot = createRequire(path.join(repoRoot, 'package.json'));
  XLSX = requireRoot('xlsx');
}

function parseArgs(argv) {
  const args = { file: null, json: null, sheet: null, maxCells: Infinity };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json') args.json = rest[++i];
    else if (a === '--sheet') args.sheet = rest[++i];
    else if (a === '--max') args.maxCells = Number(rest[++i]);
    else if (!args.file) args.file = a;
  }
  if (!args.file) {
    args.file = path.join(repoRoot, 'private', 'COT.ENTRE PATIOS 1 PISO (1).xlsx');
  } else if (!path.isAbsolute(args.file)) {
    args.file = path.join(repoRoot, args.file);
  }
  return args;
}

/** Detecta nombres de hoja referenciados en una fórmula (refs cruzadas). */
function crossSheetRefs(formula, sheetNames) {
  const found = new Set();
  if (!formula) return found;
  for (const name of sheetNames) {
    // Hoja con espacios viaja entre comillas simples: 'RESUMEN 1 PISO'!
    const quoted = `'${name}'!`;
    const plain = `${name}!`;
    if (formula.includes(quoted) || formula.includes(plain)) found.add(name);
  }
  return found;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.file)) {
    console.error(`[ERROR] No existe el archivo: ${args.file}`);
    process.exit(2);
  }
  const wb = XLSX.readFile(args.file, { cellFormula: true, cellNF: true });
  const sheetNames = wb.SheetNames;

  const report = { file: path.basename(args.file), sheets: [] };

  for (const name of sheetNames) {
    if (args.sheet && name !== args.sheet) continue;
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    let formulas = 0;
    let inputs = 0;
    let empty = 0;
    const cells = [];
    const crossRefs = new Set();

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) { empty++; continue; }
        const hasFormula = typeof cell.f === 'string' && cell.f.length > 0;
        if (hasFormula) {
          formulas++;
          for (const x of crossSheetRefs(cell.f, sheetNames)) crossRefs.add(x);
        } else if (cell.v !== undefined && cell.v !== null && cell.v !== '') {
          inputs++;
        } else {
          empty++;
        }
        if (cells.length < args.maxCells) {
          cells.push({
            addr,
            t: cell.t, // tipo: n, s, b, d, e
            v: cell.v, // valor calculado
            f: hasFormula ? cell.f : undefined,
          });
        }
      }
    }

    report.sheets.push({
      name,
      ref,
      rows: range.e.r - range.s.r + 1,
      cols: range.e.c - range.s.c + 1,
      counts: { formulas, inputs, empty },
      crossSheetRefs: [...crossRefs].filter((x) => x !== name),
      cells,
    });
  }

  if (args.json) {
    const outPath = path.isAbsolute(args.json) ? args.json : path.join(repoRoot, args.json);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.error(`[OK] JSON escrito en ${outPath} (puede contener datos privados; NO commitear sin sanitizar).`);
  }

  // Resumen legible por stdout (sin volcar valores → seguro de mostrar).
  console.log(`Workbook: ${report.file}`);
  console.log(`Hojas (${report.sheets.length}):`);
  for (const s of report.sheets) {
    console.log(
      `  - ${s.name.padEnd(26)} ref=${s.ref.padEnd(10)} ` +
        `formulas=${s.counts.formulas} inputs=${s.counts.inputs} ` +
        `refs->[${s.crossSheetRefs.join(', ')}]`,
    );
  }
}

main();
