/**
 * mock-data.ts — MOCKS PROVISIONALES del preview UIX de Steel Ops.
 *
 * Datos ficticios (D2): nombres de elementos/proyectos genéricos, sin datos
 * reales ni sensibles del proyecto piloto. Se reemplazan por datos reales
 * cuando F2 (modelo de datos) y la integración real estén aprobados — ver
 * docs/STEEL_OPS_UIX_V1_CONTRACT.md §6.
 *
 * Los `originalDescription` de `STEEL_RAW_DESCRIPTIONS` son los casos de
 * parser pedidos para esta oleada; se interpretan con el dominio real de F1
 * en `domain-bridge.ts`, no aquí.
 */
import type {
  SteelBoqLinkView,
  SteelElementView,
  SteelOffcutView,
  SteelOrderView,
  SteelProfileLineView,
  SteelRawDescriptionView,
  SteelSettingsView,
  SteelSpecView,
  SteelTakeoffView,
} from './types';

export const MOCK_STEEL_TAKEOFFS: readonly SteelTakeoffView[] = [
  {
    id: 'to-1',
    name: 'Cimentación y estructura — Torre A',
    projectName: 'Proyecto Alfa',
    scopeLabel: 'Torre A / Piso 2',
    status: 'in_review',
    lineCount: 6,
    createdAt: '2026-06-20',
  },
  {
    id: 'to-2',
    name: 'Estructura metálica — Bodega',
    projectName: 'Proyecto Beta',
    scopeLabel: 'Bodega Industrial / Nave 1',
    status: 'draft',
    lineCount: 4,
    createdAt: '2026-06-28',
  },
];

export const MOCK_STEEL_ELEMENTS: readonly SteelElementView[] = [
  { id: 'el-zapata-1', takeoffId: 'to-1', elementType: 'zapata', label: 'Zapata Z-1', axisLocation: 'Eje A-1' },
  { id: 'el-viga-1', takeoffId: 'to-1', elementType: 'viga_cimentacion', label: 'Viga de cimentación VC-2', axisLocation: 'Eje A-B/1' },
  { id: 'el-columna-1', takeoffId: 'to-1', elementType: 'columna', label: 'Columna C-12', axisLocation: 'Eje B-4' },
  { id: 'el-pilote-1', takeoffId: 'to-1', elementType: 'pilote', label: 'Pilote P-4', axisLocation: 'Eje C-2' },
  { id: 'el-losa-1', takeoffId: 'to-1', elementType: 'losa', label: 'Losa L-3', axisLocation: 'Piso 2' },
  { id: 'el-escalera-1', takeoffId: 'to-1', elementType: 'escalera', label: 'Escalera E-1', axisLocation: 'Torre A / Escalera Norte' },
  { id: 'el-ipe-1', takeoffId: 'to-2', elementType: 'perfil_ipe', label: 'Correa IPE 200 — Cercha 3', axisLocation: 'Nave 1 / Eje 3' },
  { id: 'el-tubo-1', takeoffId: 'to-2', elementType: 'tubo_estructural', label: 'Tubo estructural — Riostra R-1', axisLocation: 'Nave 1 / Eje 1-2' },
  { id: 'el-platina-1', takeoffId: 'to-2', elementType: 'platina', label: 'Platina base — Columna metálica CM-1', axisLocation: 'Nave 1 / Eje 2' },
  { id: 'el-malla-1', takeoffId: 'to-2', elementType: 'malla_electrosoldada', label: 'Malla electrosoldada — Losa sobre terreno', axisLocation: 'Nave 1 / Piso' },
];

/** Casos de parser pedidos para esta oleada, uno por elemento de refuerzo. */
export const STEEL_RAW_DESCRIPTIONS: readonly SteelRawDescriptionView[] = [
  { id: 'raw-1', elementId: 'el-zapata-1', originalDescription: '5#5600', sourceLabel: 'Plano estructural Z-1, hoja 4' },
  { id: 'raw-2', elementId: 'el-viga-1', originalDescription: '74E#3200', sourceLabel: 'Plano estructural VC-2, hoja 6' },
  { id: 'raw-3', elementId: 'el-columna-1', originalDescription: '2X65E#3182', sourceLabel: 'Plano estructural C-12, hoja 9' },
  { id: 'raw-4', elementId: 'el-losa-1', originalDescription: '10#7205 @ 15CM', sourceLabel: 'Plano estructural L-3, hoja 11' },
  { id: 'raw-5', elementId: 'el-escalera-1', originalDescription: '#4 L=0.62', sourceLabel: 'Detalle escalera E-1, hoja 14' },
  { id: 'raw-6', elementId: 'el-pilote-1', originalDescription: '15 + 35 + 15', sourceLabel: 'Detalle doblez pilote P-4, hoja 2' },
];

