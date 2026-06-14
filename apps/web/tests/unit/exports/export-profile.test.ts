/**
 * export-profile.test.ts — Perfiles de exportación (CLIENT_EXPORT_PROFILE_V1).
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §6.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveExportPlan,
  isExportProfile,
  profileFilenameSuffix,
} from '@/lib/estimates/export-profile';

describe('resolveExportPlan — perfil cliente', () => {
  it('PDF cliente NO incluye fichas APU (degrada package → budget)', () => {
    expect(resolveExportPlan('client', 'package').includesApu).toBe(false);
    expect(resolveExportPlan('client', 'package').kind).toBe('budget');
  });

  it('cliente con kind apu también se degrada a budget sin APU', () => {
    const plan = resolveExportPlan('client', 'apu');
    expect(plan.kind).toBe('budget');
    expect(plan.includesApu).toBe(false);
  });

  it('cliente con budget se mantiene en budget sin APU', () => {
    const plan = resolveExportPlan('client', 'budget');
    expect(plan.kind).toBe('budget');
    expect(plan.includesApu).toBe(false);
  });
});

describe('resolveExportPlan — perfil técnico', () => {
  it('PDF técnico (package) SÍ incluye APU', () => {
    const plan = resolveExportPlan('technical', 'package');
    expect(plan.kind).toBe('package');
    expect(plan.includesApu).toBe(true);
  });

  it('técnico honra budget (retrocompatible)', () => {
    const plan = resolveExportPlan('technical', 'budget');
    expect(plan.kind).toBe('budget');
    expect(plan.includesApu).toBe(false);
  });

  it('técnico honra apu', () => {
    expect(resolveExportPlan('technical', 'apu').includesApu).toBe(true);
  });
});

describe('helpers', () => {
  it('isExportProfile discrimina', () => {
    expect(isExportProfile('client')).toBe(true);
    expect(isExportProfile('technical')).toBe(true);
    expect(isExportProfile('gerencia')).toBe(false);
  });

  it('profileFilenameSuffix', () => {
    expect(profileFilenameSuffix('client')).toBe('cliente');
    expect(profileFilenameSuffix('technical')).toBe('tecnico');
  });
});
