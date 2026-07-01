/**
 * action-result.test.ts — Mapeo de errores → resultados controlados (V5.4.2b).
 * Garantiza que NUNCA se filtra un mensaje técnico de Postgres/RLS al usuario.
 */
import { describe, it, expect } from 'vitest';
import {
  toCreateErrorResult,
  toArchiveErrorResult,
  QuickNoteValidationError,
  QuickNoteInsufficientRoleError,
  QuickNoteNotFoundError,
  QuickNoteWriteNotSupportedError,
} from '@/server/quick-notes';

/** Detecta fugas de tecnicismos en un mensaje mostrado al usuario. */
function looksTechnical(s: string | undefined): boolean {
  if (!s) return false;
  return /(42501|23514|row-level security|violates|postgres|pg_|SQLSTATE|permission denied|quick_notes|error\.code)/i.test(
    s,
  );
}

describe('toCreateErrorResult', () => {
  it('validación → fieldErrors por campo', () => {
    const r = toCreateErrorResult(new QuickNoteValidationError([{ field: 'body', message: 'La nota no puede estar vacía.' }]));
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.body).toBe('La nota no puede estar vacía.');
  });

  it('rol insuficiente → mensaje curado (sin tecnicismo)', () => {
    const r = toCreateErrorResult(new QuickNoteInsufficientRoleError('create', 'client'));
    expect(r.success).toBe(false);
    expect(r.error).toBe('No tienes permiso para crear notas.');
    expect(looksTechnical(r.error)).toBe(false);
  });

  it('modo demo → mensaje curado', () => {
    const r = toCreateErrorResult(new QuickNoteWriteNotSupportedError());
    expect(r.error).toMatch(/demostración/i);
  });

  it('error desconocido (p.ej. con código Postgres) → genérico, sin tecnicismo', () => {
    const r = toCreateErrorResult(new Error('quick_note_create_failed: 42501'));
    expect(r.success).toBe(false);
    expect(looksTechnical(r.error)).toBe(false);
    expect(r.error).toBe('No se pudo guardar la nota. Intenta de nuevo.');
  });
});

describe('toArchiveErrorResult', () => {
  it('no encontrada / RLS negó → mensaje curado', () => {
    const r = toArchiveErrorResult(new QuickNoteNotFoundError('n1'));
    expect(r.error).toBe('La nota no existe o no puedes archivarla.');
    expect(looksTechnical(r.error)).toBe(false);
  });

  it('rol insuficiente → mensaje curado', () => {
    const r = toArchiveErrorResult(new QuickNoteInsufficientRoleError('archive', 'client'));
    expect(r.error).toBe('No tienes permiso para archivar esta nota.');
  });

  it('error desconocido → genérico sin tecnicismo', () => {
    const r = toArchiveErrorResult(new Error('quick_note_archive_failed: 23514'));
    expect(looksTechnical(r.error)).toBe(false);
    expect(r.error).toBe('No se pudo archivar la nota. Intenta de nuevo.');
  });
});
