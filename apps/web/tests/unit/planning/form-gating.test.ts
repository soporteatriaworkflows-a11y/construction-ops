/**
 * form-gating.test.ts — Contrato de habilitación de /planning/new.
 *
 * Reproduce y blinda el bug de "ambos botones deshabilitados sin explicación"
 * y el contrato Vista previa / Crear (SCHEDULE_PROD_RUNTIME_ROOT_CAUSE_V3).
 */
import { describe, it, expect } from 'vitest';
import { deriveFormGating, isValidIsoDate } from '@/app/(dashboard)/planning/new/form-gating';

const base = {
  projectId: 'p1',
  versionId: 'v1',
  name: 'ENTRE PATIOS CALI',
  startDate: '2026-06-22',
  previewOk: null as boolean | null,
  isPending: false,
};

describe('isValidIsoDate', () => {
  it('acepta una fecha ISO real', () => {
    expect(isValidIsoDate('2026-06-22')).toBe(true);
  });
  it('rechaza formato local dd/mm/yyyy', () => {
    expect(isValidIsoDate('22/06/2026')).toBe(false);
  });
  it('rechaza fechas imposibles', () => {
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('deriveFormGating — Vista previa', () => {
  it('habilita Vista previa con proyecto + versión + fecha, SIN requerir nombre ni preview previo', () => {
    const g = deriveFormGating({ ...base, name: '', previewOk: null });
    expect(g.canPreview).toBe(true);
  });

  it('un preview fallido anterior NO bloquea volver a Vista previa', () => {
    const g = deriveFormGating({ ...base, previewOk: false });
    expect(g.canPreview).toBe(true);
  });

  it('deshabilita Vista previa si falta la versión (y lo reporta)', () => {
    const g = deriveFormGating({ ...base, versionId: '' });
    expect(g.canPreview).toBe(false);
    expect(g.missing).toContain('presupuesto / versión');
  });

  it('deshabilita Vista previa si falta el proyecto', () => {
    const g = deriveFormGating({ ...base, projectId: '' });
    expect(g.canPreview).toBe(false);
    expect(g.missing).toContain('proyecto');
  });

  it('deshabilita Vista previa con fecha inválida', () => {
    const g = deriveFormGating({ ...base, startDate: '22/06/2026' });
    expect(g.canPreview).toBe(false);
    expect(g.missing).toContain('fecha de inicio válida');
  });

  it('deshabilita Vista previa mientras hay una acción en curso', () => {
    const g = deriveFormGating({ ...base, isPending: true });
    expect(g.canPreview).toBe(false);
  });
});

describe('deriveFormGating — Crear', () => {
  it('Crear deshabilitado mientras no se haya corrido un preview', () => {
    const g = deriveFormGating({ ...base, previewOk: null });
    expect(g.canCreate).toBe(false);
    expect(g.createHint).toMatch(/vista previa/i);
  });

  it('Crear deshabilitado si el preview falló', () => {
    const g = deriveFormGating({ ...base, previewOk: false });
    expect(g.canCreate).toBe(false);
    expect(g.createHint).toMatch(/actividades/i);
  });

  it('Crear deshabilitado con preview ok pero sin nombre', () => {
    const g = deriveFormGating({ ...base, previewOk: true, name: '   ' });
    expect(g.canCreate).toBe(false);
    expect(g.createHint).toMatch(/nombre/i);
  });

  it('Crear habilitado SOLO con preview.ok === true y nombre presente', () => {
    const g = deriveFormGating({ ...base, previewOk: true });
    expect(g.canCreate).toBe(true);
    expect(g.createHint).toBeNull();
  });

  it('Crear deshabilitado mientras hay una acción en curso', () => {
    const g = deriveFormGating({ ...base, previewOk: true, isPending: true });
    expect(g.canCreate).toBe(false);
  });

  it('Crear nunca se habilita sin preview aunque todos los campos estén llenos', () => {
    const g = deriveFormGating({ ...base, previewOk: null });
    expect(g.canCreate).toBe(false);
  });
});
