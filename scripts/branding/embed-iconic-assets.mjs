/**
 * embed-iconic-assets.mjs — Genera el módulo de logos EMBEBIDOS (4E.1C).
 *
 * Lee los PNG oficiales de GRUPO ICONIC y produce
 * `apps/web/server/estimates/export/logo-asset.ts` con los data URI en base64,
 * de modo que los exports NO lean el sistema de archivos en runtime
 * (serverless-safe; el módulo generado se versiona).
 *
 * Uso (desde la raíz del repo):
 *   node scripts/branding/embed-iconic-assets.mjs
 *
 * Regenerar cuando cambien los logos. No registra cadenas base64.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const ASSETS = {
  full: join(repoRoot, 'apps/web/public/branding/iconic/grupo-iconic-logo-full.png'),
  symbol: join(repoRoot, 'apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png'),
};
const OUT = join(repoRoot, 'apps/web/server/estimates/export/logo-asset.ts');

function toDataUri(path) {
  if (!existsSync(path)) {
    throw new Error(`Asset oficial no encontrado: ${path}`);
  }
  const buf = readFileSync(path);
  if (buf.byteLength === 0) throw new Error(`Asset vacío: ${path}`);
  // Validación mínima de PNG (firma 89 50 4E 47).
  const sig = buf.subarray(0, 4).toString('hex');
  if (sig !== '89504e47') throw new Error(`No es PNG válido: ${path} (firma ${sig})`);
  return { dataUri: `data:image/png;base64,${buf.toString('base64')}`, bytes: buf.byteLength };
}

const full = toDataUri(ASSETS.full);
const symbol = toDataUri(ASSETS.symbol);

const banner = `/**
 * logo-asset.ts — GENERADO AUTOMÁTICAMENTE. NO EDITAR A MANO.
 *
 * Logos oficiales de GRUPO ICONIC embebidos en base64 (data URI) para los
 * exports (4E.1C). Vía serverless-safe: el asset viaja BUNDLED con la función,
 * sin \`fs\` ni \`outputFileTracingIncludes\` en runtime.
 *
 * Regenerar:  node scripts/branding/embed-iconic-assets.mjs
 * Fuentes:    apps/web/public/branding/iconic/grupo-iconic-logo-{full,symbol}.png
 */`;

const body = `${banner}

/** Logo completo (mark + "GRUPO ICONIC"). Encabezado PDF / hoja RESUMEN. */
export const ICONIC_LOGO_FULL_DATA_URI =
  '${full.dataUri}';

/** Símbolo (marca compacta). Footer PDF / zonas secundarias. */
export const ICONIC_LOGO_SYMBOL_DATA_URI =
  '${symbol.dataUri}';

/** Compatibilidad: alias del logo completo (consumo histórico). */
export const ICONIC_LOGO_BASE64 = '';
`;

writeFileSync(OUT, body, 'utf8');

// No se imprime ninguna cadena base64; solo metadatos.
console.log('[embed-iconic-assets] OK');
console.log(`  full   = ${full.bytes} bytes  -> ICONIC_LOGO_FULL_DATA_URI`);
console.log(`  symbol = ${symbol.bytes} bytes  -> ICONIC_LOGO_SYMBOL_DATA_URI`);
console.log(`  out    = ${OUT}`);
