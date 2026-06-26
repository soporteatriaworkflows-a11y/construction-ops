/**
 * theme-provider.tsx — Tema claro/oscuro ICONIC (ICONIC_OPS_UIX_THEME_MODES_V4_2).
 * Provider propio (sin dependencias). Persiste en localStorage y aplica la clase
 * `.dark` en <html>. El estado inicial se lee de `window.__iconicTheme`, que fija
 * el script inline en <head> ANTES de la hidratación → sin FOUC ni hydration mismatch.
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

declare global {
  interface Window {
    __iconicTheme?: Theme;
  }
}

const STORAGE_KEY = 'iconic-theme';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Lee el tema ya resuelto por el script inline (cliente) o 'light' (SSR). */
function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.__iconicTheme ?? 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

type ThemeContextValue = {
  theme: Theme;
  /** Resuelto a 'light' | 'dark' (system → preferencia del SO). */
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* almacenamiento no disponible: el tema vive solo en memoria */
    }
    window.__iconicTheme = t;
    applyTheme(t);
  }, []);

  // Si el modo es 'system', reacciona a cambios del SO (listener, no setState directo).
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const resolved: 'light' | 'dark' =
    theme === 'dark' || (theme === 'system' && systemPrefersDark()) ? 'dark' : 'light';

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}

/** Script inline para <head>: aplica el tema antes del paint (anti-FOUC). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'light';window.__iconicTheme=t;var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
