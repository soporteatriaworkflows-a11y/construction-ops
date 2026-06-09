import { cn } from '@/lib/utils/cn';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Texto pequeño (eyebrow) sobre el título; acento de marca. */
  eyebrow?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumb && (
        <nav aria-label="Migas de pan" className="mb-2">
          {breadcrumb}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-iconic-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-iconic-ink">
            <span className="hidden h-6 w-1 rounded-full bg-iconic-primary sm:inline-block" aria-hidden="true" />
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-iconic-graphite/60">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
