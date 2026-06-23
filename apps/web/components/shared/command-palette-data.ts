/**
 * command-palette-data.ts — Datos y filtrado de la paleta de comandos
 * (ICONIC_COMMAND_SEARCH_V1). SOLO navegación/presentación.
 *
 * Reglas:
 *  - Únicamente rutas EXISTENTES (verificadas contra `app/(dashboard)/**`).
 *  - Funciones PURAS y testeables; sin estado, sin consultas, sin server.
 *  - Administración respeta `canManageAccess` (resuelto server-side por el shell).
 */

/** Grupos visibles en la paleta, en orden de render. */
export const COMMAND_GROUP_ORDER = ['Navegación', 'Acciones', 'Administración'] as const;
export type CommandGroup = (typeof COMMAND_GROUP_ORDER)[number];

/**
 * Clave de icono (se mapea a un componente lucide en el cliente). Mantener el
 * dato agnóstico de presentación facilita el test puro.
 */
export type CommandIcon =
  | 'dashboard'
  | 'projects'
  | 'estimates'
  | 'apu'
  | 'catalog'
  | 'quantities'
  | 'planning'
  | 'settings'
  | 'access'
  | 'create'
  | 'import'
  | 'reconcile'
  | 'providers'
  | 'workspace';

export interface CommandItem {
  /** Identificador estable (para keys y aria-activedescendant). */
  id: string;
  label: string;
  /** Ruta existente a la que navega (siempre interna). */
  href: string;
  group: CommandGroup;
  icon: CommandIcon;
  /** Términos extra (sinónimos es-CO) para mejorar el match de búsqueda. */
  keywords: string;
}

/**
 * Construye el catálogo completo de comandos según permisos.
 * PURA. `canManageAccess` controla SOLO el grupo Administración.
 */
export function buildCommandItems(canManageAccess: boolean): CommandItem[] {
  const items: CommandItem[] = [
    // ── Navegación: módulos principales (rutas índice existentes) ──
    { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', group: 'Navegación', icon: 'dashboard', keywords: 'inicio panel tablero centro de control resumen' },
    { id: 'nav-projects', label: 'Proyectos', href: '/projects', group: 'Navegación', icon: 'projects', keywords: 'obras proyecto' },
    { id: 'nav-estimates', label: 'Presupuestos', href: '/estimates', group: 'Navegación', icon: 'estimates', keywords: 'presupuesto boq estimacion estimaciones' },
    { id: 'nav-apu', label: 'APU', href: '/apu', group: 'Navegación', icon: 'apu', keywords: 'analisis precios unitarios biblioteca' },
    { id: 'nav-catalog', label: 'Catálogo', href: '/catalog', group: 'Navegación', icon: 'catalog', keywords: 'catalogo recursos insumos materiales precios' },
    { id: 'nav-quantities', label: 'Cantidades', href: '/quantities', group: 'Navegación', icon: 'quantities', keywords: 'cantidades memorias takeoff metrados' },
    { id: 'nav-planning', label: 'Cronograma', href: '/planning', group: 'Navegación', icon: 'planning', keywords: 'cronograma planeacion gantt programacion' },
    { id: 'nav-settings', label: 'Configuración', href: '/settings', group: 'Navegación', icon: 'settings', keywords: 'configuracion ajustes preferencias settings' },

    // ── Acciones rápidas (rutas de acción existentes) ──
    { id: 'act-projects-new', label: 'Crear proyecto', href: '/projects/new', group: 'Acciones', icon: 'create', keywords: 'nuevo proyecto obra agregar' },
    { id: 'act-apu-import', label: 'Importar APU', href: '/apu/import', group: 'Acciones', icon: 'import', keywords: 'apu importar excel cargar' },
    { id: 'act-apu-reconcile', label: 'Conciliación de APU', href: '/apu/reconciliation', group: 'Acciones', icon: 'reconcile', keywords: 'apu conciliar reconciliacion recursos' },
    { id: 'act-apu-new', label: 'Crear APU', href: '/apu/new', group: 'Acciones', icon: 'create', keywords: 'apu nuevo manual constructor' },
    { id: 'act-catalog-import', label: 'Importar catálogo', href: '/catalog/import', group: 'Acciones', icon: 'import', keywords: 'catalogo importar csv cargar recursos' },
    { id: 'act-catalog-providers', label: 'Proveedores', href: '/catalog/providers', group: 'Acciones', icon: 'providers', keywords: 'proveedores suministros precios' },
    { id: 'act-quantities-import', label: 'Importar cantidades', href: '/quantities/import', group: 'Acciones', icon: 'import', keywords: 'cantidades importar memorias takeoff cargar' },
    { id: 'act-quantities-workspace', label: 'Espacio de cantidades', href: '/quantities/workspace', group: 'Acciones', icon: 'workspace', keywords: 'cantidades workspace memorias sincronizar' },
    { id: 'act-planning-new', label: 'Crear cronograma', href: '/planning/new', group: 'Acciones', icon: 'create', keywords: 'cronograma nuevo crear gantt programacion' },
  ];

  // ── Administración: solo si el actor puede gestionar accesos ──
  if (canManageAccess) {
    items.push({
      id: 'adm-access',
      label: 'Accesos / Usuarios',
      href: '/settings/access',
      group: 'Administración',
      icon: 'access',
      keywords: 'accesos usuarios permisos invitaciones roles equipo',
    });
  }

  return items;
}

/** Normaliza para búsqueda: minúsculas y sin acentos. PURA. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtra por consulta (AND de términos sobre label + keywords + grupo).
 * Consulta vacía → todos. PURA, preserva orden de entrada.
 */
export function filterCommands(items: CommandItem[], query: string): CommandItem[] {
  const q = normalize(query);
  if (!q) return items;
  const terms = q.split(/\s+/).filter(Boolean);
  return items.filter((it) => {
    const haystack = normalize(`${it.label} ${it.keywords} ${it.group}`);
    return terms.every((t) => haystack.includes(t));
  });
}

export interface CommandSection {
  group: CommandGroup;
  items: CommandItem[];
}

/**
 * Agrupa los ítems en secciones siguiendo `COMMAND_GROUP_ORDER`, omitiendo
 * grupos vacíos. PURA. No reordena dentro de cada grupo.
 */
export function groupCommands(items: CommandItem[]): CommandSection[] {
  return COMMAND_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((it) => it.group === group),
  })).filter((section) => section.items.length > 0);
}
