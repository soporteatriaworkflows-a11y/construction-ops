/**
 * quote-companion-selector.tsx — Selector embebido de "cotización activa" dentro
 * del companion panel (HOTFIX in-place guide). 'use client'. Cascada proyecto →
 * alcance → versión usando lecturas READ-ONLY existentes; al elegir versión,
 * informa al panel (onSelect) que la guarda como cotización activa. NO navega,
 * NO crea, NO muta.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui/select';
import {
  listQuoteProjects,
  listQuoteScopes,
  listQuoteVersions,
  type QuoteSelectOption,
} from './quote-companion-actions';

export interface SelectedQuote {
  projectId: string;
  scopeId: string;
  versionId: string;
}

export function QuoteCompanionSelector({ onSelect }: { onSelect: (q: SelectedQuote) => void }) {
  const [projects, setProjects] = useState<QuoteSelectOption[]>([]);
  const [scopes, setScopes] = useState<QuoteSelectOption[]>([]);
  const [versions, setVersions] = useState<QuoteSelectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cargar proyectos al montar (setState dentro del .then async → lint-clean).
  useEffect(() => {
    let cancelled = false;
    listQuoteProjects()
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setProjects(r.options);
        else setError(r.error);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los proyectos.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onProjectChange(id: string): void {
    setProjectId(id);
    setScopeId('');
    setScopes([]);
    setVersions([]);
    setError(null);
    if (!id) return;
    listQuoteScopes(id)
      .then((r) => {
        if (r.ok) setScopes(r.options);
        else setError(r.error);
      })
      .catch(() => setError('No se pudieron cargar los alcances.'));
  }

  function onScopeChange(id: string): void {
    setScopeId(id);
    setVersions([]);
    setError(null);
    if (!id) return;
    listQuoteVersions(id)
      .then((r) => {
        if (r.ok) setVersions(r.options);
        else setError(r.error);
      })
      .catch(() => setError('No se pudieron cargar los presupuestos.'));
  }

  function onVersionChange(id: string): void {
    if (id && projectId && scopeId) {
      onSelect({ projectId, scopeId, versionId: id });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-iconic-ink">Selecciona cotización activa</p>
      <p className="text-[11px] text-gray-500">Elige el presupuesto que quieres acompañar; te seguirá mientras navegas.</p>

      {error && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800" role="alert">{error}</p>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-gray-500">Proyecto</span>
        <Select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </label>

      {projectId !== '' && (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-gray-500">Alcance</span>
          <Select value={scopeId} onChange={(e) => onScopeChange(e.target.value)} disabled={scopes.length === 0}>
            <option value="">Selecciona…</option>
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </label>
      )}

      {scopeId !== '' && (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-gray-500">Presupuesto / versión</span>
          <Select defaultValue="" onChange={(e) => onVersionChange(e.target.value)} disabled={versions.length === 0}>
            <option value="">Selecciona…</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id} disabled={v.disabled}>{v.label}</option>
            ))}
          </Select>
        </label>
      )}

      <p className="pt-1 text-[11px] text-gray-400">
        ¿Necesitas una nueva?{' '}
        <Link href="/quote/new" className="font-medium text-iconic-primary hover:underline">Crear nueva cotización</Link>
      </p>
    </div>
  );
}
