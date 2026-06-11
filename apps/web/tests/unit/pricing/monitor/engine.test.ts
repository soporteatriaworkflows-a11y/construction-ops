/**
 * engine.test.ts — Engine del monitor (Fase 4A).
 * Mandato: targets 14-18 · monitor 19-29 · cron/locks 33-36 · SSRF 37.
 * Sin red ni DB: fetcher/dns/store inyectados.
 */
import { describe, it, expect } from 'vitest';
import {
  runScheduledMonitor,
  runManualMonitor,
  ManualRunThrottledError,
} from '@/server/pricing/monitor/service';
import { checkTarget } from '@/server/pricing/monitor/check-target';
import { FetchPublicPageError } from '@/server/pricing/validation/types';
import type { PageFetcher } from '@/server/pricing/validation/types';
import { FakeMonitorStore, makeTarget, productHtml, publicDns } from './fake-store';

const NOW = () => new Date('2026-06-10T11:00:00.000Z');
const NOW_ISO = '2026-06-10T11:00:00.000Z';

function htmlFetcher(price: string, calls?: string[]): PageFetcher {
  return async (url: string) => {
    calls?.push(url);
    return { text: productHtml(price), contentType: 'text/html', finalUrl: url, warnings: [] };
  };
}

function failingFetcher(code: string, message: string): PageFetcher {
  return async () => {
    throw new FetchPublicPageError(code, message);
  };
}

function baseDeps(fetcher: PageFetcher) {
  return { fetcher, dnsLookup: publicDns, now: NOW };
}

describe('monitor engine — targets explícitos (mandato 14-16)', () => {
  it('T14/T15: target deshabilitado NO se procesa', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget({ enabled: false }));
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(report.dueTargets).toBe(0);
    expect(store.results).toHaveLength(0);
  });

  it('T16: next_check_at futuro NO se procesa', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget({ nextCheckAt: '2026-06-20T00:00:00.000Z' }));
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(report.dueTargets).toBe(0);
    expect(store.results).toHaveLength(0);
  });
});

describe('monitor engine — comparación y pending (mandato 19-26)', () => {
  it('T19: precio igual al baseline ⇒ unchanged, NO crea observación', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget();
    store.targets.push(t);
    store.baselines.set(t.resourceId, {
      observationId: 'obs-base',
      price: '169000',
      currency: 'COP',
      unit: 'm²',
      sourceReference: t.sourceUrl,
    });
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(report.organizations[0]!.counters.unchanged).toBe(1);
    expect(store.observations).toHaveLength(0);
    expect(store.results[0]!.status).toBe('unchanged');
    // Registra la revisión: last_checked_at y próxima revisión avanzan.
    expect(t.lastCheckedAt).toBe(NOW_ISO);
    expect(t.lastSuccessAt).toBe(NOW_ISO);
    expect(t.baselineObservationId).toBe('obs-base');
  });

  it('T20: precio distinto ⇒ crea observación pending + pending_created', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget();
    store.targets.push(t);
    store.baselines.set(t.resourceId, {
      observationId: 'obs-base',
      price: '169000',
      currency: 'COP',
      unit: 'm²',
      sourceReference: t.sourceUrl,
    });
    await runScheduledMonitor(store, baseDeps(htmlFetcher('175000')));
    expect(store.observations).toHaveLength(1);
    expect(store.observations[0]!.status).toBe('pending');
    expect(store.results[0]!.status).toBe('pending_created');
    expect(store.results[0]!.observationId).toBe(store.observations[0]!.id);
  });

  it('T21: sin baseline ⇒ crea propuesta pending (nunca approved)', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(store.observations).toHaveLength(1);
    expect(store.observations[0]!.status).toBe('pending');
    expect(store.results[0]!.status).toBe('pending_created');
    expect(store.results[0]!.warnings.join(' ')).toMatch(/Sin baseline/);
  });

  it('T22: pending idéntica existente ⇒ NO se duplica (status changed)', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget();
    store.targets.push(t);
    // Primera corrida crea la pending.
    await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(store.observations).toHaveLength(1);
    // Segunda corrida (día siguiente): mismo precio detectado, misma pending.
    t.nextCheckAt = '2026-06-10T00:00:00.000Z';
    store.runs = []; // nueva ventana de idempotencia
    await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(store.observations).toHaveLength(1); // sin duplicar
    const last = store.results.at(-1)!;
    expect(last.status).toBe('changed');
    expect(last.observationId).toBe(store.observations[0]!.id);
    expect(last.warnings.join(' ')).toMatch(/no se duplica/);
  });

  it('T26: el monitor NUNCA crea observaciones approved', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget(), makeTarget({ resourceId: 'res-2', sourceUrl: 'https://shop.example.com/p2' }));
    await runScheduledMonitor(store, baseDeps(htmlFetcher('99000')));
    expect(store.observations.length).toBeGreaterThan(0);
    for (const o of store.observations) expect(o.status).toBe('pending');
  });
});

