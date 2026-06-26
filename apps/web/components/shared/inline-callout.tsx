/**
 * inline-callout.tsx — Callout/ayuda contextual reutilizable
 * (ICONIC_OPS_UIX_VISUAL_SYSTEM_ROLLOUT_V1). Server-safe, presentacional.
 *
 * Unifica el tono visual de las ayudas/avisos de los módulos con tokens ICONIC
 * existentes. No introduce librerías ni cambia lógica.
 */
import type { ReactNode } from 'react';
import { Info, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';

export type CalloutTone = 'tip' | 'info' | 'warning' | 'success';

const TONE: Record<CalloutTone, { wrap: string; icon: string; Icon: typeof Info }> = {
  tip: { wrap: 'border-iconic-soft-blue/60 bg-brand-50/50 text-iconic-ink dark:border-line dark:bg-surface-soft dark:text-content', icon: 'text-iconic-primary dark:text-iconic-cyan', Icon: Lightbulb },
  info: { wrap: 'border-gray-200 bg-gray-50/70 text-gray-700 dark:border-line dark:bg-surface-soft dark:text-content-muted', icon: 'text-gray-400', Icon: Info },
  warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200', icon: 'text-amber-500', Icon: AlertTriangle },
  success: { wrap: 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-200', icon: 'text-green-600', Icon: CheckCircle2 },
};

/**
 * Aviso contextual compacto. `title` opcional (negrita) + contenido. Usa
 * `role="note"` (no interrumpe lectores de pantalla como un alert).
 */
export function InlineCallout({
  tone = 'tip',
  title,
  children,
  className = '',
}: {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.Icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${t.wrap} ${className}`} role="note">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}
