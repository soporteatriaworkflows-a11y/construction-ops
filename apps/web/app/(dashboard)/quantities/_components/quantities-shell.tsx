import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightLeft, FileSpreadsheet, Ruler, Sigma, WalletCards } from 'lucide-react';
import { InlineCallout } from '@/components/shared/inline-callout';
import { OperationsHeader } from '@/components/shared/operations-header';

export type QuantitiesTab = 'measurements' | 'imports' | 'sync';

const TABS: Array<{ value: QuantitiesTab; label: string; href: string }> = [
  { value: 'measurements', label: 'Mediciones', href: '/quantities/workspace' },
  { value: 'imports', label: 'Memorias importadas', href: '/quantities?tab=imports' },
  { value: 'sync', label: 'Sincronización', href: '/quantities?tab=sync' },
];

const STEPS: Array<{ label: string; href?: string; icon: ReactNode }> = [
  { label: 'Medición/Excel', href: '/quantities/workspace', icon: <Ruler className="h-4 w-4" aria-hidden="true" /> },
  { label: 'Cantidades', href: '/quantities', icon: <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> },
  { label: 'Presupuesto', href: '/estimates', icon: <WalletCards className="h-4 w-4" aria-hidden="true" /> },
  { label: 'Subtotal', icon: <Sigma className="h-4 w-4" aria-hidden="true" /> },
  { label: 'Exportación', icon: <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> },
];

export const QUANTITIES_TITLE = 'Cantidades de obra';
export const QUANTITIES_SUBTITLE = 'De aquí salen las cantidades reales que alimentan el presupuesto.';

export function QuantitiesShell({
  activeTab,
  stat,
  actions,
  children,
}: {
  activeTab: QuantitiesTab;
  stat?: { label: string; value: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <OperationsHeader
        eyebrow="Cantidades"
        title={QUANTITIES_TITLE}
        subtitle={QUANTITIES_SUBTITLE}
        stat={stat}
        actions={actions}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="inline-flex rounded-md border border-gray-200 dark:border-line" aria-label="Secciones de cantidades">
          {TABS.map((tab) => {
            const active = tab.value === activeTab;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                  active
                    ? 'bg-iconic-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-surface dark:text-content-muted dark:hover:bg-surface-muted'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <InlineCallout tone="tip" title="Flujo de cantidades" className="mb-4">
        Mide o importa  revisa bruto/neto  envía al presupuesto. El presupuesto nunca se modifica sin tu confirmación: siempre verás un preview.
      </InlineCallout>

      <QuantitiesStepper />

      {children}
    </div>
  );
}

function QuantitiesStepper() {
  return (
    <ol className="mb-5 grid gap-2 rounded-xl border border-iconic-soft-blue/60 bg-surface px-3 py-3 shadow-sm sm:grid-cols-5">
      {STEPS.map((step, index) => {
        const content = (
          <span className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-content transition-colors hover:bg-brand-50/70 dark:hover:bg-surface-muted">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-iconic-soft-blue/70 bg-brand-50 text-iconic-primary">
              {step.icon}
            </span>
            <span className="min-w-0">{step.label}</span>
          </span>
        );
        return (
          <li key={step.label} className="relative">
            {step.href ? (
              <Link href={step.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary">
                {content}
              </Link>
            ) : (
              content
            )}
            {index < STEPS.length - 1 ? (
              <span className="pointer-events-none absolute right-1 top-1/2 hidden h-px w-4 bg-iconic-soft-blue/70 sm:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
