/**
 * external-extraction-section.tsx — "Importar extracción estructurada JSON"
 * (F7.1, experimental).
 *
 * Puente BYO-JSON: la usuaria corre una herramienta externa (Lift/Datalab,
 * Claude, GPT, Gemini…) POR FUERA de Steel Ops con el schema copiable, y pega
 * aquí el JSON resultante para validarlo y compararlo contra la detección
 * interna F7. Sin APIs, sin keys, sin subir planos: solo texto pegado.
 * Nada se auto-aprueba; el método queda marcado `external_json`.
 */
'use client';

import { useState } from 'react';
import { ClipboardCopy, FileJson, GitCompareArrows } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InlineCallout } from '@/components/shared/inline-callout';
import {
  compareExternalWithInternal,
  EXTERNAL_COMPARISON_STATUS_LABEL,
  parseExternalExtractionJson,
  type ExternalComparisonResult,
  type ExternalComparisonStatus,
  type ExternalParseResult,
} from '@/lib/steel/external-structured-extraction';
import { buildExternalExtractionPromptBlock } from '@/lib/steel/structured-extraction-schema';
import type { StructuralDrawingAnalysis } from '@/lib/steel/structural-drawing-analysis';

const STATUS_VARIANT: Record<ExternalComparisonStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  match: 'success',
  external_only: 'warning',
  internal_only: 'secondary',
  conflict: 'destructive',
};

export function ExternalExtractionSection({
  analysis,
  disabled,
}: {
  analysis: StructuralDrawingAnalysis;
  disabled?: boolean;
}) {
  const [jsonText, setJsonText] = useState('');
  const [parseResult, setParseResult] = useState<ExternalParseResult | null>(null);
  const [comparison, setComparison] = useState<ExternalComparisonResult | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  function handleValidate() {
    setComparison(null);
    setParseResult(parseExternalExtractionJson(jsonText));
  }

  function handleImport() {
    const result = parseExternalExtractionJson(jsonText);
    setParseResult(result);
    if (result.ok) {
      setComparison(compareExternalWithInternal(result.extraction, analysis));
    } else {
      setComparison(null);
    }
  }

  async function handleCopySchema() {
    try {
      await navigator.clipboard.writeText(buildExternalExtractionPromptBlock());
      setCopiedSchema(true);
      window.setTimeout(() => setCopiedSchema(false), 2000);
    } catch {
      // Portapapeles bloqueado: el schema sigue disponible en el repo.
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-iconic-soft-blue/60 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-iconic-graphite/60">
        <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
        Importar extraccion estructurada JSON (experimental)
      </h4>
      <p className="mt-1 text-[11px] text-iconic-graphite/60">
        Corre una herramienta externa (Lift/Datalab, Claude, GPT, Gemini…) por tu cuenta con el
        schema copiable, y pega aqui el JSON para compararlo contra la deteccion interna F7. No se
        integra ninguna API ni se suben planos: solo texto pegado, marcado como evidencia{' '}
        <code>external_json</code>, sin aprobacion automatica.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void handleCopySchema()} disabled={disabled}>
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
          {copiedSchema ? 'Schema copiado' : 'Copiar schema para herramienta externa'}
        </Button>
      </div>

      <Label htmlFor="external-extraction-json" className="mt-3 block">
        JSON de la herramienta externa
      </Label>
      <textarea
        id="external-extraction-json"
        value={jsonText}
        onChange={(event) => setJsonText(event.target.value)}
        className="mt-1 min-h-28 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-line dark:bg-surface-soft dark:text-content"
        placeholder='{"schemaVersion":"steel-ext-1","elements":[{"elementKey":"VC-2","elementType":"viga","section":"50x60",…}]}'
        disabled={disabled}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleValidate} disabled={disabled || jsonText.trim().length === 0}>
          Validar JSON
        </Button>
        <Button type="button" size="sm" onClick={handleImport} disabled={disabled || jsonText.trim().length === 0}>
          <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
          Importar y comparar con F7
        </Button>
      </div>

      {parseResult && !parseResult.ok && (
        <InlineCallout tone="warning" className="mt-2" title="El JSON no es valido para importar">
          <ul role="list" className="list-inside list-disc space-y-0.5">
            {parseResult.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </InlineCallout>
      )}

      {parseResult?.ok && (
        <div className="mt-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="success">
              {parseResult.extraction.elements.length} elemento(s) externos validos
            </Badge>
            <Badge variant="secondary">schema {parseResult.extraction.schemaVersion}</Badge>
            {parseResult.extraction.tool && <Badge variant="secondary">herramienta: {parseResult.extraction.tool}</Badge>}
            <Badge variant="secondary">metodo: external_json</Badge>
          </div>
          {parseResult.extraction.issues.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
              {parseResult.extraction.issues.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {comparison && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="success">Coinciden: {comparison.summary.match}</Badge>
            <Badge variant="warning">Solo externo: {comparison.summary.externalOnly}</Badge>
            <Badge variant="secondary">Solo F7: {comparison.summary.internalOnly}</Badge>
            <Badge variant={comparison.summary.conflicts > 0 ? 'destructive' : 'secondary'}>
              Conflictos: {comparison.summary.conflicts}
            </Badge>
          </div>
          <ul className="mt-2 space-y-1.5">
            {comparison.entries.map((entry) => (
              <li key={entry.elementKey} className="rounded border border-iconic-soft-blue/30 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{entry.elementKey}</span>
                  <Badge variant={STATUS_VARIANT[entry.status]}>
                    {EXTERNAL_COMPARISON_STATUS_LABEL[entry.status]}
                  </Badge>
                  {entry.external && (
                    <span className="text-iconic-graphite/50">
                      externo: {entry.external.sourceFileName ?? 'fuente no disponible'}
                      {entry.external.pageNumber !== undefined ? ` · p.${entry.external.pageNumber}` : ''}
                    </span>
                  )}
                </div>
                <ul className="mt-0.5 list-disc pl-4 text-[11px] text-iconic-graphite/70">
                  {entry.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-iconic-graphite/50">
            La comparacion es un tablero de evaluacion: sirve si reduce trabajo humano frente a
            sacar cantidades a mano. Nada de lo externo se aprueba automaticamente; el humano
            decide contra el plano.
          </p>
        </div>
      )}
    </div>
  );
}
