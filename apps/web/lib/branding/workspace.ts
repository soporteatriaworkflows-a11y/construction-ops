/**
 * workspace.ts — Branding del WORKSPACE/tenant (UI). Oleada UI/Branding V1.
 *
 * Fuente única del nombre visible del producto, el workspace activo y sus assets.
 * Diseñado FUTURE-READY para multi-tenant: hoy devuelve el workspace por defecto
 * (Grupo ICONIC); mañana `getActiveWorkspace(viewer)` podrá resolver el branding
 * por organización (nombre, avatar y tokens) sin tocar las vistas.
 *
 * NOTA: "Construction Ops" es solo el nombre técnico interno del repo/proyecto;
 * el nombre VISIBLE del producto es "Presupuestos".
 */

/** Tokens de marca del workspace (paleta ICONIC oficial; ver branding.ts de exports). */
export interface WorkspaceTheme {
  /** Azul ICONIC principal. */
  primary: string;
  /** Cian de acento. */
  accent: string;
  /** Navy profundo (fondos/barras de marca). */
  navy: string;
  /** Grafito (texto secundario sobre claro). */
  graphite: string;
  /** Azul grisáceo suave (bordes/superficies). */
  soft: string;
  /** Gris muy claro (fondos). */
  light: string;
}

export interface Workspace {
  /** Nombre VISIBLE del producto/módulo. */
  productName: string;
  /** Nombre del workspace/empresa activa (tenant). */
  workspaceName: string;
  /** Subtítulo/tagline corto para login y cabeceras. */
  tagline: string;
  /** Logo símbolo (cuadrado) para avatar del workspace. Reemplazable por tenant. */
  logoSymbol: string;
  /** Logo completo (horizontal) para cabeceras amplias. */
  logoFull: string;
  /** Iniciales de respaldo si el asset no carga. */
  initials: string;
  theme: WorkspaceTheme;
}

/** Paleta ICONIC oficial (espejo de `server/estimates/export/branding.ts`). */
export const ICONIC_THEME: WorkspaceTheme = {
  primary: '#005DD6',
  accent: '#00B8FF',
  navy: '#020148',
  graphite: '#1B1F3E',
  soft: '#C7DCED',
  light: '#F2F4F7',
};

/**
 * Workspace por defecto (Grupo ICONIC). Logos oficiales ya versionados en
 * `public/branding/iconic/`. Para multi-tenant, sustituir por una resolución
 * por organización manteniendo esta misma forma.
 */
export const DEFAULT_WORKSPACE: Workspace = {
  productName: 'Presupuestos',
  workspaceName: 'Grupo ICONIC',
  tagline: 'Gestión de presupuestos y costos de obra',
  logoSymbol: '/branding/iconic/grupo-iconic-logo-symbol.png',
  logoFull: '/branding/iconic/grupo-iconic-logo-full.png',
  initials: 'GI',
  theme: ICONIC_THEME,
};

/**
 * Resuelve el workspace activo. Hoy es el por defecto; preparado para recibir un
 * `viewer`/`organizationId` y devolver el branding del tenant correspondiente.
 */
export function getActiveWorkspace(): Workspace {
  return DEFAULT_WORKSPACE;
}
