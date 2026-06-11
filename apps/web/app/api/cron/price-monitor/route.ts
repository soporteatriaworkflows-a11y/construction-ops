/**
 * route.ts — Endpoint del cron del monitor de precios (Fase 4A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §3.2.
 *
 * GET /api/cron/price-monitor
 *  - Sin CRON_SECRET configurado ⇒ 500 seguro (sin detalles).
 *  - Authorization ausente/incorrecto ⇒ 401. Comparación en tiempo constante.
 *  - El secreto NUNCA se imprime ni se devuelve.
 *  - Solo opera en modo db (fixture ⇒ 503; el modo demo no monitorea).
 *
 * La respuesta expone solo conteos y estados — nunca precios ni datos 🔒.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { parseReadModelSource } from '@/lib/supabase/env';
import { getSystemMonitorStore, runScheduledMonitor } from '@/server/pricing/monitor';

export const dynamic = 'force-dynamic';
/** Peor caso del batch V1: 25 targets × timeout 10s, secuencial (< 300s). */
export const maxDuration = 300;

/** Comparación en tiempo constante vía digest (longitudes siempre iguales). */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) {
    // Fallo seguro: el cron no puede operar sin secreto configurado.
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!provided || !secretMatches(provided, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let mode: 'fixture' | 'db';
  try {
    mode = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  } catch {
    return NextResponse.json({ error: 'invalid_configuration' }, { status: 500 });
  }
  if (mode !== 'db') {
    return NextResponse.json({ error: 'monitor_disabled_in_fixture_mode' }, { status: 503 });
  }

  try {
    const report = await runScheduledMonitor(getSystemMonitorStore());
    // Solo conteos/estados: sin precios, sin URLs, sin datos internos 🔒.
    return NextResponse.json({
      skipped: report.skipped,
      recoveredStaleRuns: report.recoveredStaleRuns,
      dueTargets: report.dueTargets,
      organizations: report.organizations.map((o) => ({
        runId: o.runId,
        skipped: o.skipped,
        status: o.status,
        counters: o.counters,
      })),
    });
  } catch {
    // Nunca filtrar detalles internos; el incidente queda en la run (DB).
    return NextResponse.json({ error: 'monitor_run_failed' }, { status: 500 });
  }
}
