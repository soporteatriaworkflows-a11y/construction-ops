/**
 * pdf-intake-access.test.ts — Acceso local a F3/F6A (hotfix).
 *
 * Cubre: takeoff demo de lectura asistida (puro, idempotente, sin DB),
 * estados de carga con salida (no "Cargando" indefinido sin explicación) y
 * cableado estático de la sección "Lectura asistida desde PDF/plano" en el
 * workspace (patrón de análisis estático ya usado en access-wiring).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEMO_INTAKE_TAKEOFF_ID,
  ensureDemoIntakeTakeoff,
  isManualTakeoffId,
  type ManualTakeoffRecord,
} from '@/lib/steel/manual-takeoff';
import { parseStoredManualTakeoffs } from '@/lib/steel/manual-store';

const COMPONENTS_DIR = path.join(
  process.cwd(),
  'app',
  '(dashboard)',
  'steel',
  'takeoffs',
  '_components',
);

function readComponent(name: string): string {
  return readFileSync(path.join(COMPONENTS_DIR, name), 'utf8');
}

describe('takeoff demo de lectura asistida (sin DB)', () => {
  it('crea el takeoff demo con id manual valido cuando no existe', () => {
    const ensured = ensureDemoIntakeTakeoff([], '2026-07-04');
    expect(ensured.created).toBe(true);
    expect(ensured.id).toBe(DEMO_INTAKE_TAKEOFF_ID);
    expect(isManualTakeoffId(ensured.id)).toBe(true);

    const demo = ensured.records.find((t) => t.id === DEMO_INTAKE_TAKEOFF_ID)!;
    expect(demo.status).toBe('draft');
    expect(demo.lines).toEqual([]);
    expect(demo.name).toContain('lectura asistida');
  });

  it('es idempotente y preserva los takeoffs existentes', () => {
    const existing: ManualTakeoffRecord = {
      id: 'mtk-abc-12345',
      name: 'Takeoff real',
      projectName: 'Proyecto',
      scopeLabel: 'Piso 1',
      status: 'in_review',
      createdAt: '2026-07-01',
      lines: [{ id: 'l1', originalDescription: '5#5600', assumedWastePct: '5' }],
    };
    const first = ensureDemoIntakeTakeoff([existing]);
    expect(first.created).toBe(true);
    expect(first.records).toHaveLength(2);
    expect(first.records[0]).toBe(existing);

    const second = ensureDemoIntakeTakeoff(first.records);
    expect(second.created).toBe(false);
    expect(second.records).toBe(first.records);
  });

  it('el demo sobrevive el ciclo de persistencia local (sin DB)', () => {
    const ensured = ensureDemoIntakeTakeoff([]);
    const roundTrip = parseStoredManualTakeoffs(JSON.stringify(ensured.records));
    expect(roundTrip.map((t) => t.id)).toContain(DEMO_INTAKE_TAKEOFF_ID);
  });
});

describe('acceso UX a F3/F6A (analisis estatico de componentes)', () => {
  const section = readComponent('manual-takeoffs-section.tsx');
  const workspace = readComponent('manual-takeoff-workspace.tsx');
  const intake = readComponent('manual-pdf-intake-section.tsx');

  it('el listado no muestra un "Cargando" sin salida: el fallback explica como recuperarse', () => {
    expect(section).not.toContain('Cargando takeoffs locales');
    expect(section).toContain('recarga la');
  });

  it('el workspace no muestra un "Cargando" sin salida y ofrece demo cuando el takeoff no existe', () => {
    expect(workspace).not.toContain('Cargando takeoff local');
    expect(workspace).toContain('recarga la');
    expect(workspace).toContain('Takeoff manual no encontrado en este navegador');
    expect(workspace).toContain('ensureDemoIntakeTakeoff');
    expect(workspace).toContain('Probar lectura asistida desde PDF/plano');
  });

  it('el listado ofrece la entrada "Probar lectura asistida desde PDF/plano"', () => {
    expect(section).toContain('Probar lectura asistida desde PDF/plano');
    expect(section).toContain('ensureDemoIntakeTakeoff');
  });

  it('el workspace muestra la seccion "Lectura asistida desde PDF/plano" con la seccion F6A cableada', () => {
    expect(workspace).toContain('Lectura asistida desde PDF/plano');
    expect(workspace).toContain('<ManualPdfIntakeSection');
    expect(intake).toContain('Lectura asistida desde PDF/plano');
  });

  it('la seccion F6A conserva el copy obligatorio de fase', () => {
    expect(intake).toContain('Lectura asistida preliminar. No reemplaza revision tecnica.');
    expect(intake).toContain('No se aprueban cantidades automaticamente');
    expect(intake).toContain('no infiere escala ni geometria');
    expect(intake).toContain(
      'No hay informacion suficiente para cantidad automatica; se requiere seleccion, calibracion o revision manual.',
    );
  });

  it('las escrituras locales usan el store fresco (loadManualTakeoffs), no el snapshot renderizado', () => {
    expect(section).toContain('loadManualTakeoffs()');
    expect(workspace).toContain('loadManualTakeoffs()');
  });

  it('el flujo local no importa nada de DB/Supabase/server', () => {
    for (const source of [section, workspace, intake]) {
      const importLines = source
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b|\bfrom\s+['"]/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/supabase|@\/server\//i);
      }
    }
  });
});