/**
 * Perfiles/estructura metálica: F1 solo parsea notación de refuerzo (rebar),
 * así que estas líneas no pasan por `parseSteelDescription` — se construyen
 * directamente como `SteelLineInput` en `domain-bridge.ts` para reusar
 * `calculateSteelLine`/`evaluateSteelLineAlerts` igual que el refuerzo.
 */
export const MOCK_STEEL_PROFILE_LINES: readonly SteelProfileLineView[] = [
  {
    id: 'profile-1',
    elementId: 'el-ipe-1',
    originalDescription: '8 IPE 200 L=6.00',
    profileReference: 'IPE-200',
    cutLengthM: '6',
    quantityPerUnit: '8',
    repetitions: '1',
    unitWeightKgM: '22.4',
    assumedWastePct: '4',
  },
  {
    id: 'profile-2',
    elementId: 'el-tubo-1',
    originalDescription: '12 Tubo cuadrado 100x100x4 L=9.00',
    profileReference: 'TUBO-100x100x4',
    cutLengthM: '9',
    quantityPerUnit: '12',
    repetitions: '1',
    unitWeightKgM: '11.9',
    assumedWastePct: '9',
  },
  {
    id: 'profile-3',
    elementId: 'el-platina-1',
    originalDescription: '20 Platina 200x10 L=0.40',
    profileReference: 'PLAT-200x10',
    cutLengthM: '0.4',
    quantityPerUnit: '20',
    repetitions: '1',
    unitWeightKgM: '15.7',
    assumedWastePct: '2',
  },
  {
    id: 'profile-4',
    elementId: 'el-malla-1',
    originalDescription: '18 Malla electrosoldada Q-138 L=6.00',
    profileReference: 'MALLA Q-138',
    cutLengthM: '6',
    quantityPerUnit: '18',
    repetitions: '1',
    unitWeightKgM: '1.38',
    assumedWastePct: '6',
  },
];

/**
 * Estados de precio espejo del pipeline real (`estimated|supplier|approved`)
 * + `vencido` (por `valid_until`) + `sin_precio`. Steel NO inventa un modelo
 * de precios propio: cuando se conecte, estos estados los dará
 * `price_observations`.
 */
export const MOCK_STEEL_SPECS: readonly SteelSpecView[] = [
  { id: 'spec-rebar-3', family: 'rebar', label: 'Varilla corrugada #3', reference: 'REBAR-3', unit: 'kg', supplierName: 'Aceros del Valle', priceStatus: 'aprobado', priceCop: '4200', validUntil: '2026-08-15' },
  { id: 'spec-rebar-4', family: 'rebar', label: 'Varilla corrugada #4', reference: 'REBAR-4', unit: 'kg', supplierName: 'Aceros del Valle', priceStatus: 'proveedor', priceCop: '4150', validUntil: '2026-08-15' },
  { id: 'spec-rebar-5', family: 'rebar', label: 'Varilla corrugada #5', reference: 'REBAR-5', unit: 'kg', supplierName: 'Ferretería Central', priceStatus: 'vencido', priceCop: '4180', validUntil: '2026-06-01' },
  { id: 'spec-rebar-6', family: 'rebar', label: 'Varilla corrugada #6', reference: 'REBAR-6', unit: 'kg', supplierName: 'Ferretería Central', priceStatus: 'sin_precio' },
  { id: 'spec-ipe-200', family: 'structural_steel', label: 'Perfil IPE 200', reference: 'IPE-200', unit: 'kg', supplierName: 'Proveedor Acero Andino', priceStatus: 'aprobado', priceCop: '5300', validUntil: '2026-09-01' },
  { id: 'spec-tubo-100', family: 'structural_steel', label: 'Tubo estructural 100x100x4', reference: 'TUBO-100x100x4', unit: 'kg', supplierName: 'Proveedor Acero Andino', priceStatus: 'estimado', priceCop: '5600', validUntil: '2026-09-01' },
  { id: 'spec-platina-200', family: 'structural_steel', label: 'Platina 200x10', reference: 'PLAT-200x10', unit: 'kg', supplierName: 'Proveedor Acero Andino', priceStatus: 'sin_precio' },
  { id: 'spec-malla-q138', family: 'mesh', label: 'Malla electrosoldada Q-138', reference: 'MALLA-Q138', unit: 'unit', supplierName: 'Aceros del Valle', priceStatus: 'estimado', priceCop: '98000', validUntil: '2026-07-20' },
];

