/**
 * helpers.test.ts — Tests unitarios de los helpers puros de exportación.
 *
 * Cubre: profile-validator, filename (sanitización), format-cop (Q9).
 * Propiedad de la lógica: agent-exports (Oleada 3C). Tests añadidos en la
 * continuación/integración por el orquestador.
 */

import { describe, it, expect } from 'vitest';
import {
  validateProfileFormat,
  isProfileFormatCompatible,
  ExportProfileFormatMismatchError,
  buildFileName,
  toSlug,
  formatDateCompact,
  formatCOP,
  decimalStringToNumber,
  formatPercent,
  FORMAT_PROFILE_COMPAT,
} from '@/modules/exports';

describe('exports/profile-validator', () => {
  it('acepta cada combinación válida del contrato', () => {
    for (const [format, profiles] of Object.entries(FORMAT_PROFILE_COMPAT)) {
      for (const profile of profiles) {
        expect(() =>
          // @ts-expect-error iteración dinámica sobre el mapa congelado
          validateProfileFormat(profile, format),
        ).not.toThrow();
      }
    }
  });

  it('rechaza combinación inválida con error tipado (xlsx-client + management)', () => {
    expect(() => validateProfileFormat('management', 'xlsx-client')).toThrow(
      ExportProfileFormatMismatchError,
    );
    expect(isProfileFormatCompatible('management', 'xlsx-client')).toBe(false);
  });

  it('csv-schedule admite los 4 perfiles', () => {
    for (const profile of ['client', 'site', 'management', 'internal'] as const) {
      expect(isProfileFormatCompatible(profile, 'csv-schedule')).toBe(true);
    }
  });

  it('xlsx-internal solo admite internal; pdf-management solo management', () => {
    expect(isProfileFormatCompatible('internal', 'xlsx-internal')).toBe(true);
    expect(isProfileFormatCompatible('client', 'xlsx-internal')).toBe(false);
    expect(isProfileFormatCompatible('management', 'pdf-management')).toBe(true);
    expect(isProfileFormatCompatible('client', 'pdf-management')).toBe(false);
  });
});

describe('exports/filename', () => {
  it('toSlug quita diacríticos, espacios y caracteres peligrosos', () => {
    expect(toSlug('Edificio Áureo / Piso 1')).toBe('edificio-aureo-piso-1');
    expect(toSlug('..\\..\\etc\\passwd')).not.toMatch(/[\\/.:]/);
    expect(toSlug('   ')).toBe('proyecto'); // fallback
  });

  it('formatDateCompact produce YYYYMMDD', () => {
    expect(formatDateCompact('2026-06-01T10:00:00.000Z')).toBe('20260601');
  });

  it('buildFileName produce nombre sanitizado sin rutas ni chars peligrosos', () => {
    const name = buildFileName('xlsx-client', 'Casa del Bosque', '2026-06-01T00:00:00.000Z');
    expect(name).toBe('presupuesto_cliente_casa-del-bosque_20260601.xlsx');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    // sin separadores de ruta
    expect(name.includes('/')).toBe(false);
    expect(name.includes('\\')).toBe(false);
  });

  it('cada formato tiene su prefijo y extensión', () => {
    expect(buildFileName('pdf-management', 'X', '2026-06-01')).toMatch(/^resumen_gerencial_.*\.pdf$/);
    expect(buildFileName('csv-schedule', 'X', '2026-06-01')).toMatch(/^cronograma_.*\.csv$/);
    expect(buildFileName('xlsx-internal', 'X', '2026-06-01')).toMatch(/^presupuesto_interno_.*\.xlsx$/);
  });
});

describe('exports/format-cop (Q9 — ROUND_HALF_UP solo en presentación)', () => {
  it('formatCOP sin decimales redondea HALF_UP', () => {
    // 1572129.158... → 1.572.129 (0 decimales)
    const s = formatCOP('1572129.158321', 'no-decimals');
    expect(s).toContain('1.572.129');
    expect(s).not.toContain(',');
  });

  it('decimalStringToNumber a 2 decimales (Excel técnico) usa HALF_UP', () => {
    expect(decimalStringToNumber('10.005', 'two-decimals')).toBe(10.01);
    expect(decimalStringToNumber('10.004', 'two-decimals')).toBe(10.0);
    expect(decimalStringToNumber('1234.5', 'no-decimals')).toBe(1235);
  });

  it('formatPercent multiplica por 100', () => {
    expect(formatPercent('0.035')).toBe('3.50%');
  });

  it('no usa float: maneja valores con muchos decimales sin perder precisión visual', () => {
    expect(decimalStringToNumber('372247169.97811858086', 'no-decimals')).toBe(372247170);
  });
});
