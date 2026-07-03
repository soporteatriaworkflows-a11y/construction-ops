/**
 * Fixtures de DTOs para tests del dashboard.
 * Propiedad: agent-dashboard.
 *
 * Usa valores reales del golden master (PROJECT_MASTER §3.4).
 */

import type {
  DashboardSummary,
  ChapterDistributionSlice,
  ChapterSummary,
  ViewerContext,
} from '@/lib/contracts/read-model';

/** Contexto de viewer con rol management (puede ver campos 🔒). */
export const VIEWER_MANAGEMENT: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  profileId: '00000000-0000-4000-8000-000000000002',
  role: 'management',
};

/** Contexto de viewer con rol client (NO puede ver campos 🔒). */
// `projectGrants: 'all'`: estos tests validan la PROYECCIÓN por rol, no el
// alcance por proyecto (V5.6.4; el scope se prueba en project-grants.test.ts).
export const VIEWER_CLIENT: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  profileId: '00000000-0000-4000-8000-000000000003',
  role: 'client',
  projectGrants: 'all',
};

/** Contexto de viewer con rol site (obra — NO puede ver campos 🔒). */
export const VIEWER_SITE: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  role: 'site',
};

/** Contexto de viewer con rol internal. */
export const VIEWER_INTERNAL: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  role: 'internal',
};

const PROJECT_ID = '00000000-0000-4000-8000-000000000010';
const VERSION_ID = '00000000-0000-4000-8000-0000000000b1';

/** Distribución de capítulos de muestra (3 capítulos) */
export const CHAPTER_DISTRIBUTION_SAMPLE: ChapterDistributionSlice[] = [
  {
    chapterId: '0c000000-0000-4000-8000-000000000001',
    code: 'CAP-01',
    name: 'PRELIMINARES DE OBRA',
    subtotal: '10242985.2623463700',
    share: '0.0304759',
  },
  {
    chapterId: '0c000000-0000-4000-8000-000000000009',
    code: 'CAP-09',
    name: 'PISOS Y ENCHAPES',
    subtotal: '75000000.0000000000',
    share: '0.2231540',
  },
  {
    chapterId: '0c000000-0000-4000-8000-000000000011',
    code: 'CAP-11',
    name: 'INSTALACIONES ELECTRICAS',
    subtotal: '50000000.0000000000',
    share: '0.1487693',
  },
];

/** Top capítulos de muestra */
export const TOP_CHAPTERS_SAMPLE: ChapterSummary[] = [
  {
    id: '0c000000-0000-4000-8000-000000000009',
    code: 'CAP-09',
    name: 'PISOS Y ENCHAPES',
    subtotal: '75000000.0000000000',
    itemCount: 8,
  },
  {
    id: '0c000000-0000-4000-8000-000000000011',
    code: 'CAP-11',
    name: 'INSTALACIONES ELECTRICAS',
    subtotal: '50000000.0000000000',
    itemCount: 12,
  },
  {
    id: '0c000000-0000-4000-8000-000000000001',
    code: 'CAP-01',
    name: 'PRELIMINARES DE OBRA',
    subtotal: '10242985.2623463700',
    itemCount: 9,
  },
];

/**
 * DashboardSummary de ejemplo para rol management (con campos 🔒).
 * Valores de costos del golden master §3.4.
 */
export const DASHBOARD_SUMMARY_MANAGEMENT: DashboardSummary = {
  projectId: PROJECT_ID,
  budget: '372247169.9781186000',         // total_costo §3.4
  directCost: '336084479.9369073500',     // costos_directos §3.4
  indirectCost: '36162690.0412112300',    // costos_indirectos §3.4
  chapterDistribution: CHAPTER_DISTRIBUTION_SAMPLE,
  topChapters: TOP_CHAPTERS_SAMPLE,
  estimateStatus: 'approved',
  lastUpdatedAt: '2026-05-29T00:00:00-05:00',
  // Campos 🔒 disponibles para management:
  projectedSaving: '5000000.0000000000',
  realizedSaving: '3500000.0000000000',
  pricingCoverage: '0.7500000000',
};

/**
 * DashboardSummary de ejemplo para rol client (SIN campos 🔒).
 * Los campos 🔒 deben estar ausentes (undefined).
 */
export const DASHBOARD_SUMMARY_CLIENT: DashboardSummary = {
  projectId: PROJECT_ID,
  budget: '372247169.9781186000',
  directCost: '336084479.9369073500',
  indirectCost: '36162690.0412112300',
  chapterDistribution: CHAPTER_DISTRIBUTION_SAMPLE,
  topChapters: TOP_CHAPTERS_SAMPLE,
  estimateStatus: 'approved',
  lastUpdatedAt: '2026-05-29T00:00:00-05:00',
  // SIN campos 🔒:
  projectedSaving: undefined,
  realizedSaving: undefined,
  pricingCoverage: undefined,
};

export const DEMO_PROJECT_ID = PROJECT_ID;
export const DEMO_VERSION_ID = VERSION_ID;