describe('monitor engine — fallos y retry conservador (mandato 23-25)', () => {
  it('T23: unreachable (timeout) registra el incidente', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    const report = await runScheduledMonitor(
      store,
      baseDeps(failingFetcher('timeout', 'La solicitud tardó demasiado (timeout).')),
    );
    expect(store.results[0]!.status).toBe('unreachable');
    expect(report.organizations[0]!.counters.failed).toBe(1);
    expect(report.organizations[0]!.status).toBe('failed');
  });

  it('HTTP 403 ⇒ blocked (sin evasión)', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    await runScheduledMonitor(store, baseDeps(failingFetcher('http_error', 'La URL devolvió HTTP 403.')));
    expect(store.results[0]!.status).toBe('blocked');
  });

  it('HTML sin precio ⇒ parse_failed', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    const fetcher: PageFetcher = async (url) => ({
      text: '<html><body>sin datos estructurados</body></html>',
      contentType: 'text/html',
      finalUrl: url,
      warnings: [],
    });
    await runScheduledMonitor(store, baseDeps(fetcher));
    expect(store.results[0]!.status).toBe('parse_failed');
  });

  it('respuesta >3MB ⇒ invalid_response', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    await runScheduledMonitor(
      store,
      baseDeps(failingFetcher('response_too_large', 'La respuesta supera el límite de 3MB.')),
    );
    expect(store.results[0]!.status).toBe('invalid_response');
  });

  it('T24: consecutive_failures incrementa y se resetea al éxito', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ consecutiveFailures: 2 });
    store.targets.push(t);
    await runScheduledMonitor(store, baseDeps(failingFetcher('timeout', 'timeout')));
    expect(t.consecutiveFailures).toBe(3);
    expect(t.enabled).toBe(true); // nunca se deshabilita silenciosamente
    // Éxito posterior resetea.
    t.nextCheckAt = '2026-06-10T00:00:00.000Z';
    store.runs = [];
    await runScheduledMonitor(store, baseDeps(htmlFetcher('169000')));
    expect(t.consecutiveFailures).toBe(0);
  });

  it('T25: retry conservador — el fallo reprograma a now + cadence (no acelera)', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ cadenceDays: 7 });
    store.targets.push(t);
    await runScheduledMonitor(store, baseDeps(failingFetcher('timeout', 'timeout')));
    expect(t.nextCheckAt).toBe('2026-06-17T11:00:00.000Z'); // +7 días exactos
    expect(t.lastSuccessAt).toBeNull();
  });
});

describe('monitor engine — batch, locks e idempotencia (mandato 33-36)', () => {
  it('T33: máximo 25 targets por ejecución', async () => {
    const store = new FakeMonitorStore();
    for (let i = 0; i < 30; i++) {
      store.targets.push(
        makeTarget({ resourceId: `res-${i}`, sourceUrl: `https://shop.example.com/p${i}` }),
      );
    }
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    expect(report.dueTargets).toBe(25);
    expect(store.results).toHaveLength(25);
  });

  it('T34: lock global no adquirido ⇒ corrida saltada (sin solape)', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    store.lockAvailable = false;
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    expect(report.skipped).toBe('already_running');
    expect(store.results).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });

  it('lock se libera al terminar (siguiente corrida procede)', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    expect(store.lockHeld).toBe(false);
  });

  it('T35: doble invocación del cron en la misma ventana ⇒ no-op idempotente', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget();
    store.targets.push(t);
    await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    const obsAfterFirst = store.observations.length;
    // El target quedó reprogramado; lo forzamos vencido para probar SOLO la idempotencia.
    t.nextCheckAt = '2026-06-10T00:00:00.000Z';
    const second = await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    expect(second.organizations[0]!.skipped).toBe('duplicate_window');
    expect(store.observations).toHaveLength(obsAfterFirst); // sin duplicados
    expect(store.runs).toHaveLength(1);
  });

  it('T36: sin crawling — exactamente un fetch por target', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(
      makeTarget(),
      makeTarget({ resourceId: 'res-2', sourceUrl: 'https://otra.example.com/p9' }),
    );
    const calls: string[] = [];
    await runScheduledMonitor(store, baseDeps(htmlFetcher('1000', calls)));
    expect(calls).toHaveLength(2);
    expect(new Set(calls).size).toBe(2);
  });

  it('recovery: runs huérfanas se reportan recuperadas', async () => {
    const store = new FakeMonitorStore();
    store.staleToRecover = 2;
    const report = await runScheduledMonitor(store, baseDeps(htmlFetcher('1000')));
    expect(report.recoveredStaleRuns).toBe(2);
  });
});

