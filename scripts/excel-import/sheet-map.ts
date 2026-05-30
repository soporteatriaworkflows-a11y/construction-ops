/**
 * sheet-map.ts — Mapa declarativo Excel → entidades del contrato v1.
 *
 * Propiedad de agent-excel-mapper. Centraliza QUÉ hoja, QUÉ rango y QUÉ
 * celdas alimentan cada entidad, separando:
 *   - cantidades DIRECTAS  (una cifra)             → quantity_lines.direct
 *   - despieces GEOMÉTRICOS (largo×ancho×alto×mult) → quantity_lines.area/volume/length
 *
 * Las coordenadas exactas (columna/fila) marcadas como `TODO_VERIFY` deben
 * confirmarse ejecutando `scripts/golden-master/dump-workbook.mjs` sobre el
 * Excel privado. Hasta entonces el importador usa el fixture sanitizado como
 * salida de referencia y este mapa documenta la intención de extracción.
 *
 * Fuentes: PROJECT_MASTER §3.2 (hojas/rangos), §3.3 (hallazgos), §3.4
 * (regresión); DATABASE_SCHEMA v1; API_CONTRACTS v1.
 */

export type CalculationMode = 'direct' | 'length' | 'area' | 'volume' | 'custom';

export interface ColumnMap {
  /** Letra(s) de columna en el Excel, p. ej. "B". TODO_VERIFY si tentativo. */
  col: string;
  /** Campo destino en la entidad del contrato (camelCase). */
  field: string;
  /** Si la columna es dinero/cantidad → se serializa como DecimalString. */
  decimal?: boolean;
  /** Notas de interpretación. */
  notes?: string;
}

export interface SheetSpec {
  /** Nombre EXACTO de la hoja en el workbook. */
  sheet: string;
  /** Rango usado declarado en PROJECT_MASTER §3.2. */
  declaredRef: string;
  /** Propósito funcional. */
  purpose: string;
  /** Entidad(es) destino del contrato. */
  targets: string[];
  /** Fila donde empiezan los datos (1-based). TODO_VERIFY. */
  dataStartRow?: number;
  /** Columnas mapeadas (tentativas hasta verificar con dump). */
  columns?: ColumnMap[];
  /** Para hojas de cantidades: modo de cálculo predominante. */
  calculationMode?: CalculationMode;
  /** Datos a sanitizar en esta hoja. */
  sanitize?: string[];
  /** Celdas clave / totales conocidos. */
  keyCells?: { addr?: string; meaning: string; crossRef?: string[] }[];
}

