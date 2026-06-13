/**
 * service.ts — Servicio del constructor manual de APU (APU_MANUAL_BUILDER_V1).
 *
 * Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md §3.
 *
 * Composición pura del dominio (`modules/apu`) + persistencia atómica vía RPC.
 *  - organizationId / actor SIEMPRE server-side.
 *  - Precio de material = aprobado vigente (server-side); el navegador no lo dicta.
 *  - Costo de M.O. = costo diario integral del rol (dominio canónico).
 *  - Subtotales/cálculos con Decimal; sin redondeo intermedio.
 *  - NO aprueba precios, NO toca catálogo, NO toca BOQ, NO toca quantities/AIU.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import { canonicalizeUnit } from '@/server/pricing/units';
import { toDecimal } from '@/modules/apu/decimal';
import {
  calculateApuComponentCost,
  calculateApuUnitCostFull,
  type ApuComponentCostEntry,
} from '@/modules/apu/apu';
import type {
  ApuBuilderData,
  CreateManualApuResult,
  ManualApuInput,
  ManualApuPreview,
  ManualApuComponentPreview,
} from '@/lib/apu-builder/types';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
  ResourceWithoutApprovedPriceError,
} from './errors';
import { DbApuBuilderRepository, type ManualApuPayload } from './db-repository';

const ALLOWED_ROLES = ['management', 'internal'] as const;

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(ALLOWED_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

function requireDecimal(label: string, value: string, opts: { min?: number; max?: number } = {}): string {
  let d;
  try {
    d = toDecimal(value);
  } catch {
    throw new ApuBuilderValidationError(`${label}: valor numérico inválido ("${value}")`);
  }
  if (d.isNaN()) throw new ApuBuilderValidationError(`${label}: valor numérico inválido`);
  if (opts.min !== undefined && d.lessThan(opts.min)) {
    throw new ApuBuilderValidationError(`${label}: no puede ser menor que ${opts.min}`);
  }
  if (opts.max !== undefined && d.greaterThan(opts.max)) {
    throw new ApuBuilderValidationError(`${label}: no puede ser mayor que ${opts.max}`);
  }
  return d.toFixed();
}

/**
 * Calcula el resumen server-side de un APU manual a partir de la entrada y los
 * datos de catálogo/roles. Función PURA (sin IO): usa el dominio canónico.
 * Lanza si un material no tiene precio aprobado o si una referencia no existe.
 */
export function previewManualApu(input: ManualApuInput, data: ApuBuilderData): ManualApuPreview {
  validateHeader(input);
  if (input.materials.length === 0 && input.labor.length === 0) {
    throw new ApuBuilderValidationError('El APU debe tener al menos un componente');
  }

  const materialById = new Map(data.materials.map((m) => [m.id, m]));
  const roleById = new Map(data.laborRoles.map((r) => [r.id, r]));
  const components: ManualApuComponentPreview[] = [];

  for (const m of input.materials) {
    const res = materialById.get(m.resourceId);
    if (!res) throw new ApuBuilderValidationError(`Material no disponible: ${m.resourceId}`);
    if (res.approvedPrice === null) throw new ResourceWithoutApprovedPriceError(m.resourceId);
    const quantity = requireDecimal('cantidad de material', m.quantity, { min: 0 });
    const wastePct = requireDecimal('desperdicio', m.wastePct, { min: 0 });
    const totalComponentCost = calculateApuComponentCost({
      componentType: 'material',
      quantity,
      wastePct,
      unitPriceSnapshot: res.approvedPrice,
    });
    components.push({
      kind: 'material',
      refId: res.id,
      label: `${res.code} · ${res.name}`,
      unit: res.unit,
      quantity,
      wastePct,
      unitPriceSnapshot: res.approvedPrice,
      totalComponentCost,
    });
  }

  for (const l of input.labor) {
    const role = roleById.get(l.laborRoleId);
    if (!role) throw new ApuBuilderValidationError(`Rol de M.O. no disponible: ${l.laborRoleId}`);
    const days = requireDecimal('rendimiento (días)', l.performanceDays, { min: 0 });
    const count = requireDecimal('integrantes', l.memberCount, { min: 0 });
    const quantity = toDecimal(days).times(toDecimal(count)).toFixed();
    const totalComponentCost = calculateApuComponentCost({
      componentType: 'labor',
      quantity,
      wastePct: '0',
      unitPriceSnapshot: role.dailyIntegralCost,
    });
    components.push({
      kind: 'labor',
      refId: role.id,
      label: `${role.code} · ${role.name}`,
      unit: 'día·persona',
      quantity,
      wastePct: '0',
      unitPriceSnapshot: role.dailyIntegralCost,
      totalComponentCost,
    });
  }

  const toolPct = requireDecimal('herramienta menor (%)', input.header.defaultToolPct, { min: 0, max: 1 });
  const entries: ApuComponentCostEntry[] = components.map((c) => ({
    componentType: c.kind === 'material' ? 'material' : 'labor',
    totalComponentCost: c.totalComponentCost,
  }));
  const breakdown = calculateApuUnitCostFull(entries, toolPct);

  return {
    components,
    materialsCost: breakdown.materials,
    laborCost: breakdown.labor,
    toolDerivedCost: breakdown.toolDerived,
    unitCostTotal: breakdown.total,
  };
}

