/**
 * MOCKS PROVISIONALES — Oleada 1.
 * Estos datos son estáticos y se reemplazarán en Oleada 2 con datos reales
 * de cost-domain + db-rls. Todos los valores respetan EXACTAMENTE las
 * interfaces de docs/API_CONTRACTS.md (camelCase, DecimalString para dinero).
 *
 * NO contiene lógica financiera. Los subtotales y totales ya vienen
 * calculados (simulando lo que cost-domain proveerá).
 *
 * Propiedad: agent-frontend-boq.
 */

import type {
  Organization,
  Profile,
  Project,
  ProjectScope,
  Resource,
  ApuTemplate,
  ApuComponent,
  Estimate,
  EstimateVersion,
  Chapter,
  BoqItem,
  IndirectCostRule,
  QuantityGroup,
  QuantityLine,
} from '@/lib/utils/types';

// ---------------------------------------------------------------------------
// Organización
// ---------------------------------------------------------------------------

export const MOCK_ORGANIZATION: Organization = {
  id: 'org-0001-0000-0000-000000000001',
  name: 'Constructora Piloto',
  createdAt: '2026-05-01T00:00:00-05:00',
  updatedAt: '2026-05-01T00:00:00-05:00',
};

// ---------------------------------------------------------------------------
// Perfil (rol interno — nunca exponer email/role a cliente)
// ---------------------------------------------------------------------------

export const MOCK_PROFILE: Profile = {
  id: 'usr-0001-0000-0000-000000000001',
  organizationId: MOCK_ORGANIZATION.id,
  fullName: 'Administrador',
  email: 'admin@constructora.co', // 🔒 no mostrar a cliente
  role: 'presupuestos',           // 🔒 no mostrar a cliente
  createdAt: '2026-05-01T00:00:00-05:00',
  updatedAt: '2026-05-01T00:00:00-05:00',
};

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'prj-0001-0000-0000-000000000001',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'EP-001',
    name: 'ENTRE PATIOS',
    status: 'active',
    clientReference: null, // 🔒 no mostrar a cliente
    location: 'Bogotá D.C., Colombia',
    startDate: '2026-01-15',
    estimatedEndDate: '2026-12-31',
    createdAt: '2026-01-10T08:00:00-05:00',
    updatedAt: '2026-05-01T10:00:00-05:00',
  },
  {
    id: 'prj-0001-0000-0000-000000000002',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'RM-002',
    name: 'REMODELACIÓN OFICINAS',
    status: 'active',
    clientReference: null, // 🔒
    location: 'Medellín, Colombia',
    startDate: '2026-03-01',
    estimatedEndDate: '2026-09-30',
    createdAt: '2026-02-20T08:00:00-05:00',
    updatedAt: '2026-05-15T10:00:00-05:00',
  },
];

// ---------------------------------------------------------------------------
// Alcances — project EP-001
// ---------------------------------------------------------------------------

export const MOCK_SCOPES: ProjectScope[] = [
  {
    id: 'scp-0001-0000-0000-000000000001',
    projectId: 'prj-0001-0000-0000-000000000001',
    parentScopeId: null,
    code: 'EP-FULL',
    name: 'FULL',
    scopeType: 'stage',
    status: 'active',
    createdAt: '2026-01-10T08:00:00-05:00',
    updatedAt: '2026-01-10T08:00:00-05:00',
  },
  {
    id: 'scp-0001-0000-0000-000000000002',
    projectId: 'prj-0001-0000-0000-000000000001',
    parentScopeId: 'scp-0001-0000-0000-000000000001',
    code: 'EP-P1',
    name: 'PRIMER PISO',
    scopeType: 'floor',
    status: 'active',
    createdAt: '2026-01-10T08:00:00-05:00',
    updatedAt: '2026-01-10T08:00:00-05:00',
  },
  {
    id: 'scp-0001-0000-0000-000000000003',
    projectId: 'prj-0001-0000-0000-000000000001',
    parentScopeId: 'scp-0001-0000-0000-000000000001',
    code: 'EP-P2',
    name: 'SEGUNDO PISO',
    scopeType: 'floor',
    status: 'active',
    createdAt: '2026-01-10T08:00:00-05:00',
    updatedAt: '2026-01-10T08:00:00-05:00',
  },
  {
    id: 'scp-0001-0000-0000-000000000004',
    projectId: 'prj-0001-0000-0000-000000000001',
    parentScopeId: null,
    code: 'EP-MOD01',
    name: 'MODIFICACIÓN 01',
    scopeType: 'modification',
    status: 'active',
    createdAt: '2026-03-01T08:00:00-05:00',
    updatedAt: '2026-03-01T08:00:00-05:00',
  },
];

