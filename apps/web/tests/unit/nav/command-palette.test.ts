/**
 * command-palette.test.ts — Lógica pura de la paleta de comandos
 * (ICONIC_COMMAND_SEARCH_V1). Solo navegación/datos; sin server ni módulos.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCommandItems,
  filterCommands,
  groupCommands,
  COMMAND_GROUP_ORDER,
} from '@/components/shared/command-palette-data';

describe('command-palette — buildCommandItems', () => {
  it('sin gestión de accesos: NO incluye Administración / Accesos', () => {
    const items = buildCommandItems(false);
    expect(items.some((i) => i.group === 'Administración')).toBe(false);
    expect(items.some((i) => i.href === '/settings/access')).toBe(false);
  });

  it('con gestión de accesos: incluye Accesos / Usuarios en Administración', () => {
    const items = buildCommandItems(true);
    const access = items.find((i) => i.href === '/settings/access');
    expect(access).toBeDefined();
    expect(access!.group).toBe('Administración');
  });

  it('expone los módulos principales en Navegación', () => {
    const nav = buildCommandItems(false).filter((i) => i.group === 'Navegación').map((i) => i.href);
    expect(nav).toEqual([
      '/dashboard',
      '/projects',
      '/estimates',
      '/apu',
      '/catalog',
      '/quantities',
      '/planning',
      '/settings',
    ]);
  });

  it('todas las rutas son internas, absolutas y sin duplicados', () => {
    const items = buildCommandItems(true);
    const hrefs = items.map((i) => i.href);
    expect(hrefs.every((h) => h.startsWith('/'))).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('solo usa rutas existentes (lista blanca verificada contra el árbol de app)', () => {
    const allowed = new Set([
      '/dashboard',
      '/quote',
      '/projects',
      '/projects/new',
      '/estimates',
      '/apu',
      '/apu/import',
      '/apu/reconciliation',
      '/apu/new',
      '/catalog',
      '/catalog/import',
      '/catalog/providers',
      '/quantities',
      '/quantities/import',
      '/quantities/workspace',
      '/planning',
      '/planning/new',
      '/settings',
      '/settings/access',
    ]);
    for (const item of buildCommandItems(true)) {
      expect(allowed.has(item.href)).toBe(true);
    }
  });
});

describe('command-palette — filterCommands', () => {
  const items = buildCommandItems(true);

  it('consulta vacía → devuelve todo en orden', () => {
    expect(filterCommands(items, '')).toEqual(items);
    expect(filterCommands(items, '   ')).toEqual(items);
  });

  it('ignora acentos y mayúsculas', () => {
    const r = filterCommands(items, 'configuracion');
    expect(r.some((i) => i.href === '/settings')).toBe(true);
    const r2 = filterCommands(items, 'CRONOGRAMA');
    expect(r2.some((i) => i.href === '/planning')).toBe(true);
  });

  it('busca por sinónimos/keywords (no solo por label)', () => {
    // "boq" no está en el label "Presupuestos" pero sí en keywords.
    const r = filterCommands(items, 'boq');
    expect(r.some((i) => i.href === '/estimates')).toBe(true);
    // "gantt" → cronograma (nav y/o acción crear).
    expect(filterCommands(items, 'gantt').some((i) => i.href === '/planning')).toBe(true);
  });

  it('AND de términos: "importar apu" reduce a la acción de importar APU', () => {
    const r = filterCommands(items, 'importar apu');
    expect(r.map((i) => i.href)).toContain('/apu/import');
    expect(r.every((i) => i.href !== '/catalog/import')).toBe(true);
  });

  it('sin coincidencias → arreglo vacío', () => {
    expect(filterCommands(items, 'zzz-no-existe')).toEqual([]);
  });
});

describe('command-palette — groupCommands', () => {
  it('agrupa respetando COMMAND_GROUP_ORDER y omite grupos vacíos', () => {
    const sections = groupCommands(buildCommandItems(true));
    expect(sections.map((s) => s.group)).toEqual([...COMMAND_GROUP_ORDER]);
  });

  it('sin gestión de accesos: omite la sección Administración', () => {
    const sections = groupCommands(buildCommandItems(false));
    expect(sections.map((s) => s.group)).toEqual(['Navegación', 'Acciones']);
  });

  it('un filtro estricto puede dejar una sola sección', () => {
    const items = buildCommandItems(true);
    const sections = groupCommands(filterCommands(items, 'accesos'));
    expect(sections.map((s) => s.group)).toEqual(['Administración']);
  });

  it('la unión de las secciones reconstruye los ítems filtrados', () => {
    const items = buildCommandItems(true);
    const filtered = filterCommands(items, 'apu');
    const flat = groupCommands(filtered).flatMap((s) => s.items);
    expect(flat).toEqual(filtered);
  });
});
