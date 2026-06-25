/**
 * quote-readiness-semaphore.tsx — Semáforo visual de cotización lista para
 * exportar (APU_QUOTE_READINESS_SEMAPHORE_V1). Server-safe (sin estado cliente).
 * Solo presenta el resultado del helper puro `computeQuoteReadiness`. NO bloquea
 * el export ni recalcula finanzas.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  QuoteReadiness,
  QuoteReadinessStatus,
  QuoteIssue,
  QuoteIssueGroup,
} from '@/lib/estimates/quote-readiness';

const GROUP_ORDER: QuoteIssueGroup[] = ['boq', 'pricing', 'apu', 'aiu', 'export'];
const GROUP_LABELS: Record<QuoteIssueGroup, string> = {
  boq: 'BOQ / cantidades',
  pricing: 'Precios',
  apu: 'APU',
  aiu: 'AIU',
  export: 'Export',
};

const TONE: Record<QuoteReadinessStatus, { dot: string; chip: string; bar: string }> = {
  ready: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  review: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  blocked: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
};

const SEV_DOT: Record<QuoteIssue['severity'], string> = {
  critical: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-gray-400',
};

const SEV_RANK: Record<QuoteIssue['severity'], number> = { critical: 0, warning: 1, info: 2 };

function ThematicGroup({ group, issues }: { group: QuoteIssueGroup; issues: QuoteIssue[] }) {
  if (issues.length === 0) return null;
  const sorted = [...issues].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{GROUP_LABELS[group]}</p>
      <ul className="space-y-0.5">
        {sorted.map((i) => (
          <li key={i.code} className={`text-sm ${SEV_DOT[i.severity]}`}>
            {i.severity === 'critical' ? '● ' : i.severity === 'warning' ? '▲ ' : '· '}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuoteReadinessSemaphore({ readiness }: { readiness: QuoteReadiness }) {
  const tone = TONE[readiness.status];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`inline-block h-3 w-3 rounded-full ${tone.dot}`} aria-hidden="true" />
          Estado de la cotización
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${tone.chip}`}>
            {readiness.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Barra indicativa */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full ${tone.bar}`} style={{ width: `${readiness.score}%` }} />
        </div>

        {/* Contadores */}
        <div className="flex gap-4 text-sm">
          <span className="text-red-600"><strong className="tabular-nums">{readiness.counts.critical}</strong> críticos</span>
          <span className="text-amber-600"><strong className="tabular-nums">{readiness.counts.warnings}</strong> advertencias</span>
          <span className="text-gray-400"><strong className="tabular-nums">{readiness.counts.info}</strong> informativos</span>
        </div>

        {/* Pendientes agrupados por tema (severidad dentro de cada grupo) */}
        <div className="space-y-3">
          {GROUP_ORDER.map((g) => (
            <ThematicGroup
              key={g}
              group={g}
              issues={[...readiness.criticalIssues, ...readiness.warnings, ...readiness.info].filter((i) => i.group === g)}
            />
          ))}
        </div>

        <p className="border-t pt-2 text-[11px] text-gray-400">
          Este semáforo ayuda a revisar la cotización antes de exportar. No reemplaza la revisión técnica.
        </p>
      </CardContent>
    </Card>
  );
}

/** Alerta corta junto al export según el estado. */
export function ReadinessExportAlert({ status, message }: { status: QuoteReadinessStatus; message: string }) {
  const cls =
    status === 'ready'
      ? 'border-green-200 bg-green-50 text-green-800'
      : status === 'review'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-red-200 bg-red-50 text-red-800';
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${cls}`} role="status">
      {message}
    </div>
  );
}
