/**
 * types.ts — DTOs del constructor manual de APU (APU_MANUAL_BUILDER_V1).
 *
 * Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md §3, §4.
 *
 * Estos tipos viajan entre la UI (formulario) y el servicio server-side. Los
 * PRECIOS y SUBTOTALES nunca se confían desde el navegador: el material toma su
 * snapshot del precio aprobado vigente (server-side) y la mano de obra del costo
 * diario integral del rol (dominio). El navegador solo provee selección,
 * cantidades, rendimientos y desperdicios.
 */
import type { DecimalString, ResourceType, Uuid } from '@/lib/utils/types';

/** Encabezado de un APU manual. */
export interface ManualApuHeaderInput {
  /** Código visible, único por organización. */
  code: string;
  /** Descripción de la actividad. */
  name: string;
  /** Unidad (se canonicaliza server-side). */
  unit: string;
  /** Fracción [0,1] de herramienta menor derivada (p. ej. "0.05"). */
  defaultToolPct: DecimalString;
  /** Notas/descripción opcional. */
  description?: string;
}

/** Componente material: referencia a un recurso del catálogo. */
export interface ManualMaterialInput {
  resourceId: Uuid;
  /** Cantidad o rendimiento por unidad de actividad. No negativa. */
  quantity: DecimalString;
  /** Desperdicio como fracción (p. ej. "0.08"). No negativo. */
  wastePct: DecimalString;
  notes?: string;
}

/** Componente de mano de obra: referencia a un rol salarial. */
export interface ManualLaborInput {
  laborRoleId: Uuid;
  /** Rendimiento en días del rol por unidad de actividad (p. ej. "0.2"). */
  performanceDays: DecimalString;
  /** Integrantes de este rol en la cuadrilla (p. ej. "2"). */
  memberCount: DecimalString;
  notes?: string;
}

/** Entrada completa del constructor manual. */
export interface ManualApuInput {
  header: ManualApuHeaderInput;
  materials: ManualMaterialInput[];
  labor: ManualLaborInput[];
}

/** Opción de material en el selector (precio aprobado server-side). */
export interface MaterialOption {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  resourceType: ResourceType;
  /** Precio aprobado vigente; `null` si no hay (no se puede usar como material). */
  approvedPrice: DecimalString | null;
}

/** Opción de rol de mano de obra (costos integrales calculados server-side). */
export interface LaborRoleOption {
  id: Uuid;
  code: string;
  name: string;
  dailyIntegralCost: DecimalString;
  hourlyIntegralCost: DecimalString;
}

/** Datos para poblar el formulario del constructor. */
export interface ApuBuilderData {
  materials: MaterialOption[];
  laborRoles: LaborRoleOption[];
}

/** Línea calculada de un componente (preview server-side). */
export interface ManualApuComponentPreview {
  kind: 'material' | 'labor';
  refId: Uuid;
  label: string;
  unit: string;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
}

/** Resumen calculado server-side del APU manual antes de crear. */
export interface ManualApuPreview {
  components: ManualApuComponentPreview[];
  materialsCost: DecimalString;
  laborCost: DecimalString;
  toolDerivedCost: DecimalString;
  unitCostTotal: DecimalString;
}

/** Resultado de crear un APU manual. */
export interface CreateManualApuResult {
  apuTemplateId: Uuid;
  code: string;
  componentCount: number;
}

/** Datos de un APU origen para precargar el formulario "Duplicar para corregir". */
export interface CopyFromApuData {
  header: {
    code: string;       // código original (el usuario deberá editar)
    name: string;
    unit: string;
    defaultToolPct: string; // fracción [0,1]
    description?: string;
  };
  materials: {
    resourceId: string;
    quantity: string;   // cantidad original
    wastePct: string;   // fracción [0,1]
    notes?: string;
  }[];
  labor: {
    laborRoleId: string;
    /**
     * Para prefill: se usa la cantidad almacenada (days × count) como
     * performanceDays con memberCount=1. El usuario debe ajustar.
     */
    performanceDays: string;
    memberCount: string;  // siempre '1' en la precarga
    notes?: string;
  }[];
  /** Nombre descriptivo del APU origen (para aviso al usuario). */
  originName: string;
  /** Si el APU origen está archivado (para mostrar aviso). */
  isArchived: boolean;
}

/** Resultado del preview server-side (serializable para la server action). */
export interface SerializableManualApuPreview {
  ok: boolean;
  error?: string;
  components?: {
    kind: 'material' | 'labor';
    label: string;
    unit: string;
    quantity: string;
    wastePct: string;
    unitPriceSnapshot: string;
    totalComponentCost: string;
  }[];
  materialsCost?: string;
  laborCost?: string;
  toolDerivedCost?: string;
  unitCostTotal?: string;
}
