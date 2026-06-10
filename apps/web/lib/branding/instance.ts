/**
 * instance.ts — Configuración CENTRALIZADA de branding por INSTANCIA
 * (Oleada ICONIC OPS LOGIN + INSTANCE-READY BRANDING).
 *
 * Modelo: cada cliente opera una instancia privada (deploy + DB propios). El
 * branding visible se resuelve aquí, en una sola fuente, con:
 *  1. Defaults públicos de ICONIC OPS (esta instancia).
 *  2. Overrides opcionales vía variables NEXT_PUBLIC_INSTANCE_* (seguras:
 *     solo texto/asset paths públicos, sanitizados; NUNCA secretos).
 *
 * Reglas de seguridad:
 *  - Solo variables `NEXT_PUBLIC_*` (públicas por definición). Nada sensible.
 *  - Todo override se sanitiza: largo acotado, sin caracteres de control,
 *    sin `<`/`>` (no se inyecta HTML).
 *  - Logos: solo rutas same-origin (`/...`) o `https://` absolutas.
 *  - Las referencias a `process.env.NEXT_PUBLIC_*` son LITERALES para que
 *    Next.js las inline también en componentes cliente.
 *
 * Arquitectura: ver docs/INSTANCE_BRANDING_ARCHITECTURE.md.
 */

/** Branding visible de la instancia (sin tokens de color: ver workspace.ts). */
export interface InstanceBranding {
  /** Nombre VISIBLE del producto en esta instancia. */
  productName: string;
  /** Nombre del cliente/workspace dueño de la instancia. */
  workspaceName: string;
  /** Descriptor corto bajo el nombre del producto. */
  descriptor: string;
  /** Logo completo (login, cabeceras amplias). Ruta pública. */
  logoFull: string;
  /** Símbolo/monograma (avatar). Ruta pública. */
  logoSymbol: string;
  /** Iniciales de respaldo si el asset no carga. */
  initials: string;
  /** Etiqueta de la plataforma subyacente ("Powered by …"). */
  poweredByLabel: string;
  /** Mostrar la referencia discreta "Powered by". */
  showPoweredBy: boolean;
}

/** Defaults públicos de la instancia ICONIC OPS. */
export const ICONIC_OPS_DEFAULTS: InstanceBranding = {
  productName: 'ICONIC OPS',
  workspaceName: 'Grupo ICONIC',
  descriptor: 'Gestión de presupuestos de obra',
  logoFull: '/branding/iconic/grupo-iconic-logo-full.png',
  logoSymbol: '/branding/iconic/grupo-iconic-logo-symbol.png',
  initials: 'GI',
  poweredByLabel: 'ATRIA BUDGET OPS',
  showPoweredBy: true,
};

const MAX_TEXT_LEN = 80;
const MAX_DESCRIPTOR_LEN = 140;
const MAX_ASSET_LEN = 300;
const MAX_INITIALS_LEN = 3;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Texto plano seguro: trim, sin control chars, sin <>, largo acotado. */
function sanitizeText(raw: string | undefined, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(CONTROL_CHARS, '').replace(/[<>]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

/** Ruta de asset segura: same-origin (`/…`) o `https://…`, sin comillas/espacios. */
function sanitizeAssetPath(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned.length > MAX_ASSET_LEN) return null;
  if (/[\s"'<>\\]/.test(cleaned) || CONTROL_CHARS.test(cleaned)) return null;
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) return cleaned;
  if (cleaned.startsWith('https://')) {
    try {
      const u = new URL(cleaned);
      return u.protocol === 'https:' ? cleaned : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Flag booleano: solo '0' | 'false' | 'off' | 'hidden' desactivan. */
function parseVisibilityFlag(raw: string | undefined, fallback: boolean): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return !['0', 'false', 'off', 'hidden'].includes(raw.trim().toLowerCase());
}

/** Overrides crudos (forma estable para testear la resolución pura). */
export interface InstanceBrandingOverrides {
  productName?: string;
  workspaceName?: string;
  descriptor?: string;
  logoFull?: string;
  logoSymbol?: string;
  initials?: string;
  showPoweredBy?: string;
}

/**
 * Resolución PURA: defaults + overrides sanitizados. Un override inválido
 * (vacío, peligroso o malformado) se ignora y conserva el default.
 * `poweredByLabel` NO es sobreescribible: identifica la plataforma.
 */
export function resolveInstanceBranding(
  overrides: InstanceBrandingOverrides = {},
  defaults: InstanceBranding = ICONIC_OPS_DEFAULTS,
): InstanceBranding {
  return {
    productName: sanitizeText(overrides.productName, MAX_TEXT_LEN) ?? defaults.productName,
    workspaceName: sanitizeText(overrides.workspaceName, MAX_TEXT_LEN) ?? defaults.workspaceName,
    descriptor: sanitizeText(overrides.descriptor, MAX_DESCRIPTOR_LEN) ?? defaults.descriptor,
    logoFull: sanitizeAssetPath(overrides.logoFull) ?? defaults.logoFull,
    logoSymbol: sanitizeAssetPath(overrides.logoSymbol) ?? defaults.logoSymbol,
    initials:
      sanitizeText(overrides.initials, MAX_INITIALS_LEN)?.toUpperCase() ?? defaults.initials,
    poweredByLabel: defaults.poweredByLabel,
    showPoweredBy: parseVisibilityFlag(overrides.showPoweredBy, defaults.showPoweredBy),
  };
}

/**
 * Branding activo de la instancia. Las referencias a `process.env` son
 * literales (requisito de inlining de Next.js en bundles cliente).
 */
export function getInstanceBranding(): InstanceBranding {
  return resolveInstanceBranding({
    productName: process.env.NEXT_PUBLIC_INSTANCE_PRODUCT_NAME,
    workspaceName: process.env.NEXT_PUBLIC_INSTANCE_WORKSPACE_NAME,
    descriptor: process.env.NEXT_PUBLIC_INSTANCE_DESCRIPTOR,
    logoFull: process.env.NEXT_PUBLIC_INSTANCE_LOGO_FULL,
    logoSymbol: process.env.NEXT_PUBLIC_INSTANCE_LOGO_SYMBOL,
    initials: process.env.NEXT_PUBLIC_INSTANCE_INITIALS,
    showPoweredBy: process.env.NEXT_PUBLIC_INSTANCE_SHOW_POWERED_BY,
  });
}
