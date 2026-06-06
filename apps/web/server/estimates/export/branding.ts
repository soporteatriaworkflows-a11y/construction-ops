/**
 * branding.ts — Identidad visual ICONIC para los exports (4E.1B). FUENTE ÚNICA.
 *
 * Paleta corporativa + metadatos + cargador de logo OPCIONAL. No cambia el
 * contenido estructural ni la lógica financiera del presupuesto; sólo el
 * lenguaje visual de Excel/PDF. Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §13`.
 *
 * Logo: se consume EMBEBIDO en base64 desde `logo-asset.ts` (serverless-safe,
 * sin fs ni tracing). Ruta documentada para el PNG oficial:
 * `apps/web/public/branding/iconic-logo.png` (convertir a base64 y pegar en
 * `ICONIC_LOGO_BASE64`; ver `public/branding/README.md`). Sin asset, los
 * generadores usan un monograma textual; la exportación NUNCA se rompe.
 */
import { ICONIC_LOGO_BASE64 } from './logo-asset';

/** Colores de marca en HEX (`#RRGGBB`) — para @react-pdf. */
export const BRAND_HEX = {
  /** Azul noche corporativo (títulos, bandas, encabezados de tabla). */
  primary: '#0F2A43',
  /** Variante intermedia para subtítulos/acentos sobrios. */
  primarySoft: '#1C4E80',
  /** Dorado premium (línea de marca, realce de TOTAL GENERAL). */
  accent: '#C8A24B',
  /** Tinta de texto principal. */
  ink: '#1A2330',
  /** Texto secundario/muted. */
  muted: '#6B7280',
  /** Banda/again clara para secciones y filas alternas. */
  bandLight: '#EEF2F7',
  /** Realce de totales (azul muy claro). */
  totalFill: '#DCE6F1',
  /** Borde sutil. */
  border: '#D9DEE6',
  white: '#FFFFFF',
} as const;

/** Mismos colores en ARGB (`FFRRGGBB`) — para ExcelJS. */
export const BRAND_ARGB = {
  primary: 'FF0F2A43',
  primarySoft: 'FF1C4E80',
  accent: 'FFC8A24B',
  ink: 'FF1A2330',
  muted: 'FF6B7280',
  bandLight: 'FFEEF2F7',
  totalFill: 'FFDCE6F1',
  border: 'FFD9DEE6',
  white: 'FFFFFFFF',
} as const;

/** Metadatos de marca (configurables sin tocar generadores). */
export const BRAND = {
  name: 'ICONIC',
  tagline: 'Construcción & Presupuestos',
  documentTitle: 'PRESUPUESTO DE OBRA',
  /** Monograma textual usado cuando no hay logo (fallback premium). */
  monogram: 'IC',
} as const;

export interface BrandLogo {
  /** Data URI listo para `<Image src>` de @react-pdf. */
  dataUri: string;
  /** Buffer del PNG decodificado (uso interno/pruebas). */
  buffer: Buffer;
  extension: 'png';
}

let cached: { logo: BrandLogo | null } | null = null;

/**
 * Resuelve el logo oficial desde el base64 EMBEBIDO (`logo-asset.ts`,
 * serverless-safe, sin fs ni tracing). Cachea el resultado (incluida la
 * ausencia). NUNCA lanza: ante base64 inválido/vacío devuelve `null` y el
 * generador usa el monograma. No registra el contenido del asset.
 */
export function loadBrandLogo(): BrandLogo | null {
  if (cached) return cached.logo;

  const embedded = ICONIC_LOGO_BASE64.trim();
  if (embedded.length > 0) {
    try {
      const buffer = Buffer.from(embedded, 'base64');
      if (buffer.byteLength > 0) {
        const logo: BrandLogo = {
          buffer,
          dataUri: `data:image/png;base64,${embedded}`,
          extension: 'png',
        };
        cached = { logo };
        return logo;
      }
    } catch {
      /* base64 inválido: usar monograma */
    }
  }

  cached = { logo: null };
  return null;
}

/** Reinicia la caché del logo (sólo para pruebas). */
export function __resetBrandLogoCache(): void {
  cached = null;
}
