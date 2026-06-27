/**
 * monitor-ui.test.ts — V5.2.2a helpers PUROS del panel de monitoreo + guard server/client.
 * Lógica pura (estado/fechas) + check anti-regresión P0 (Server Component no importa de 'use client').
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getMonitorTargetStatus,
  formatLastChecked,
  formatNextCheck,
  relativeDays,
} from '../../../lib/pricing/monitor-ui';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const NOW = new Date('2026-06-27T12:00:00Z');
const T = (o: Partial<{ enabled: boolean; hasFailureAlert: boolean; isOverdue: boolean; consecutiveFailures: number }>) => ({
  enabled: true,
  hasFailureAlert: false,
  isOverdue: false,
  consecutiveFailures: 0,
  ...o,
});

describe('V5.2.2a — estado de target (prioridad pausado→error→atrasado→saludable)', () => {
  it('pausado', () => expect(getMonitorTargetStatus(T({ enabled: false })).key).toBe('paused'));
  it('error por hasFailureAlert', () => expect(getMonitorTargetStatus(T({ hasFailureAlert: true, consecutiveFailures: 3 })).key).toBe('error'));
  it('error por fallos > 0 aunque sin alerta', () => expect(getMonitorTargetStatus(T({ consecutiveFailures: 1 })).key).toBe('error'));
  it('atrasado', () => expect(getMonitorTargetStatus(T({ isOverdue: true })).key).toBe('overdue'));
  it('saludable', () => {
    const s = getMonitorTargetStatus(T({}));
    expect(s.key).toBe('healthy');
    expect(s.tone).toBe('success');
  });
  it('error gana a atrasado', () => expect(getMonitorTargetStatus(T({ isOverdue: true, consecutiveFailures: 2 })).key).toBe('error'));
});

describe('V5.2.2a — fechas humanas tolerantes a null/inválido', () => {
  it('relativeDays', () => {
    expect(relativeDays(null)).toBeNull();
    expect(relativeDays('no-fecha')).toBeNull();
    expect(relativeDays('2026-06-24T00:00:00Z', NOW)).toBe(3);
  });
  it('última revisión con fallbacks', () => {
    expect(formatLastChecked(null)).toBe('Sin revisión registrada');
    expect(formatLastChecked('2026-06-26T12:00:00Z', NOW)).toBe('Ayer');
    expect(formatLastChecked('2026-06-20T12:00:00Z', NOW)).toBe('Hace 7 días');
  });
  it('próxima revisión con fallbacks', () => {
    expect(formatNextCheck(null)).toBe('Sin próxima revisión');
    expect(formatNextCheck('2026-06-30T12:00:00Z', NOW)).toBe('En 3 días');
    expect(formatNextCheck('2026-06-20T12:00:00Z', NOW)).toBe('Pendiente (atrasada)');
  });
});

describe('V5.2.2a — guard server/client (lección P0)', () => {
  it('lib/pricing/monitor-ui NO declara la directiva "use client"', () => {
    const src = read('../../../lib/pricing/monitor-ui.ts');
    // La directiva es un statement de línea (no mención en comentarios).
    expect(src).not.toMatch(/^\s*['"]use client['"]\s*;?\s*$/m);
  });
  it('monitoring/page.tsx importa helpers del módulo NEUTRO, no de monitor-controls', () => {
    const page = read('../../../app/(dashboard)/catalog/monitoring/page.tsx');
    expect(page).toContain("from '@/lib/pricing/monitor-ui'");
    // de monitor-controls SOLO componentes (no helpers)
    const m = page.match(/from '\.\/_components\/monitor-controls'/);
    expect(m).toBeTruthy();
    expect(page).toContain('getMonitorTargetStatus');
  });
});
