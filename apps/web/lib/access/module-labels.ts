import type { AccessModule } from '@/server/access/module-access';

export const ACCESS_MODULE_LABELS: Record<AccessModule, string> = {
  dashboard: 'Dashboard',
  projects: 'Proyectos',
  estimates: 'Presupuestos',
  apu: 'APU',
  quantities: 'Cantidades',
  planning: 'Cronograma',
  catalog: 'Catalogo',
  'price-intelligence': 'Inteligencia de precios',
  monitoring: 'Monitoreo de precios',
  'operational-review': 'Revision de precios',
  'quick-notes': 'Notas internas',
  settings: 'Configuracion',
  'settings-access': 'Accesos',
  exports: 'Exportaciones',
};
