/**
 * theme-toggle.tsx — Control segmentado de tema (ICONIC_OPS_UIX_THEME_MODES_V4_2).
 * Claro / Oscuro / Sistema. Accesible (role=group + aria-pressed). Discreto.
 */
'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type Theme } from './theme-provider';

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-soft p-0.5 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            title={label}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-iconic-primary text-white'
                : 'text-content-muted hover:bg-surface-muted hover:text-content'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
