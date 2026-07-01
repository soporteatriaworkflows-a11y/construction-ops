/**
 * validation-guard.test.ts — Validación de body + guard de privacidad (V5.4.2b).
 */
import { describe, it, expect } from 'vitest';
import {
  validateQuickNoteBody,
  parseQuickNoteBody,
  QuickNoteValidationError,
} from '@/server/quick-notes';
import {
  canViewQuickNotes,
  canCreateQuickNotes,
  canAttemptArchiveQuickNote,
} from '@/server/quick-notes';
import type { ViewerRole } from '@/lib/contracts/read-model';

describe('validación de body (1..1000, trim)', () => {
  it('body vacío o whitespace produce issue', () => {
    expect(validateQuickNoteBody('').length).toBe(1);
    expect(validateQuickNoteBody('   ').length).toBe(1);
    expect(validateQuickNoteBody(null).length).toBe(1);
    expect(validateQuickNoteBody(undefined).length).toBe(1);
  });

  it('body > 1000 produce issue', () => {
    expect(validateQuickNoteBody('x'.repeat(1001)).length).toBe(1);
    expect(validateQuickNoteBody('x'.repeat(1000)).length).toBe(0);
  });

  it('body válido no produce issue', () => {
    expect(validateQuickNoteBody('Revisar proveedor')).toEqual([]);
  });

  it('parseQuickNoteBody trimea y devuelve value', () => {
    expect(parseQuickNoteBody('  hola  ').value).toBe('hola');
  });

  it('parseQuickNoteBody lanza QuickNoteValidationError si inválido', () => {
    expect(() => parseQuickNoteBody('   ')).toThrow(QuickNoteValidationError);
    expect(() => parseQuickNoteBody('x'.repeat(1001))).toThrow(QuickNoteValidationError);
  });
});

describe('guard de privacidad por ViewerRole (privacy-first: client no)', () => {
  const NON_CLIENT: ViewerRole[] = ['internal', 'management', 'site'];

  it('client (=consulta) NO ve, NO crea, NO archiva', () => {
    expect(canViewQuickNotes('client')).toBe(false);
    expect(canCreateQuickNotes('client')).toBe(false);
    expect(canAttemptArchiveQuickNote('client')).toBe(false);
  });

  it('internal/management/site SÍ ven, crean y pueden intentar archivar', () => {
    for (const role of NON_CLIENT) {
      expect(canViewQuickNotes(role)).toBe(true);
      expect(canCreateQuickNotes(role)).toBe(true);
      expect(canAttemptArchiveQuickNote(role)).toBe(true);
    }
  });
});
