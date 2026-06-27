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
  parseMonitorStatus,
  filterTargetsByStatus,
  getMonitorStatusCounts,
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

describe('V5.2.2b — filtros server-side por estado', () => {
  const targets = [
    T({}), // healthy
    T({ isOverdue: true }), // overdue
    T({ consecutiveFailures: 2 }), // error
    T({ enabled: false }), // paused
    T({ hasFailureAlert: true, consecutiveFailures: 5 }), // error
  ];

  it('parseMonitorStatus normaliza y cae a all en inválidos', () => {
    expect(parseMonitorStatus('overdue')).toBe('overdue');
    expect(parseMonitorStatus(['paused', 'x'])).toBe('paused');
    expect(parseMonitorStatus('boom')).toBe('all');
    expect(parseMonitorStatus(undefined)).toBe('all');
    expect(parseMonitorStatus(null)).toBe('all');
  });

  it('filterTargetsByStatus por cada key', () => {
    expect(filterTargetsByStatus(targets, 'all')).toHaveLength(5);
    expect(filterTargetsByStatus(targets, 'healthy')).toHaveLength(1);
    expect(filterTargetsByStatus(targets, 'overdue')).toHaveLength(1);
    expect(filterTargetsByStatus(targets, 'error')).toHaveLength(2);
    expect(filterTargetsByStatus(targets, 'paused')).toHaveLength(1);
  });

  it('tolerante a lista vacía / null', () => {
    expect(filterTargetsByStatus([], 'overdue')).toEqual([]);
    // @ts-expect-error tolerancia runtime a undefined
    expect(filterTargetsByStatus(undefined, 'all')).toEqual([]);
  });

  it('getMonitorStatusCounts suma por estado + total', () => {
    const c = getMonitorStatusCounts(targets);
    expect(c).toEqual({ all: 5, healthy: 1, overdue: 1, error: 2, paused: 1 });
  });
});

describe('V5.2.2a/b — guard server/client (lección P0)', () => {
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

  it('V5.2.2b — filtrado server-side: searchParams + helpers neutros + pills <Link> (sin isla client)', () => {
    const page = read('../../../app/(dashboard)/catalog/monitoring/page.tsx');
    expect(page).toContain('parseMonitorStatus');
    expect(page).toContain('filterTargetsByStatus');
    expect(page).toContain('searchParams');
    // pills son <Link> server-rendered, no un FilterPills client nuevo
    expect(page).not.toContain("'use client'");
  });

  it('V5.2.2b — KPI deep-links a ?status= y review', () => {
    const page = read('../../../app/(dashboard)/catalog/monitoring/page.tsx');
    expect(page).toContain('/catalog/monitoring?status=overdue');
    expect(page).toContain('/catalog/monitoring?status=paused');
    expect(page).toContain('/catalog/monitoring?status=error');
    expect(page).toContain('/catalog/prices/review');
  });

  it('V5.2.2b — cross-link /catalog → monitoring', () => {
    const cat = read('../../../app/(dashboard)/catalog/page.tsx');
    expect(cat).toContain('/catalog/monitoring');
  });
});
