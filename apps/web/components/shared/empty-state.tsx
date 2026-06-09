import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-iconic-soft bg-white px-6 py-14 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <span
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-iconic-soft"
          aria-hidden="true"
        >
          <Icon className="h-7 w-7 text-iconic-primary" strokeWidth={1.6} />
        </span>
      )}
      <h3 className="mb-1 text-base font-semibold text-iconic-navy">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
