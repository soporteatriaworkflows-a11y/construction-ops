/**
 * apu-boq-link.test.ts — Helpers PUROS de "Vincular a BOQ desde tarjetas"
 * (APU_LIBRARY_BOQ_LINK_FROM_CARDS_V1). Sin DB, sin cálculo financiero. La
 * mutación real (alta de partida) la cubre el dominio boq-add / RPC existente;
 * aquí se prueba la elegibilidad de UI, el estado editable y la compatibilidad
 * de unidades para advertencias.
 */
import { describe, it, expect } from 'vitest';
import {
  apuLinkEligibility,
  isEditableVersionStatus,
  normalizeUnit,
  unitsCompatible,
  versionStatusLabel,
} from '@/lib/apu-library/boq-link';

describe('apuLinkEligibility — elegibilidad de la tarjeta', () => {
  it('1. APU listo + canMutate ⇒ vinculable (botón visible/activo)', () => {
    expect(apuLinkEligibility({ completenessState: 'ready', canMutate: true })).toEqual({
      canLink: true,
    });
  });

  it('review (solo advertencias) ⇒ vinculable', () => {
    expect(apuLinkEligibility({ completenessState: 'review', canMutate: true }).canLink).toBe(true);
  });

  it('2. APU archivado ⇒ NO vinculable', () => {
    const e = apuLinkEligibility({ completenessState: 'archived', canMutate: true });
    expect(e.canLink).toBe(false);
    expect(e.reason).toBe('archived');
    expect(e.message).toMatch(/archivado/i);
  });

  it('3. APU incompleto crítico ⇒ NO vinculable', () => {
    const e = apuLinkEligibility({ completenessState: 'incomplete', canMutate: true });
    expect(e.canLink).toBe(false);
    expect(e.reason).toBe('incomplete');
  });

  it('5. sin permiso/modo edición (canMutate=false) ⇒ NO vinculable', () => {
    const e = apuLinkEligibility({ completenessState: 'ready', canMutate: false });
    expect(e.canLink).toBe(false);
    expect(e.reason).toBe('not_allowed');
  });

  it('archivado tiene prioridad sobre canMutate', () => {
    expect(apuLinkEligibility({ completenessState: 'archived', canMutate: false }).reason).toBe(
      'archived',
    );
  });
});

describe('isEditableVersionStatus — solo borrador/revisión', () => {
  it('4. draft y review ⇒ editable', () => {
    expect(isEditableVersionStatus('draft')).toBe(true);
    expect(isEditableVersionStatus('review')).toBe(true);
  });

  it('4. approved/issued/archived ⇒ NO editable (presupuesto bloqueado)', () => {
    expect(isEditableVersionStatus('approved')).toBe(false);
    expect(isEditableVersionStatus('issued')).toBe(false);
    expect(isEditableVersionStatus('archived')).toBe(false);
  });
});

describe('versionStatusLabel', () => {
  it('traduce estados a etiquetas legibles', () => {
    expect(versionStatusLabel('draft')).toBe('Borrador');
    expect(versionStatusLabel('approved')).toBe('Aprobada');
    expect(versionStatusLabel('issued')).toBe('Emitida');
  });
});

describe('normalizeUnit / unitsCompatible — advertencia de unidad', () => {
  it('normaliza superíndices y espacios/mayúsculas', () => {
    expect(normalizeUnit('M²')).toBe('m2');
    expect(normalizeUnit(' m 3 ')).toBe('m3');
    expect(normalizeUnit('ML')).toBe('ml');
  });

  it('6. unidades equivalentes ⇒ compatibles (sin advertencia)', () => {
    expect(unitsCompatible('m2', 'M²')).toBe(true);
    expect(unitsCompatible('ml', 'ML')).toBe(true);
  });

  it('6. unidades distintas ⇒ incompatibles (muestra advertencia)', () => {
    expect(unitsCompatible('m2', 'ml')).toBe(false);
    expect(unitsCompatible('und', 'm3')).toBe(false);
  });

  it('unidad vacía ⇒ incompatible (no asume coincidencia)', () => {
    expect(unitsCompatible('', 'm2')).toBe(false);
    expect(unitsCompatible('m2', '')).toBe(false);
  });
});
