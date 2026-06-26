/**
 * filter-pills.tsx — Control segmentado (pills) reutilizable
 * (ICONIC_OPS_UIX_VISUAL_SYSTEM_ROLLOUT_V2). Presentacional; sin hooks (usable en
 * componentes client). Unifica los grupos de filtro con tokens ICONIC. No cambia
 * lógica: solo invoca `onChange` con el valor seleccionado.
 */
export interface FilterPillOption {
  value: string;
  label: string;
}

export function FilterPills({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  tone = 'primary',
  className = '',
}: {
  /** Etiqueta corta a la izquierda (mayúsculas, opcional). */
  label?: string;
  ariaLabel?: string;
  options: FilterPillOption[];
  value: string;
  onChange: (value: string) => void;
  /** Color del pill activo. */
  tone?: 'primary' | 'ink';
  className?: string;
}) {
  const activeCls = tone === 'ink' ? 'bg-iconic-ink text-white' : 'bg-iconic-primary text-white';
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      )}
      <div className="inline-flex rounded-md border border-gray-200 dark:border-line" role="group" aria-label={ariaLabel ?? label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
              value === o.value ? activeCls : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-surface dark:text-content-muted dark:hover:bg-surface-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
