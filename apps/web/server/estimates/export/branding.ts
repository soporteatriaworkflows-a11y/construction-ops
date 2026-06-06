/**
 * branding.ts — Identidad visual GRUPO ICONIC para los exports (4E.1C). ÚNICA FUENTE.
 *
 * Paleta oficial + metadatos + logos oficiales embebidos. Branding puramente
 * visual: no cambia contenido estructural, finanzas, importación, AIU, capítulos
 * ni ítems. Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §13`.
 *
 * Logos: se consumen EMBEBIDOS en base64 desde `logo-asset.ts` (generado por
 * `scripts/branding/embed-iconic-assets.mjs`), SIN `fs` en runtime (serverless-safe).
 * Fuentes: `apps/web/public/branding/iconic/grupo-iconic-logo-{full,symbol}.png`.
 * Sin asset (solo desarrollo) ⇒ monograma textual; nunca esperado en producción.
 *
 * SIN DORADO: el acento es el cian ICONIC. No introducir dorado sin aprobación.
 */
import { ICONIC_LOGO_FULL_DATA_URI, ICONIC_LOGO_SYMBOL_DATA_URI } from './logo-asset';

/**
 * Paleta oficial de exports ICONIC (guía `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf`).
 * FUENTE ÚNICA DE VERDAD. No usar colores genéricos ni dorado.
 */
export const ICONIC_EXPORT_PALETTE = {
  primaryBlue: '#005DD6',
  cyanAccent: '#00B8FF',
  deepNavy: '#020148',
  graphite: '#1B1F3E',
  softBlueGray: '#C7DCED',
  lightGray: '#F2F4F7',
  white: '#FFFFFF',
} as const;

/** Roles semánticos en HEX (`#RRGGBB`) — para @react-pdf. Derivados de la paleta. */
export const BRAND_HEX = {
  /** Azul ICONIC dominante (encabezados de tabla, títulos de sección). */
  primary: ICONIC_EXPORT_PALETTE.primaryBlue,
  /** Azul noche premium (texto destacado, banda de TOTAL GENERAL). */
  deepNavy: ICONIC_EXPORT_PALETTE.deepNavy,
  /** Cian ICONIC — ÚNICO acento (líneas/bordes; nunca relleno con texto). */
  accent: ICONIC_EXPORT_PALETTE.cyanAccent,
  /** Grafito para texto técnico/cuerpo. */
  graphite: ICONIC_EXPORT_PALETTE.graphite,
  /** Texto secundario/muted (grafito atenuado por uso). */
  muted: ICONIC_EXPORT_PALETTE.graphite,
  /** Gris azulado para bordes sutiles. */
  border: ICONIC_EXPORT_PALETTE.softBlueGray,
  /** Gris muy claro para alternancia de filas y bandas. */
  bandLight: ICONIC_EXPORT_PALETTE.lightGray,
  white: ICONIC_EXPORT_PALETTE.white,
} as const;

/** Convierte `#RRGGBB` a ARGB (`FFRRGGBB`) para ExcelJS. */
function toArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

/** Mismos roles en ARGB (`FFRRGGBB`) — para ExcelJS. */
export const BRAND_ARGB = {
  primary: toArgb(BRAND_HEX.primary),
  deepNavy: toArgb(BRAND_HEX.deepNavy),
  accent: toArgb(BRAND_HEX.accent),
  graphite: toArgb(BRAND_HEX.graphite),
  muted: toArgb(BRAND_HEX.muted),
  border: toArgb(BRAND_HEX.border),
  bandLight: toArgb(BRAND_HEX.bandLight),
  white: toArgb(BRAND_HEX.white),
} as const;

/** Metadatos de marca. */
export const BRAND = {
  name: 'GRUPO ICONIC',
  tagline: 'Studio + Construcción + Bienes Raíces',
  documentTitle: 'PRESUPUESTO DE OBRA',
  /** Monograma textual de RESILIENCIA (solo si faltan assets en desarrollo). */
  monogram: 'IC',
} as const;

export type BrandLogoVariant = 'full' | 'symbol';

/**
 * Devuelve el data URI del logo oficial embebido (`full` o `symbol`) o `null`
 * si el asset no está disponible (solo en desarrollo sin generar). NUNCA lanza
 * ni registra el contenido. Sin `fs`.
 */
export function getLogoDataUri(variant: BrandLogoVariant = 'full'): string | null {
  const uri = variant === 'symbol' ? ICONIC_LOGO_SYMBOL_DATA_URI : ICONIC_LOGO_FULL_DATA_URI;
  return typeof uri === 'string' && uri.startsWith('data:image/') ? uri : null;
}

/** `true` si ambos logos oficiales están embebidos (producción esperada). */
export function hasOfficialLogos(): boolean {
  return getLogoDataUri('full') !== null && getLogoDataUri('symbol') !== null;
}
