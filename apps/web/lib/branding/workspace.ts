/**
 * workspace.ts — Branding del WORKSPACE/tenant (UI). Oleada UI/Branding ICONIC V1.
 *
 * Fuente única del naming visible y los assets del workspace. FUTURE-READY para
 * multi-tenant (ligero): hoy `getActiveWorkspace()` devuelve el workspace por
 * defecto (Grupo ICONIC); mañana puede resolver branding por organización
 * (nombre, avatar, tokens) sin tocar las vistas.
 *
 * NOTA: "Construction Ops" es solo el nombre técnico interno del repo/proyecto;
 * el nombre VISIBLE del producto es "Presupuestos".
 */

/** Tokens de color de marca (paleta ICONIC oficial). Coinciden con las CSS vars. */
export interface WorkspaceTheme {
  primary: string; // #005DD6
  cyan: string; // #00B8FF (acento)
  ink: string; // #020148 (azul noche / jerarquía)
  graphite: string; // #1B1F3E
  softBlue: string; // #C7DCED
  gray: string; // #F2F4F7
  white: string; // #FFFFFF
}

export interface Workspace {
  /** Nombre VISIBLE del producto/módulo. */
  productName: string;
  /** Nombre del workspace/empresa activa (tenant). */
  workspaceName: string;
  /** Descriptor corto del producto. */
  descriptor: string;
  /** Logo completo (login, cabeceras amplias). */
  logoFull: string;
  /** Símbolo/monograma (avatar del workspace). */
  logoSymbol: string;
  /** Iniciales de respaldo si el asset no carga. */
  initials: string;
  theme: WorkspaceTheme;
}

/** Paleta ICONIC oficial. */
export const ICONIC_THEME: WorkspaceTheme = {
  primary: '#005DD6',
  cyan: '#00B8FF',
  ink: '#020148',
  graphite: '#1B1F3E',
  softBlue: '#C7DCED',
  gray: '#F2F4F7',
  white: '#FFFFFF',
};

/**
 * Workspace por defecto (Grupo ICONIC). Logos oficiales versionados en
 * `public/branding/iconic/`. Para multi-tenant, sustituir por una resolución por
 * organización conservando esta misma forma.
 */
export const DEFAULT_WORKSPACE: Workspace = {
  productName: 'Presupuestos',
  workspaceName: 'Grupo ICONIC',
  descriptor: 'Gestión de presupuestos de obra',
  logoFull: '/branding/iconic/grupo-iconic-logo-full.png',
  logoSymbol: '/branding/iconic/grupo-iconic-logo-symbol.png',
  initials: 'GI',
  theme: ICONIC_THEME,
};

/** Resuelve el workspace activo (hoy el por defecto; multi-tenant ready). */
export function getActiveWorkspace(): Workspace {
  return DEFAULT_WORKSPACE;
}
