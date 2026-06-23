/**
 * settings-sections.ts — Catálogo de secciones del hub de Configuración
 * (SETTINGS_PROFILE_ACCOUNT_V1). Lógica PURA y testeable; sin estado, sin
 * consultas, sin server. SOLO navegación a rutas read-only existentes y estados
 * visuales. `Usuarios y accesos` respeta `canManageAccess` (resuelto server-side).
 */

/** Estado visual de una sección. */
export type SettingsStatus = 'ready' | 'readonly' | 'soon' | 'locked';

/** Etiquetas es-CO de cada estado (chip). */
export const SETTINGS_STATUS_LABELS: Record<SettingsStatus, string> = {
  ready: 'Activo',
  readonly: 'Solo lectura',
  soon: 'Próximamente',
  locked: 'Requiere permisos',
};

/** Clave de icono (se mapea a un componente lucide en el cliente/servidor UI). */
export type SettingsIcon =
  | 'account'
  | 'organization'
  | 'access'
  | 'preferences'
  | 'branding'
  | 'security'
  | 'system';

/** Acento visual de la card para dar variedad (no todas iguales). */
export type SettingsTone = 'navy' | 'cyan' | 'plain';

export interface SettingsSection {
  key: string;
  title: string;
  description: string;
  icon: SettingsIcon;
  status: SettingsStatus;
  tone: SettingsTone;
  /** Ruta existente read-only; ausente = card no navegable (p. ej. sin permisos). */
  href?: string;
}

/**
 * Construye las secciones del hub. PURA. `canManageAccess` controla SOLO la
 * sección "Usuarios y accesos" (navegable + Activo) vs (Requiere permisos).
 */
export function buildSettingsSections({
  canManageAccess,
}: {
  canManageAccess: boolean;
}): SettingsSection[] {
  return [
    {
      key: 'account',
      title: 'Mi cuenta',
      description: 'Tu perfil, correo, rol y sesión activa.',
      icon: 'account',
      status: 'readonly',
      tone: 'navy',
      href: '/settings/account',
    },
    {
      key: 'organization',
      title: 'Organización',
      description: 'Workspace, modo de datos y resumen de permisos.',
      icon: 'organization',
      status: 'readonly',
      tone: 'plain',
      href: '/settings/organization',
    },
    {
      key: 'access',
      title: 'Usuarios y accesos',
      description: 'Invitaciones, roles y permisos del equipo.',
      icon: 'access',
      status: canManageAccess ? 'ready' : 'locked',
      tone: 'plain',
      href: canManageAccess ? '/settings/access' : undefined,
    },
    {
      key: 'preferences',
      title: 'Preferencias',
      description: 'Idioma, moneda, formato y visualización.',
      icon: 'preferences',
      status: 'soon',
      tone: 'plain',
      href: '/settings/preferences',
    },
    {
      key: 'branding',
      title: 'Branding',
      description: 'Identidad ICONIC, paleta y logo del workspace.',
      icon: 'branding',
      status: 'readonly',
      tone: 'plain',
      href: '/settings/branding',
    },
    {
      key: 'security',
      title: 'Seguridad',
      description: 'Autenticación, sesión y acceso por roles.',
      icon: 'security',
      status: 'readonly',
      tone: 'plain',
      href: '/settings/security',
    },
    {
      key: 'system',
      title: 'Estado del sistema',
      description: 'Modo de datos y módulos disponibles.',
      icon: 'system',
      status: 'ready',
      tone: 'cyan',
      href: '/settings/system',
    },
  ];
}

/** Módulos operativos disponibles (para la tarjeta de estado del sistema). PURA. */
export const SYSTEM_MODULES = [
  'Dashboard',
  'Proyectos',
  'Presupuestos',
  'APU',
  'Catálogo',
  'Cantidades',
  'Cronograma',
  'Command Search',
] as const;
