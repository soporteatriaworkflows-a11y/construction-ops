/**
 * Lightweight OPS performance logging.
 *
 * Disabled by default. Set OPS_PERF_LOGS=true to emit structured server logs
 * for route/repository timings without business data, IDs, amounts or secrets.
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export type OpsPerfMetadata = Record<string, string | number | boolean | null | undefined>;

export function isOpsPerfLoggingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return TRUE_VALUES.has((env.OPS_PERF_LOGS ?? '').trim().toLowerCase());
}

function nowMs(): number {
  return performance.now();
}

function sanitizeMetadata(metadata: OpsPerfMetadata | undefined): OpsPerfMetadata | undefined {
  if (!metadata) return undefined;
  const out: OpsPerfMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function logPerf(payload: OpsPerfMetadata): void {
  if (!isOpsPerfLoggingEnabled()) return;
  console.info(JSON.stringify({ event: 'ops.perf', ...payload }));
}

export async function withOpsPerfSpan<T>(
  route: string,
  span: string,
  fn: () => Promise<T>,
  metadata?: OpsPerfMetadata,
): Promise<T> {
  if (!isOpsPerfLoggingEnabled()) return fn();
  const startedAt = nowMs();
  try {
    const result = await fn();
    logPerf({
      route,
      span,
      ok: true,
      durationMs: Math.round(nowMs() - startedAt),
      ...sanitizeMetadata(metadata),
    });
    return result;
  } catch (error) {
    logPerf({
      route,
      span,
      ok: false,
      durationMs: Math.round(nowMs() - startedAt),
      errorName: error instanceof Error ? error.name : 'unknown',
      ...sanitizeMetadata(metadata),
    });
    throw error;
  }
}

export function createOpsPerfTrace(route: string, metadata?: OpsPerfMetadata) {
  const enabled = isOpsPerfLoggingEnabled();
  const startedAt = enabled ? nowMs() : 0;
  let spans = 0;

  return {
    async span<T>(name: string, fn: () => Promise<T>, spanMetadata?: OpsPerfMetadata): Promise<T> {
      spans += 1;
      return withOpsPerfSpan(route, name, fn, spanMetadata);
    },
    finish(summary?: OpsPerfMetadata): void {
      if (!enabled) return;
      logPerf({
        route,
        span: 'request.total',
        ok: true,
        durationMs: Math.round(nowMs() - startedAt),
        spans,
        ...sanitizeMetadata(metadata),
        ...sanitizeMetadata(summary),
      });
    },
  };
}