/** Sobrantes fuera de los estados que produce el optimizador (`available`/`final_waste`) — estados de flujo posterior, aún no modelados en F1. */
export const MOCK_STEEL_OFFCUTS_WORKFLOW_ONLY: readonly SteelOffcutView[] = [
  { id: 'offcut-mock-suggested', specLabel: 'Varilla #5', lengthM: '2.1', status: 'suggested', estimatedSavingsCop: '38000', fromDomain: false },
  { id: 'offcut-mock-assigned', specLabel: 'Varilla #3', lengthM: '1.4', status: 'assigned', estimatedSavingsCop: '21000', fromDomain: false },
  { id: 'offcut-mock-discarded', specLabel: 'Tubo 100x100x4', lengthM: '0.2', status: 'discarded', fromDomain: false },
];

export const MOCK_STEEL_ORDERS: readonly SteelOrderView[] = [
  {
    id: 'order-1',
    name: 'Pedido refuerzo — Torre A, piso 2',
    status: 'draft',
    totalEstimatedCop: '18450000',
    totalKg: '1893.4',
    totalMl: '414',
    lines: [
      { id: 'ol-1', familyLabel: 'Varilla #5 (6 m)', commercialLengthM: '6', commercialUnits: '42', totalKg: '391.1', supplierName: 'Aceros del Valle', unitPriceCop: '4200', validUntil: '2026-08-15' },
      { id: 'ol-2', familyLabel: 'Varilla #3 (9 m)', commercialLengthM: '9', commercialUnits: '18', totalKg: '90.7', supplierName: 'Ferretería Central', unitPriceCop: '4180', validUntil: '2026-06-01' },
    ],
  },
  {
    id: 'order-2',
    name: 'Pedido perfiles — Bodega nave 1',
    status: 'quoted',
    totalEstimatedCop: '26900000',
    totalKg: '3918.6',
    totalMl: '234',
    lines: [
      { id: 'ol-3', familyLabel: 'IPE 200 (12 m)', commercialLengthM: '12', commercialUnits: '9', totalKg: '2419.2', supplierName: 'Proveedor Acero Andino', unitPriceCop: '5300', validUntil: '2026-09-01' },
      { id: 'ol-4', familyLabel: 'Tubo 100x100x4 (9 m)', commercialLengthM: '9', commercialUnits: '14', totalKg: '1499.4', supplierName: 'Proveedor Acero Andino', unitPriceCop: '5600', validUntil: '2026-09-01' },
    ],
  },
];

export const MOCK_STEEL_BOQ_LINKS: readonly SteelBoqLinkView[] = [
  { id: 'link-1', elementLabel: 'Zapata Z-1', suggestedBoqActivity: 'Cimentación — Zapatas aisladas', suggestedCatalogResource: 'Varilla corrugada #5', status: 'vinculado', risks: [] },
  { id: 'link-2', elementLabel: 'Viga de cimentación VC-2', suggestedBoqActivity: 'Cimentación — Vigas de amarre', suggestedCatalogResource: 'Varilla corrugada #3', status: 'sugerido', risks: ['sin_proveedor'] },
  { id: 'link-3', elementLabel: 'Columna C-12', suggestedBoqActivity: 'Estructura — Columnas', suggestedCatalogResource: 'Varilla corrugada #5', status: 'sugerido', risks: ['sin_precio'] },
  { id: 'link-4', elementLabel: 'Correa IPE 200 — Cercha 3', suggestedBoqActivity: 'Estructura metálica — Cerchas', suggestedCatalogResource: 'Perfil IPE 200', status: 'no_vinculado', risks: ['sin_actividad', 'sin_proveedor'] },
  { id: 'link-5', elementLabel: 'Malla electrosoldada — Losa sobre terreno', suggestedBoqActivity: 'Placas — Losa sobre terreno', suggestedCatalogResource: 'Malla electrosoldada Q-138', status: 'no_vinculado', risks: ['sin_precio', 'sin_actividad'] },
];

/** Defaults D3/D5, alineados a `defaultSteelWasteThresholds`/longitudes comerciales de `@/modules/steel` (ver domain-bridge.ts). */
export const MOCK_STEEL_SETTINGS: SteelSettingsView = {
  commercialLengthsM: ['6', '9', '12'],
  kerfRebarM: '0',
  kerfProfilesM: '0.005',
  minimumUsefulOffcutRebarM: '0.30',
  minimumUsefulOffcutProfilesM: '0.50',
  wasteWarningPctRebar: '8',
  wasteCriticalPctRebar: '12',
  wasteWarningPctProfiles: '5',
  wasteCriticalPctProfiles: '8',
  defaultSupplierName: 'Aceros del Valle',
};
