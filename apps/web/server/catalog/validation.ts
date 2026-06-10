/**
 * validation.ts — Validacion pura de inputs de catalogo de recursos (Bootstrap CTAs).
 * Propiedad: agent-frontend-boq.
 *
 * Sin dependencias de DB. Solo logic pura. Lanza ResourceValidationError con
 * un array de issues si hay errores. No lanza si el input es valido.
 *
 * Reglas:
 *  - code: obligatorio, trim, 1-40 chars, solo [A-Za-z0-9._-]
 *  - name: obligatorio, trim, 1-160 chars
 *  - resourceType: uno de los valores validos del enum ResourceType
 *  - unit: obligatorio, trim, 1-20 chars
 */
import { ResourceValidationError } from './errors';
import type { ResourceCreateInput, ResourceType } from './types';

const VALID_RESOURCE_TYPES: ResourceType[] = [
  'material',
  'labor',
  'equipment',
  'tool',
  'subcontract',
  'other',
];

const CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

export function validateResourceCreateInput(
  raw: ResourceCreateInput,
): ResourceCreateInput {
  const issues: Array<{ field: string; message: string }> = [];

  // code
  const code = (raw.code ?? '').trim();
  if (!code) {
    issues.push({ field: 'code', message: 'El codigo es obligatorio.' });
  } else if (code.length > 40) {
    issues.push({
      field: 'code',
      message: 'El codigo no puede superar 40 caracteres.',
    });
  } else if (!CODE_PATTERN.test(code)) {
    issues.push({
      field: 'code',
      message:
        'El codigo solo puede contener letras, numeros, puntos, guiones y guiones bajos.',
    });
  }

  // name
  const name = (raw.name ?? '').trim();
  if (!name) {
    issues.push({ field: 'name', message: 'El nombre es obligatorio.' });
  } else if (name.length > 160) {
    issues.push({
      field: 'name',
      message: 'El nombre no puede superar 160 caracteres.',
    });
  }

  // resourceType
  if (
    !raw.resourceType ||
    !(VALID_RESOURCE_TYPES as string[]).includes(raw.resourceType)
  ) {
    issues.push({
      field: 'resourceType',
      message: `Tipo de recurso invalido. Valores validos: ${VALID_RESOURCE_TYPES.join(', ')}.`,
    });
  }

  // unit
  const unit = (raw.unit ?? '').trim();
  if (!unit) {
    issues.push({ field: 'unit', message: 'La unidad es obligatoria.' });
  } else if (unit.length > 20) {
    issues.push({
      field: 'unit',
      message: 'La unidad no puede superar 20 caracteres.',
    });
  }

  if (issues.length > 0) {
    throw new ResourceValidationError(issues);
  }

  return { code, name, resourceType: raw.resourceType, unit };
}
