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
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <Icon
          className="mb-4 h-10 w-10 text-gray-400"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      )}
      <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
