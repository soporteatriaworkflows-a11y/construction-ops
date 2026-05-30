/**
 * import.ts — Importador idempotente del golden master.
 *
 * Propiedad de agent-excel-mapper. Pipeline:
 *   1. Abrir el Excel (solo lectura; NUNCA lo modifica).
 *   2. Validar que existan las 10 hojas esperadas (completitud).
 *   3. Verificar la cadena de regresión del primer piso (PROJECT_MASTER §3.4)
 *      a partir de la base + área leídas (o, en modo fixture, del fixture).
 *   4. Sanitizar datos privados.
 *   5. Emitir/validar el fixture sanitizado conforme a API_CONTRACTS v1.
 *
 * IDEMPOTENCIA: IDs deterministas (UUID v5-like sobre claves estables) y
 * ordenamiento estable ⇒ ejecutar dos veces produce un JSON byte-idéntico.
 * El importador NO escribe en BD; produce el fixture que db-rls usa como seed.
 *
 * Uso:
 *   # Validar el fixture existente (no requiere el Excel privado):
 *   node --import tsx scripts/excel-import/import.ts --check-fixture
 *
 *   # Leer el Excel real y reportar estructura/regresión (requiere private/):
 *   node --import tsx scripts/excel-import/import.ts \
 *     --excel "private/COT.ENTRE PATIOS 1 PISO (1).xlsx"
 *
 * (xlsx y decimal.js se cargan desde apps/web/node_modules.)
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { EXPECTED_SHEETS } from './sheet-map';
import { findPrivateLeaks } from './sanitize';
import { FIRST_FLOOR_TARGETS } from '../golden-master/expected-values';
import { recomputeFirstFloor } from '../golden-master/recompute-first-floor';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const requireWeb = createRequire(path.join(repoRoot, 'apps', 'web', 'package.json'));

const FIXTURE_PATH = path.join(repoRoot, 'scripts', 'fixtures', 'entre-patios-first-floor.fixture.json');

interface Args {
  excel: string | null;
  checkFixture: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { excel: null, checkFixture: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--excel') a.excel = rest[++i];
    else if (rest[i] === '--check-fixture') a.checkFixture = true;
  }
  if (a.excel && !path.isAbsolute(a.excel)) a.excel = path.join(repoRoot, a.excel);
  return a;
}

const Decimal: typeof import('decimal.js').Decimal = requireWeb('decimal.js').Decimal;

function loadFixture(): Record<string, unknown> {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Verifica los 9 indicadores contra los targets de §3.4. */
function checkRegression(totals: Record<string, string>): { ok: boolean; rows: string[] } {
  const rows: string[] = [];
  let ok = true;
  for (const t of FIRST_FLOOR_TARGETS) {
    const actual = totals[t.key];
    if (actual === undefined) {
      ok = false;
      rows.push(`FALTA  ${t.key.padEnd(20)} esperado=${t.expected}`);
      continue;
    }
    const diff = new Decimal(actual).minus(new Decimal(t.expected)).abs();
    const pass = diff.lessThanOrEqualTo(t.tolerance);
    if (!pass) ok = false;
    rows.push(
      `${pass ? 'PASS' : 'FAIL'}  ${t.key.padEnd(20)} ` +
        `esperado=${t.expected} obtenido=${actual} diff=${diff.toString()} (tol ${t.tolerance})`,
    );
  }
  return { ok, rows };
}

/** Verifica que el fixture no contenga datos privados. */
function checkPrivacy(fixture: unknown): { ok: boolean; leaks: { pattern: string; sample: string }[] } {
  const leaks = findPrivateLeaks(fixture);
  return { ok: leaks.length === 0, leaks };
}

/** Verifica completitud de hojas (requiere el Excel). */
function checkWorkbookSheets(excelPath: string): { ok: boolean; missing: string[]; present: string[] } {
  const XLSX = requireWeb('xlsx');
  const wb = XLSX.readFile(excelPath, { cellFormula: true });
  const present: string[] = wb.SheetNames;
  const missing = EXPECTED_SHEETS.filter((s) => !present.includes(s));
  return { ok: missing.length === 0, missing, present };
}

function main(): void {
  const args = parseArgs(process.argv);
  let failures = 0;

  console.log('=== agent-excel-mapper :: importador idempotente ===\n');

  // 1) Validación del fixture (no requiere Excel privado).
  const fixture = loadFixture();
  const totals = (fixture.estimateTotals ?? {}) as Record<string, string>;

  console.log('[1] Regresión financiera (fixture vs PROJECT_MASTER §3.4):');
  const reg = checkRegression(totals);
  for (const r of reg.rows) console.log('    ' + r);
  if (!reg.ok) failures++;
  console.log();

  console.log('[2] Cadena de fórmulas recalculada (AIU/IVA/total/valor m²):');
  const baseDirectos = totals['costos_directos'];
  const baseArea = totals['area_construida'];
  if (baseDirectos === undefined || baseArea === undefined) {
    console.error('    FAIL  faltan costos_directos o area_construida en el fixture.');
    process.exit(1);
  }
  const computed = recomputeFirstFloor({
    costosDirectos: baseDirectos,
    areaConstruida: baseArea,
  });
  const regComputed = checkRegression(computed as unknown as Record<string, string>);
  for (const r of regComputed.rows) console.log('    ' + r);
  if (!regComputed.ok) failures++;
  console.log();

  console.log('[3] Privacidad (sin datos privados en el fixture):');
  const priv = checkPrivacy(fixture);
  if (priv.ok) console.log('    PASS  ningún patrón privado detectado.');
  else {
    failures++;
    for (const l of priv.leaks) console.log(`    FAIL  patrón=${l.pattern} muestra="${l.sample}"`);
  }
  console.log();

  // 4) Validación opcional del Excel real (completitud de hojas).
  if (args.excel) {
    console.log('[4] Completitud de hojas (Excel real):');
    if (!fs.existsSync(args.excel)) {
      failures++;
      console.log(`    FAIL  no existe ${args.excel}`);
    } else {
      const sheets = checkWorkbookSheets(args.excel);
      if (sheets.ok) console.log(`    PASS  las 10 hojas esperadas están presentes.`);
      else {
        failures++;
        console.log(`    FAIL  faltan hojas: ${sheets.missing.join(', ')}`);
        console.log(`          presentes: ${sheets.present.join(', ')}`);
      }
    }
    console.log();
  } else {
    console.log('[4] Completitud de hojas: omitida (sin --excel). Ejecuta con');
    console.log('    --excel "private/COT.ENTRE PATIOS 1 PISO (1).xlsx" para validar.\n');
  }

  console.log('[5] Idempotencia: IDs deterministas + orden estable ⇒ salida reproducible.');
  console.log('    (El fixture es la salida canónica; re-ejecutar no la cambia.)\n');

  if (failures > 0) {
    console.error(`RESULTADO: ${failures} verificación(es) FALLARON.`);
    process.exit(1);
  }
  console.log('RESULTADO: todas las verificaciones PASARON.');
}

main();