/** Especificación declarativa de las 10 hojas del golden master. */
export const SHEET_SPECS: SheetSpec[] = [
  {
    sheet: 'RESUMEN',
    declaredRef: 'A1:E35',
    purpose: 'Consolidado general del presupuesto (todos los alcances).',
    targets: ['estimate_versions', 'indirect_cost_rules', 'estimateTotals'],
    sanitize: ['nombre cliente', 'razón social', 'NIT'],
    keyCells: [
      { meaning: 'Costos directos consolidados', crossRef: ['COTIZACION FULL'] },
      { meaning: 'AIU (Admin/Imprev/Utilidad) y IVA sobre utilidad' },
      { meaning: 'Total y valor por m²', crossRef: ['CANT COMPLETO'] },
    ],
  },
  {
    sheet: 'COTIZACION FULL',
    declaredRef: 'A1:H199',
    purpose: 'Cotización integral: capítulos, actividades, cantidades, precio unitario, subtotal.',
    targets: ['chapters', 'boq_items', 'apu_templates'],
    dataStartRow: undefined, // TODO_VERIFY
    columns: [
      { col: 'A', field: 'code', notes: 'Código de capítulo/actividad. TODO_VERIFY' },
      { col: 'B', field: 'descriptionSnapshot', notes: 'Descripción de la actividad. TODO_VERIFY' },
      { col: 'C', field: 'unitSnapshot', notes: 'Unidad. TODO_VERIFY' },
      { col: 'D', field: 'quantitySnapshot', decimal: true, notes: 'Cantidad. TODO_VERIFY' },
      { col: 'E', field: 'unitPriceSnapshot', decimal: true, notes: 'V/r unitario (desde APU). TODO_VERIFY' },
      { col: 'F', field: 'subtotal', decimal: true, notes: 'V/r total = cant×unit. TODO_VERIFY' },
    ],
    sanitize: ['encabezado con nombre de cliente'],
    keyCells: [{ meaning: 'Subtotales por capítulo', crossRef: ['APU', 'CANTIDADES'] }],
  },
  {
    sheet: 'APU',
    declaredRef: 'A1:H466',
    purpose: 'Salarios integrales + análisis de precios unitarios (insumos, MO, herramienta, desperdicio).',
    targets: ['labor_roles', 'apu_templates', 'apu_components', 'resources'],
    columns: [
      { col: 'A', field: 'code', notes: 'Código de APU o insumo. TODO_VERIFY' },
      { col: 'B', field: 'name', notes: 'Descripción del insumo/actividad. TODO_VERIFY' },
      { col: 'C', field: 'unit', notes: 'Unidad. TODO_VERIFY' },
      { col: 'D', field: 'quantity', decimal: true, notes: 'Rendimiento/consumo. TODO_VERIFY' },
      { col: 'E', field: 'unitPriceSnapshot', decimal: true, notes: 'Precio unitario insumo. TODO_VERIFY' },
      { col: 'F', field: 'wastePct', decimal: true, notes: 'Desperdicio (fracción). TODO_VERIFY' },
      { col: 'G', field: 'totalComponentCost', decimal: true, notes: 'Total componente. TODO_VERIFY' },
    ],
    sanitize: [],
    keyCells: [
      { meaning: 'Salario base, subsidio, prestaciones, seg. social, parafiscales, dotación → costo integral diario/hora' },
      { meaning: 'total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot' },
    ],
  },
  {
    sheet: 'COTIZACION 1 PISO',
    declaredRef: 'A1:G204',
    purpose: 'Cotización específica del Primer piso (subset de COTIZACION FULL).',
    targets: ['chapters', 'boq_items'],
    columns: [
      { col: 'A', field: 'code', notes: 'TODO_VERIFY' },
      { col: 'B', field: 'descriptionSnapshot', notes: 'TODO_VERIFY' },
      { col: 'C', field: 'unitSnapshot', notes: 'TODO_VERIFY' },
      { col: 'D', field: 'quantitySnapshot', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'E', field: 'unitPriceSnapshot', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'F', field: 'subtotal', decimal: true, notes: 'TODO_VERIFY' },
    ],
    keyCells: [
      { meaning: 'Σ subtotales = costos_directos del primer piso = 336084479.93690735', crossRef: ['APU', 'CANTIDADES 1 PISO'] },
    ],
  },
  {
    sheet: 'ACTA DE MODIFICACION 01',
    declaredRef: 'A1:K199',
    purpose: 'Acta de modificación: original, variación, cantidad ejecutada, % ejecutado, saldo.',
    targets: ['change_orders (v0)', 'change_order_items (v0)'],
    columns: [
      { col: 'A', field: 'code', notes: 'TODO_VERIFY' },
      { col: 'B', field: 'description', notes: 'TODO_VERIFY' },
      { col: 'C', field: 'originalQuantity', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'D', field: 'variationQuantity', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'E', field: 'adjustedQuantity', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'F', field: 'unitPriceSnapshot', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'G', field: 'adjustedTotal', decimal: true, notes: 'TODO_VERIFY' },
    ],
    sanitize: ['firmas', 'nombres de responsables'],
    keyCells: [{ meaning: 'Entidades change_orders son PROVISIONALES v0 (no congeladas Oleada 1).' }],
  },
  {
    sheet: 'RESUMEN 1 PISO',
    declaredRef: 'A1:E35',
    purpose: 'Consolidado financiero del Primer piso (fuente directa de los 9 valores de regresión).',
    targets: ['indirect_cost_rules', 'estimateTotals'],
    keyCells: [
      { addr: 'TODO_VERIFY', meaning: 'costos_directos = 336084479.93690735', crossRef: ['COTIZACION 1 PISO'] },
      { addr: 'TODO_VERIFY', meaning: 'administracion = directos × 0.035 = 11762956.797791759' },
      { addr: 'TODO_VERIFY', meaning: 'imprevistos = directos × 0.025 = 8402111.998422684' },
      { addr: 'TODO_VERIFY', meaning: 'utilidad = directos × 0.04 = 13443379.197476294' },
      { addr: 'TODO_VERIFY', meaning: 'iva = utilidad × 0.19 = 2554242.047520496' },
      { addr: 'TODO_VERIFY', meaning: 'costos_indirectos = 36162690.04121123' },
      { addr: 'TODO_VERIFY', meaning: 'total_costo = 372247169.9781186' },
      { addr: 'TODO_VERIFY', meaning: 'area_construida = 236.77900000000005', crossRef: ['CANT COMPLETO'] },
      { addr: 'TODO_VERIFY', meaning: 'valor_m2 = total / area = 1572129.1583211287' },
    ],
  },
  {
    sheet: 'CANTIDADES 1 PISO',
    declaredRef: 'A1:I692',
    purpose: 'Despiece geométrico del Primer piso (largo×ancho×alto×mult, sumatorias, factores).',
    targets: ['quantity_groups', 'quantity_lines'],
    calculationMode: 'area',
    columns: [
      { col: 'A', field: 'description', notes: 'Elemento medido. TODO_VERIFY' },
      { col: 'B', field: 'length', decimal: true, notes: 'Largo. TODO_VERIFY' },
      { col: 'C', field: 'width', decimal: true, notes: 'Ancho. TODO_VERIFY' },
      { col: 'D', field: 'height', decimal: true, notes: 'Alto. TODO_VERIFY' },
      { col: 'E', field: 'multiplier', decimal: true, notes: 'Cantidad/repeticiones. TODO_VERIFY' },
      { col: 'F', field: 'calculatedQuantity', decimal: true, notes: 'Resultado del despiece. TODO_VERIFY' },
    ],
    keyCells: [
      { meaning: 'Modo 1 cantidad directa vs Modo 2 despiece geométrico (PROJECT_MASTER §3.3.A).' },
      { meaning: 'factores de desperdicio / retiro / expansión aplicados a la cantidad.' },
    ],
  },
  {
    sheet: 'CANTIDADES',
    declaredRef: 'A1:I680',
    purpose: 'Cantidades generales (todos los alcances).',
    targets: ['quantity_groups', 'quantity_lines'],
    calculationMode: 'area',
    columns: [
      { col: 'A', field: 'description', notes: 'TODO_VERIFY' },
      { col: 'B', field: 'length', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'C', field: 'width', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'D', field: 'height', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'E', field: 'multiplier', decimal: true, notes: 'TODO_VERIFY' },
      { col: 'F', field: 'calculatedQuantity', decimal: true, notes: 'TODO_VERIFY' },
    ],
  },
  {
    sheet: 'LISTADO MATERIALES',
    declaredRef: 'A1:G136',
    purpose: 'Catálogo de materiales: precio proveedor, variación preventiva 3%, proveedores.',
    targets: ['resources', 'suppliers', 'supplier_products', 'price_observations', 'pricing_rules'],
    columns: [
      { col: 'A', field: 'name', notes: 'Descripción material. TODO_VERIFY' },
      { col: 'B', field: 'unit', notes: 'Unidad. TODO_VERIFY' },
      { col: 'C', field: 'observedPrice', decimal: true, notes: 'VR. UNITARIO (proveedor). TODO_VERIFY' },
      { col: 'D', field: 'budgetReferencePrice', decimal: true, notes: '3% VAR → precio×1.03. TODO_VERIFY' },
      { col: 'E', field: 'supplierName', notes: 'Proveedor → SANITIZAR. TODO_VERIFY' },
    ],
    sanitize: ['nombre de proveedor', 'SKU', 'URL'],
    keyCells: [
      { meaning: 'budget_reference_price = observed_price × 1.03 → pricing_rule preventive_variation 0.03 (PROJECT_MASTER §3.3.C).' },
      { meaning: 'Proveedores: Homecenter, HB, Meléndez, Delta, Imperplak SAS → alias (PROJECT_MASTER §3.3.D).' },
    ],
  },
  {
    sheet: 'CANT COMPLETO',
    declaredRef: 'A1:U215',
    purpose: 'Cálculos auxiliares y consolidación de cantidades (incluye área construida).',
    targets: ['quantity_groups', 'quantity_lines', 'estimateTotals.area_construida'],
    keyCells: [
      { addr: 'TODO_VERIFY', meaning: 'area_construida = 236.77900000000005 (insumo del valor por m²).' },
    ],
  },
];

/** Hojas esperadas (validación de completitud). */
export const EXPECTED_SHEETS: readonly string[] = SHEET_SPECS.map((s) => s.sheet);
