/**
 * manual-line-form.tsx — Formulario de línea manual + preview del parser F1.
 *
 * La interpretación que se muestra ANTES de agregar es la del parser real
 * (`parseSteelDescription`): descripción original → lectura, confianza,
 * explicación y needs_review. Sin cálculo duplicado en UI.
 */
'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { InlineCallout } from '@/components/shared/inline-callout';
import { defaultRebarSpecs, parseSteelDescription } from '@/modules/steel';
import { formatDecimal } from '@/lib/steel/format';
import type { ManualLineRecord } from '@/lib/steel/manual-takeoff';

const EXAMPLE_DESCRIPTIONS = ['5#5600', '74E#3200', '2X65E#3182', '10#7205 @ 15CM', '#4 L=0.62', '15 + 35 + 15'];

function confidenceLabel(score: string): string {
  return `${(Number(score) * 100).toFixed(0)}%`;
}

export function ManualLineForm({
  onAdd,
  disabled,
}: {
  onAdd: (line: Omit<ManualLineRecord, 'id'>) => void;
  disabled?: boolean;
}) {
  const [description, setDescription] = useState('');
  const [wastePct, setWastePct] = useState('5');
  const [manualBar, setManualBar] = useState('');

  const trimmed = description.trim();
  const preview = useMemo(() => (trimmed ? parseSteelDescription(trimmed) : undefined), [trimmed]);
  const needsManualBar = Boolean(preview && preview.steelFamily === 'rebar' && !preview.barNumber);
  const parseFailed = Boolean(preview && preview.steelFamily === 'other');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    onAdd({
      originalDescription: trimmed,
      assumedWastePct: wastePct.trim() === '' || Number.isNaN(Number(wastePct)) ? '0' : wastePct.trim(),
      manualBarNumber: needsManualBar && manualBar ? Number(manualBar) : undefined,
    });
    setDescription('');
    setManualBar('');
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Agregar línea de acero manual">
      <div className="grid gap-3 sm:grid-cols-[2fr_120px_auto] sm:items-end">
        <div>
          <Label htmlFor="manual-line-description">Descripción original (como viene del plano)</Label>
          <Input
            id="manual-line-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: 74E#3200"
            className="mt-1 font-mono"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="manual-line-waste">Desperdicio %</Label>
          <Input
            id="manual-line-waste"
            type="number"
            min="0"
            step="0.5"
            value={wastePct}
            onChange={(e) => setWastePct(e.target.value)}
            className="mt-1"
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled || !trimmed}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Agregar línea
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Ejemplos de notación">
        <span className="text-[10px] uppercase tracking-wide text-iconic-graphite/50">Ejemplos:</span>
        {EXAMPLE_DESCRIPTIONS.map((example) => (
          <button
            key={example}
            type="button"
            disabled={disabled}
            onClick={() => setDescription(example)}
            className="rounded border border-iconic-soft-blue/50 bg-brand-50/50 px-1.5 py-0.5 font-mono text-[11px] text-iconic-graphite/70 transition-colors hover:bg-brand-50 hover:text-iconic-ink disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      {preview && (
        <div className="mt-3">
          <InlineCallout
            tone={parseFailed ? 'warning' : preview.needsReview ? 'warning' : 'success'}
            title={
              parseFailed
                ? 'El parser no reconoció esta descripción'
                : `Interpretación (confianza ${confidenceLabel(preview.confidenceScore)}${preview.needsReview ? ' · necesita revisión' : ''})`
            }
          >
            <p>{preview.explanation}</p>
            {!parseFailed && (
              <p className="mt-1 text-[11px] opacity-80">
                {preview.quantityPerUnit} pieza(s) × {preview.repetitions} grupo(s)
                {preview.cutLengthM ? ` · longitud de corte ${formatDecimal(preview.cutLengthM)} m` : ' · sin longitud interpretada'}
                {preview.barNumber ? ` · varilla #${preview.barNumber}` : ''}
                {preview.spacingCm ? ` · separación @ ${preview.spacingCm} cm (revisar luz/cantidad)` : ''}
              </p>
            )}
          </InlineCallout>

          {needsManualBar && (
            <div className="mt-2 max-w-xs">
              <Label htmlFor="manual-line-bar">Número de varilla (asignación manual)</Label>
              <Select
                id="manual-line-bar"
                value={manualBar}
                onChange={(e) => setManualBar(e.target.value)}
                className="mt-1"
                disabled={disabled}
              >
                <option value="">Sin asignar (la línea no podrá optimizarse)</option>
                {defaultRebarSpecs.map((spec) => (
                  <option key={spec.id} value={spec.barNumber}>
                    #{spec.barNumber} · {spec.unitWeightKgM} kg/m
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-iconic-graphite/50">
                El parser leyó la longitud pero no el calibre (ej. doblez segmentado). Asigna la
                varilla para calcular peso y enviar al plan de corte.
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
