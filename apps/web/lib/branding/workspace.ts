/**
 * workspace.ts — Branding del WORKSPACE/tenant (UI). Oleada UI/Branding ICONIC V1
 * + ICONIC OPS LOGIN/INSTANCE-READY BRANDING.
 *
 * El naming/assets visibles se resuelven desde la configuración CENTRALIZADA de
 * instancia (`@/lib/branding/instance`): defaults públicos ICONIC OPS +
 * overrides `NEXT_PUBLIC_INSTANCE_*` sanitizados. Este módulo conserva la API
 * `getActiveWorkspace()` que ya consumen layouts y componentes, y añade los
 * tokens de color de la paleta ICONIC.
 *
 * NOTA: "Construction Ops" es solo el nombre técnico interno del repo/proyecto;
 * el nombre VISIBLE del producto en esta instancia es "ICONIC OPS".
 */
import { getInstanceBranding } from './instance';

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
 * Workspace por defecto (instancia ICONIC OPS sin overrides). Conservado por
 * compatibilidad; la resolución activa vive en `getActiveWorkspace()`.
 */
export const DEFAULT_WORKSPACE: Workspace = {
  productName: 'ICONIC OPS',
  workspaceName: 'Grupo ICONIC',
  descriptor: 'Gestión de presupuestos de obra',
  logoFull: '/branding/iconic/grupo-iconic-logo-full.png',
  logoSymbol: '/branding/iconic/grupo-iconic-logo-symbol.png',
  initials: 'GI',
  theme: ICONIC_THEME,
};

/**
 * Resuelve el workspace activo desde la configuración de instancia
 * (defaults ICONIC OPS + overrides NEXT_PUBLIC sanitizados).
 */
export function getActiveWorkspace(): Workspace {
  const instance = getInstanceBranding();
  return {
    productName: instance.productName,
    workspaceName: instance.workspaceName,
    descriptor: instance.descriptor,
    logoFull: instance.logoFull,
    logoSymbol: instance.logoSymbol,
    initials: instance.initials,
    theme: ICONIC_THEME,
  };
}