// ---------------------------------------------------------------------------
// Catálogo de recursos
// ---------------------------------------------------------------------------

export const MOCK_RESOURCES: Resource[] = [
  {
    id: 'res-0001-0000-0000-000000000001',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MAT-001',
    name: 'Cemento Portland gris x 50 kg',
    resourceType: 'material',
    unit: 'bulto',
    defaultWastePct: '0.0500',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000002',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MAT-002',
    name: 'Arena de río lavada',
    resourceType: 'material',
    unit: 'm³',
    defaultWastePct: '0.0500',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000003',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MAT-003',
    name: 'Grava triturada 3/4"',
    resourceType: 'material',
    unit: 'm³',
    defaultWastePct: '0.0500',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000004',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MAT-004',
    name: 'Porcelanato rectificado 60x60 cm',
    resourceType: 'material',
    unit: 'm²',
    defaultWastePct: '0.1000',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000005',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MAT-005',
    name: 'Varilla corrugada 1/2" x 6m',
    resourceType: 'material',
    unit: 'und',
    defaultWastePct: '0.0300',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000006',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MOB-001',
    name: 'Oficial de construcción',
    resourceType: 'labor',
    unit: 'hr',
    defaultWastePct: '0.0000',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000007',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'MOB-002',
    name: 'Ayudante de construcción',
    resourceType: 'labor',
    unit: 'hr',
    defaultWastePct: '0.0000',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'res-0001-0000-0000-000000000008',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'EQP-001',
    name: 'Mezcladora de concreto 1 saco',
    resourceType: 'equipment',
    unit: 'hr',
    defaultWastePct: '0.0000',
    active: true,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
];

// ---------------------------------------------------------------------------
// APU Templates
// ---------------------------------------------------------------------------

export const MOCK_APU_TEMPLATES: ApuTemplate[] = [
  {
    id: 'apu-0001-0000-0000-000000000001',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'APU-001',
    name: 'Concreto 3000 psi vaciado en sitio',
    unit: 'm³',
    chapterTemplateId: null,
    description: 'Suministro y colocación de concreto 3000 psi incluye mezclado y vibrado',
    active: true,
    version: 1,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'apu-0001-0000-0000-000000000002',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'APU-002',
    name: 'Instalación porcelanato rectificado 60x60',
    unit: 'm²',
    chapterTemplateId: null,
    description: 'Suministro y colocación de porcelanato rectificado incluye pegante y boquilla',
    active: true,
    version: 1,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
  {
    id: 'apu-0001-0000-0000-000000000003',
    organizationId: MOCK_ORGANIZATION.id,
    code: 'APU-003',
    name: 'Mampostería en bloque No. 4',
    unit: 'm²',
    chapterTemplateId: null,
    description: 'Suministro y pega de bloque No. 4 incluye mortero de pega',
    active: true,
    version: 1,
    createdAt: '2026-01-05T08:00:00-05:00',
    updatedAt: '2026-05-01T08:00:00-05:00',
  },
];

// ---------------------------------------------------------------------------
// APU Components — para APU-001 (concreto)
// ---------------------------------------------------------------------------

export const MOCK_APU_COMPONENTS: ApuComponent[] = [
  {
    id: 'cmp-0001-0000-0000-000000000001',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000001',
    componentType: 'material',
    quantity: '7.0000',
    wastePct: '0.0500',
    unitPriceSource: 'resource',
    unitPriceSnapshot: '28500.0000000000',
    totalComponentCost: '209475.0000000000',
    sortOrder: 1,
    notes: null,
  },
  {
    id: 'cmp-0001-0000-0000-000000000002',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000002',
    componentType: 'material',
    quantity: '0.5000',
    wastePct: '0.0500',
    unitPriceSource: 'resource',
    unitPriceSnapshot: '65000.0000000000',
    totalComponentCost: '34125.0000000000',
    sortOrder: 2,
    notes: null,
  },
  {
    id: 'cmp-0001-0000-0000-000000000003',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000003',
    componentType: 'material',
    quantity: '0.8000',
    wastePct: '0.0500',
    unitPriceSource: 'resource',
    unitPriceSnapshot: '75000.0000000000',
    totalComponentCost: '63000.0000000000',
    sortOrder: 3,
    notes: null,
  },
  {
    id: 'cmp-0001-0000-0000-000000000004',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000006',
    componentType: 'labor',
    quantity: '2.0000',
    wastePct: '0.0000',
    unitPriceSource: 'labor_role',
    unitPriceSnapshot: '18500.0000000000',
    totalComponentCost: '37000.0000000000',
    sortOrder: 4,
    notes: null,
  },
  {
    id: 'cmp-0001-0000-0000-000000000005',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000007',
    componentType: 'labor',
    quantity: '2.0000',
    wastePct: '0.0000',
    unitPriceSource: 'labor_role',
    unitPriceSnapshot: '14200.0000000000',
    totalComponentCost: '28400.0000000000',
    sortOrder: 5,
    notes: null,
  },
  {
    id: 'cmp-0001-0000-0000-000000000006',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    resourceId: 'res-0001-0000-0000-000000000008',
    componentType: 'equipment',
    quantity: '0.5000',
    wastePct: '0.0000',
    unitPriceSource: 'manual',
    unitPriceSnapshot: '25000.0000000000',
    totalComponentCost: '12500.0000000000',
    sortOrder: 6,
    notes: null,
  },
];

// ---------------------------------------------------------------------------
// Estimate y versiones — alcance EP-P1 (Primer Piso)
// ---------------------------------------------------------------------------

export const MOCK_ESTIMATE: Estimate = {
  id: 'est-0001-0000-0000-000000000001',
  projectScopeId: 'scp-0001-0000-0000-000000000002',
  code: 'COT-EP-P1-001',
  name: 'Cotización Primer Piso',
  status: 'active',
  createdAt: '2026-01-15T08:00:00-05:00',
  updatedAt: '2026-05-29T10:00:00-05:00',
};

export const MOCK_ESTIMATE_VERSIONS: EstimateVersion[] = [
  {
    id: 'ver-0001-0000-0000-000000000001',
    estimateId: 'est-0001-0000-0000-000000000001',
    versionNumber: 1,
    status: 'issued',
    createdBy: 'usr-0001-0000-0000-000000000001',
    createdAt: '2026-02-01T08:00:00-05:00',
    approvedAt: '2026-02-15T10:00:00-05:00',
    notes: 'Versión inicial entregada al cliente',
  },
  {
    id: 'ver-0001-0000-0000-000000000002',
    estimateId: 'est-0001-0000-0000-000000000001',
    versionNumber: 2,
    status: 'draft',
    createdBy: 'usr-0001-0000-0000-000000000001',
    createdAt: '2026-05-01T08:00:00-05:00',
    approvedAt: null,
    notes: 'Ajuste por cambio de alcance en baños',
  },
];

// ---------------------------------------------------------------------------
// Capítulos — versión V2 (draft)
// ---------------------------------------------------------------------------

export const MOCK_CHAPTERS: Chapter[] = [
  {
    id: 'chp-0001-0000-0000-000000000001',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: '01',
    name: 'PRELIMINARES',
    sortOrder: 1,
  },
  {
    id: 'chp-0001-0000-0000-000000000002',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: '02',
    name: 'ESTRUCTURA',
    sortOrder: 2,
  },
  {
    id: 'chp-0001-0000-0000-000000000003',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: '03',
    name: 'MAMPOSTERÍA',
    sortOrder: 3,
  },
  {
    id: 'chp-0001-0000-0000-000000000004',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: '04',
    name: 'ACABADOS',
    sortOrder: 4,
  },
  {
    id: 'chp-0001-0000-0000-000000000005',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: '05',
    name: 'INSTALACIONES HIDROSANITARIAS',
    sortOrder: 5,
  },
];

// ---------------------------------------------------------------------------
// Items BOQ — versión V2
// Los subtotales vienen ya calculados (cost-domain los proveerá en Oleada 2).
// ---------------------------------------------------------------------------

export const MOCK_BOQ_ITEMS: BoqItem[] = [
  // Capítulo 01 — PRELIMINARES
  {
    id: 'boq-0001-0000-0000-000000000001',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000001',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '01.01',
    descriptionSnapshot: 'Localización y replanteo general',
    unitSnapshot: 'm²',
    quantitySnapshot: '236.7790',
    unitPriceSnapshot: '4500.0000000000',
    subtotal: '1065505.5000000000',
    sortOrder: 1,
    notes: null,
  },
  {
    id: 'boq-0001-0000-0000-000000000002',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000001',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '01.02',
    descriptionSnapshot: 'Demolición y limpieza general',
    unitSnapshot: 'glb',
    quantitySnapshot: '1.0000',
    unitPriceSnapshot: '3500000.0000000000',
    subtotal: '3500000.0000000000',
    sortOrder: 2,
    notes: null,
  },
  // Capítulo 02 — ESTRUCTURA
  {
    id: 'boq-0001-0000-0000-000000000003',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000002',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    quantityGroupId: 'qgp-0001-0000-0000-000000000001',
    code: '02.01',
    descriptionSnapshot: 'Concreto 3000 psi vaciado en sitio - cimientos',
    unitSnapshot: 'm³',
    quantitySnapshot: '42.5000',
    unitPriceSnapshot: '485000.0000000000',
    subtotal: '20612500.0000000000',
    sortOrder: 1,
    notes: null,
  },
  {
    id: 'boq-0001-0000-0000-000000000004',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000002',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '02.02',
    descriptionSnapshot: 'Acero de refuerzo Fy=420 MPa',
    unitSnapshot: 'kg',
    quantitySnapshot: '8450.0000',
    unitPriceSnapshot: '4800.0000000000',
    subtotal: '40560000.0000000000',
    sortOrder: 2,
    notes: null,
  },
  {
    id: 'boq-0001-0000-0000-000000000005',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000002',
    apuTemplateId: 'apu-0001-0000-0000-000000000001',
    quantityGroupId: null,
    code: '02.03',
    descriptionSnapshot: 'Concreto 3000 psi vaciado en sitio - columnas y vigas',
    unitSnapshot: 'm³',
    quantitySnapshot: '28.3000',
    unitPriceSnapshot: '495000.0000000000',
    subtotal: '14008500.0000000000',
    sortOrder: 3,
    notes: null,
  },
  // Capítulo 03 — MAMPOSTERÍA
  {
    id: 'boq-0001-0000-0000-000000000006',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000003',
    apuTemplateId: 'apu-0001-0000-0000-000000000003',
    quantityGroupId: null,
    code: '03.01',
    descriptionSnapshot: 'Mampostería en bloque No. 4',
    unitSnapshot: 'm²',
    quantitySnapshot: '312.5000',
    unitPriceSnapshot: '48500.0000000000',
    subtotal: '15156250.0000000000',
    sortOrder: 1,
    notes: null,
  },
  // Capítulo 04 — ACABADOS
  {
    id: 'boq-0001-0000-0000-000000000007',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000004',
    apuTemplateId: 'apu-0001-0000-0000-000000000002',
    quantityGroupId: 'qgp-0001-0000-0000-000000000002',
    code: '04.01',
    descriptionSnapshot: 'Instalación porcelanato rectificado 60x60 - piso',
    unitSnapshot: 'm²',
    quantitySnapshot: '185.4000',
    unitPriceSnapshot: '95000.0000000000',
    subtotal: '17613000.0000000000',
    sortOrder: 1,
    notes: null,
  },
  {
    id: 'boq-0001-0000-0000-000000000008',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000004',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '04.02',
    descriptionSnapshot: 'Pintura vinilo tipo 1 - paredes interiores',
    unitSnapshot: 'm²',
    quantitySnapshot: '620.0000',
    unitPriceSnapshot: '22500.0000000000',
    subtotal: '13950000.0000000000',
    sortOrder: 2,
    notes: null,
  },
  // Capítulo 05 — HIDROSANITARIAS
  {
    id: 'boq-0001-0000-0000-000000000009',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000005',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '05.01',
    descriptionSnapshot: 'Red de suministro PVC 1/2" RDE-13.5',
    unitSnapshot: 'm',
    quantitySnapshot: '145.0000',
    unitPriceSnapshot: '38000.0000000000',
    subtotal: '5510000.0000000000',
    sortOrder: 1,
    notes: null,
  },
  {
    id: 'boq-0001-0000-0000-000000000010',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    chapterId: 'chp-0001-0000-0000-000000000005',
    apuTemplateId: null,
    quantityGroupId: null,
    code: '05.02',
    descriptionSnapshot: 'Red de desagüe PVC 4" sanitaria',
    unitSnapshot: 'm',
    quantitySnapshot: '98.0000',
    unitPriceSnapshot: '55000.0000000000',
    subtotal: '5390000.0000000000',
    sortOrder: 2,
    notes: null,
  },
];

// ---------------------------------------------------------------------------
// Reglas de costos indirectos (AIU)
// Los que tienen visibleToClient=true se muestran en exportaciones de cliente.
// ---------------------------------------------------------------------------

export const MOCK_INDIRECT_COST_RULES: IndirectCostRule[] = [
  {
    id: 'icr-0001-0000-0000-000000000001',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: 'A',
    name: 'Administración',
    percentage: '0.0350',
    baseType: 'direct_cost',
    sortOrder: 1,
    visibleToClient: true,
  },
  {
    id: 'icr-0001-0000-0000-000000000002',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: 'I',
    name: 'Imprevistos',
    percentage: '0.0250',
    baseType: 'direct_cost',
    sortOrder: 2,
    visibleToClient: true,
  },
  {
    id: 'icr-0001-0000-0000-000000000003',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: 'U',
    name: 'Utilidad',
    percentage: '0.0400',
    baseType: 'direct_cost',
    sortOrder: 3,
    visibleToClient: true,
  },
  {
    id: 'icr-0001-0000-0000-000000000004',
    estimateVersionId: 'ver-0001-0000-0000-000000000002',
    code: 'IVA-U',
    name: 'IVA sobre Utilidad',
    percentage: '0.1900',
    baseType: 'utility',
    sortOrder: 4,
    visibleToClient: true,
  },
];

// ---------------------------------------------------------------------------
// Grupos y líneas de cantidades — cimientos
// ---------------------------------------------------------------------------

export const MOCK_QUANTITY_GROUPS: QuantityGroup[] = [
  {
    id: 'qgp-0001-0000-0000-000000000001',
    projectScopeId: 'scp-0001-0000-0000-000000000002',
    code: 'QG-CIM',
    name: 'Cimientos - zapatas y vigas de amarre',
    unit: 'm³',
    calculationMode: 'volume',
    createdAt: '2026-01-15T08:00:00-05:00',
  },
  {
    id: 'qgp-0001-0000-0000-000000000002',
    projectScopeId: 'scp-0001-0000-0000-000000000002',
    code: 'QG-PISO',
    name: 'Piso porcelanato - primer piso',
    unit: 'm²',
    calculationMode: 'area',
    createdAt: '2026-01-15T08:00:00-05:00',
  },
];

export const MOCK_QUANTITY_LINES: QuantityLine[] = [
  // Cimientos
  {
    id: 'qln-0001-0000-0000-000000000001',
    quantityGroupId: 'qgp-0001-0000-0000-000000000001',
    description: 'Zapatas Z-1 (0.80x0.80x0.30)',
    length: '0.8000',
    width: '0.8000',
    height: '0.3000',
    multiplier: '12.0000',
    directQuantity: null,
    formulaType: 'volume',
    calculatedQuantity: '2.3040',
    notes: '12 unidades',
    sortOrder: 1,
  },
  {
    id: 'qln-0001-0000-0000-000000000002',
    quantityGroupId: 'qgp-0001-0000-0000-000000000001',
    description: 'Zapatas Z-2 (1.00x1.00x0.35)',
    length: '1.0000',
    width: '1.0000',
    height: '0.3500',
    multiplier: '8.0000',
    directQuantity: null,
    formulaType: 'volume',
    calculatedQuantity: '2.8000',
    notes: '8 unidades',
    sortOrder: 2,
  },
  {
    id: 'qln-0001-0000-0000-000000000003',
    quantityGroupId: 'qgp-0001-0000-0000-000000000001',
    description: 'Vigas de cimentación eje A y B',
    length: '24.5000',
    width: '0.3000',
    height: '0.5000',
    multiplier: '2.0000',
    directQuantity: null,
    formulaType: 'volume',
    calculatedQuantity: '7.3500',
    notes: null,
    sortOrder: 3,
  },
  // Pisos
  {
    id: 'qln-0001-0000-0000-000000000004',
    quantityGroupId: 'qgp-0001-0000-0000-000000000002',
    description: 'Sala - comedor',
    length: '8.4000',
    width: '6.2000',
    height: null,
    multiplier: '1.0000',
    directQuantity: null,
    formulaType: 'area',
    calculatedQuantity: '52.0800',
    notes: null,
    sortOrder: 1,
  },
  {
    id: 'qln-0001-0000-0000-000000000005',
    quantityGroupId: 'qgp-0001-0000-0000-000000000002',
    description: 'Alcobas 1, 2 y 3',
    length: '4.2000',
    width: '3.8000',
    height: null,
    multiplier: '3.0000',
    directQuantity: null,
    formulaType: 'area',
    calculatedQuantity: '47.8800',
    notes: '3 alcobas',
    sortOrder: 2,
  },
];

// ---------------------------------------------------------------------------
// Helpers para la UI
// ---------------------------------------------------------------------------

/** Devuelve los items de un capítulo. */
export function getBoqItemsByChapter(
  items: BoqItem[],
  chapterId: string
): BoqItem[] {
  return items.filter((i) => i.chapterId === chapterId);
}

/** Devuelve los alcances de un proyecto. */
export function getScopesByProject(
  scopes: ProjectScope[],
  projectId: string
): ProjectScope[] {
  return scopes.filter((s) => s.projectId === projectId);
}

/** Devuelve los componentes de un APU. */
export function getComponentsByApu(
  components: ApuComponent[],
  apuTemplateId: string
): ApuComponent[] {
  return components.filter((c) => c.apuTemplateId === apuTemplateId);
}