describe('monitor engine — SSRF heredado intacto (mandato 37)', () => {
  it('URL privada (127.0.0.1) ⇒ invalid_response SIN llamar al fetcher', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ sourceUrl: 'http://127.0.0.1/interno' });
    const calls: string[] = [];
    const outcome = await checkTarget(t, {
      store,
      fetcher: htmlFetcher('1000', calls),
      dnsLookup: publicDns,
      now: NOW,
    });
    expect(outcome.status).toBe('invalid_response');
    expect(calls).toHaveLength(0);
    expect(store.observations).toHaveLength(0);
  });

  it('redirect a host privado (error del fetch seguro) ⇒ invalid_response', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget();
    const outcome = await checkTarget(t, {
      store,
      fetcher: failingFetcher('redirect_to_private', 'URL no permitida en salto 1'),
      dnsLookup: publicDns,
      now: NOW,
    });
    expect(outcome.status).toBe('invalid_response');
  });
});

describe('monitor engine — corrida manual (mandato §3.3)', () => {
  it('corrida manual org-wide procesa vencidas y audita initiated_by', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    const summary = await runManualMonitor(
      store,
      { organizationId: 'org-a', initiatedBy: 'user-admin-a' },
      baseDeps(htmlFetcher('1000')),
    );
    expect(summary.counters.checked).toBe(1);
    expect(store.runs[0]!.triggerType).toBe('manual');
    expect(store.runs[0]!.initiatedBy).toBe('user-admin-a');
  });

  it('rate limit: segunda corrida manual en la misma ventana ⇒ ManualRunThrottledError', async () => {
    const store = new FakeMonitorStore();
    store.targets.push(makeTarget());
    await runManualMonitor(
      store,
      { organizationId: 'org-a', initiatedBy: 'user-admin-a' },
      baseDeps(htmlFetcher('1000')),
    );
    await expect(
      runManualMonitor(
        store,
        { organizationId: 'org-a', initiatedBy: 'user-admin-a' },
        baseDeps(htmlFetcher('1000')),
      ),
    ).rejects.toBeInstanceOf(ManualRunThrottledError);
  });

  it('«Revisar ahora» de un target NO vencido funciona (bajo demanda)', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ nextCheckAt: '2026-07-01T00:00:00.000Z' });
    store.targets.push(t);
    const summary = await runManualMonitor(
      store,
      { organizationId: 'org-a', initiatedBy: 'user-admin-a', targetId: t.id },
      baseDeps(htmlFetcher('1000')),
    );
    expect(summary.counters.checked).toBe(1);
  });

  it('«Revisar ahora» de un target deshabilitado no procesa nada', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ enabled: false });
    store.targets.push(t);
    const summary = await runManualMonitor(
      store,
      { organizationId: 'org-a', initiatedBy: 'user-admin-a', targetId: t.id },
      baseDeps(htmlFetcher('1000')),
    );
    expect(summary.counters.checked).toBe(0);
  });

  it('«Revisar ahora» cross-org no procesa nada (org del viewer manda)', async () => {
    const store = new FakeMonitorStore();
    const t = makeTarget({ organizationId: 'org-b' });
    store.targets.push(t);
    const summary = await runManualMonitor(
      store,
      { organizationId: 'org-a', initiatedBy: 'user-admin-a', targetId: t.id },
      baseDeps(htmlFetcher('1000')),
    );
    expect(summary.counters.checked).toBe(0);
  });
});
