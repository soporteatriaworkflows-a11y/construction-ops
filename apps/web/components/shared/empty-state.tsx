import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /**
   * Accion secundaria que se muestra debajo de `action` cuando esta presente.
   * Backward-compatible: los usos existentes que no pasan esta prop no se ven afectados.
   */
  secondaryAction?: React.ReactNode;
  /**
   * Mensaje informativo para contextos de solo lectura.
   * Cuando esta presente, reemplaza a `action` y `secondaryAction` y se muestra
   * con estilo sutil (sin botones) para no inducir a error en roles sin permiso.
   */
  readOnlyMessage?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  readOnlyMessage,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-iconic-soft-blue bg-white px-6 py-14 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <span
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-iconic-soft-blue"
          aria-hidden="true"
        >
          <Icon className="h-7 w-7 text-iconic-primary" strokeWidth={1.6} />
        </span>
      )}
      <h3 className="mb-1 text-base font-semibold text-iconic-ink">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-iconic-graphite/60">{description}</p>
      )}
      {readOnlyMessage ? (
        <p className="mt-2 max-w-sm text-xs text-iconic-graphite/40 italic">{readOnlyMessage}</p>
      ) : (
        <>
          {action && <div className="mt-2">{action}</div>}
          {secondaryAction && <div className="mt-2">{secondaryAction}</div>}
        </>
      )}
    </div>
  );
}
