/**
 * cron-route.test.ts — Protección del endpoint cron (Fase 4A).
 * Mandato: tests 30-32 (CRON_SECRET) + no exposición de datos internos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runScheduledMonitorMock = vi.fn();

vi.mock('@/server/pricing/monitor', () => ({
  getSystemMonitorStore: () => ({}),
  runScheduledMonitor: (...args: unknown[]) => runScheduledMonitorMock(...args),
}));

import { GET } from '@/app/api/cron/price-monitor/route';

function req(authorization?: string): Request {
  return new Request('https://app.example.com/api/cron/price-monitor', {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  runScheduledMonitorMock.mockReset();
  vi.stubEnv('READ_MODEL_SOURCE', 'db');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/price-monitor', () => {
  it('T30: sin CRON_SECRET configurado ⇒ 500 seguro (sin detalles)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req('Bearer cualquiera'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'cron_not_configured' });
    expect(runScheduledMonitorMock).not.toHaveBeenCalled();
  });

  it('T31: secreto incorrecto ⇒ 401', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto');
    const res = await GET(req('Bearer secreto-incorrecto'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(runScheduledMonitorMock).not.toHaveBeenCalled();
  });

  it('T31b: sin header Authorization ⇒ 401', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto');
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runScheduledMonitorMock).not.toHaveBeenCalled();
  });

  it('T32: secreto correcto ⇒ procesa y responde solo conteos', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto');
    runScheduledMonitorMock.mockResolvedValue({
      skipped: null,
      recoveredStaleRuns: 0,
      dueTargets: 1,
      organizations: [
        {
          organizationId: 'org-a',
          runId: 'run-1',
          skipped: null,
          status: 'completed',
          counters: { checked: 1, unchanged: 1, changed: 0, pendingCreated: 0, failed: 0 },
          outcomes: [
            {
              targetId: 't1',
              status: 'unchanged',
              detectedPrice: '169000', // 🔒 NO debe salir en la respuesta
              currency: 'COP',
              unitRaw: null,
              warnings: [],
              observationId: null,
              baselineObservationId: null,
            },
          ],
        },
      ],
    });
    const res = await GET(req('Bearer secreto-correcto'));
    expect(res.status).toBe(200);
    expect(runScheduledMonitorMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.dueTargets).toBe(1);
    expect(body.organizations[0].counters.checked).toBe(1);
    // Sin precios, sin URLs, sin organizationId expuesto innecesariamente.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('169000');
    expect(raw).not.toContain('detectedPrice');
    expect(raw).not.toContain('secreto-correcto');
  });

  it('modo fixture ⇒ 503 (el monitor no opera en demo)', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto');
    vi.stubEnv('READ_MODEL_SOURCE', 'fixture');
    const res = await GET(req('Bearer secreto-correcto'));
    expect(res.status).toBe(503);
    expect(runScheduledMonitorMock).not.toHaveBeenCalled();
  });

  it('el secreto nunca aparece en la respuesta de error', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secreto-xyz');
    const res = await GET(req('Bearer mal'));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('super-secreto-xyz');
  });

  it('fallo interno del monitor ⇒ 500 opaco', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto');
    runScheduledMonitorMock.mockRejectedValue(new Error('detalle interno sensible'));
    const res = await GET(req('Bearer secreto-correcto'));
    expect(res.status).toBe(500);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('detalle interno');
  });
});
