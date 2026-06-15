/**
 * form-gating.ts — Lógica PURA de habilitación del formulario /planning/new.
 *
 * Sin React, sin DOM: testeable en entorno node. Centraliza el contrato de los
 * botones para que la UI nunca quede "deshabilitada sin explicación":
 *
 *   - Vista previa: habilitada cuando hay proyecto + versión + fecha válida.
 *     NO requiere nombre ni un preview previo, y NUNCA depende de un preview o
 *     error anterior (un fallo previo no bloquea reintentar).
 *   - Crear: habilitado SOLO con `previewOk === true` y nombre presente.
 *   - Cuando algo está deshabilitado, se expone el motivo (`missing`/`createHint`)
 *     para mostrarlo al usuario.
 *
 * Las entradas que afectan el cálculo del cronograma invalidan el preview en la
 * capa de UI (ver `new-schedule-form.tsx`), de modo que `previewOk` vuelve a
 * `null` y obliga a re-previsualizar antes de crear.
 */

export interface FormGatingInput {
  projectId: string;
  versionId: string;
  name: string;
  startDate: string;
  /** Resultado del último preview: `null` = no corrido, `true/false` = ok/fallo. */
  previewOk: boolean | null;
  /** Hay una server action en curso (useTransition). */
  isPending: boolean;
}

export interface FormGating {
  canPreview: boolean;
  canCreate: boolean;
  /** Campos faltantes para poder previsualizar (vacío si están completos). */
  missing: string[];
  /** Motivo por el que Crear está deshabilitado (null si está habilitado). */
  createHint: string | null;
}

/** Valida una fecha ISO `yyyy-mm-dd` real (no solo el formato). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Deriva el estado de habilitación de los botones a partir del estado del form. */
export function deriveFormGating(input: FormGatingInput): FormGating {
  const hasProject = input.projectId.trim() !== '';
  const hasVersion = input.versionId.trim() !== '';
  const hasDate = isValidIsoDate(input.startDate);
  const hasName = input.name.trim() !== '';

  const missing: string[] = [];
  if (!hasProject) missing.push('proyecto');
  if (!hasVersion) missing.push('presupuesto / versión');
  if (!hasDate) missing.push('fecha de inicio válida');

  const fieldsReady = hasProject && hasVersion && hasDate;
  // Vista previa: SOLO depende de campos mínimos + que no haya acción en curso.
  // Independiente de cualquier preview/error anterior (permite reintentar).
  const canPreview = fieldsReady && !input.isPending;

  let canCreate = false;
  let createHint: string | null = null;
  if (input.isPending) {
    createHint = null; // transitorio: no se muestra motivo
  } else if (!fieldsReady) {
    createHint = `Completa ${missing.join(', ')} y genera una vista previa antes de crear.`;
  } else if (input.previewOk === null) {
    createHint = 'Genera una vista previa válida antes de crear.';
  } else if (input.previewOk === false) {
    createHint = 'Corrige la vista previa (no hay actividades válidas) antes de crear.';
  } else if (!hasName) {
    createHint = 'Ingresa un nombre para el cronograma.';
  } else {
    canCreate = true;
  }

  return { canPreview, canCreate, missing, createHint };
}