function validateHeader(input: ManualApuInput): void {
  const code = input.header.code?.trim() ?? '';
  const name = input.header.name?.trim() ?? '';
  const unit = canonicalizeUnit(input.header.unit).raw.trim();
  if (code === '') throw new ApuBuilderValidationError('El código del APU es obligatorio');
  if (name === '') throw new ApuBuilderValidationError('La descripción de la actividad es obligatoria');
  if (unit === '') throw new ApuBuilderValidationError('La unidad del APU es obligatoria');
}

/** Construye el payload de la RPC `create_manual_apu`. */
function buildPayload(
  input: ManualApuInput,
  data: ApuBuilderData,
  idempotencyKey?: string,
): ManualApuPayload {
  const roleById = new Map(data.laborRoles.map((r) => [r.id, r]));
  const components: ManualApuPayload['components'] = [];

  for (const m of input.materials) {
    components.push({
      componentType: 'material',
      resourceId: m.resourceId,
      quantity: requireDecimal('cantidad de material', m.quantity, { min: 0 }),
      wastePct: requireDecimal('desperdicio', m.wastePct, { min: 0 }),
      notes: m.notes?.trim() || undefined,
    });
  }
  for (const l of input.labor) {
    const role = roleById.get(l.laborRoleId);
    if (!role) throw new ApuBuilderValidationError(`Rol de M.O. no disponible: ${l.laborRoleId}`);
    const days = requireDecimal('rendimiento (días)', l.performanceDays, { min: 0 });
    const count = requireDecimal('integrantes', l.memberCount, { min: 0 });
    components.push({
      componentType: 'labor',
      laborRoleId: l.laborRoleId,
      quantity: toDecimal(days).times(toDecimal(count)).toFixed(),
      wastePct: '0',
      unitPriceSnapshot: role.dailyIntegralCost, // costo diario integral (dominio)
      notes: l.notes?.trim() || undefined,
    });
  }

  return {
    header: {
      code: input.header.code.trim(),
      name: input.header.name.trim(),
      unit: canonicalizeUnit(input.header.unit).raw.trim(),
      defaultToolPct: requireDecimal('herramienta menor (%)', input.header.defaultToolPct, {
        min: 0,
        max: 1,
      }),
      description: input.header.description?.trim() || undefined,
    },
    components,
    idempotencyKey,
  };
}

/**
 * Crea un APU manual. Valida rol/modo, calcula server-side y persiste vía RPC.
 *
 * @returns id, código y nº de componentes del APU creado.
 */
export async function createManualApu(
  viewer: AuthenticatedViewer,
  input: ManualApuInput,
  opts: { idempotencyKey?: string; repo?: DbApuBuilderRepository } = {},
): Promise<CreateManualApuResult> {
  checkRole(viewer);
  if (!isCreationModeEnabled()) throw new ApuBuilderWriteNotSupportedError();

  const repo = opts.repo ?? new DbApuBuilderRepository();
  const data = await repo.loadBuilderData(viewer);

  // Valida + calcula server-side (lanza ante material sin precio o referencia
  // inexistente). El preview no se persiste; es la garantía de validación.
  previewManualApu(input, data);

  const payload = buildPayload(input, data, opts.idempotencyKey);
  return repo.createManualApu(viewer, payload);
}

/** Carga los datos para poblar el formulario del constructor. */
export async function loadApuBuilderData(
  viewer: AuthenticatedViewer,
  repo: DbApuBuilderRepository = new DbApuBuilderRepository(),
): Promise<ApuBuilderData> {
  checkRole(viewer);
  return repo.loadBuilderData(viewer);
}
