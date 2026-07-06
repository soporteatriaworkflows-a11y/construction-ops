/**
 * dxf-pdf-comparison.ts — Comparación DXF ↔ PDF/F7 (F8A, puro, OPCIONAL).
 *
 * Cuando el plan set trae PDF y además hay DXF cargado, se comparan los
 * elementos por clave canónica (mismas nomenclaturas del registro F7):
 * coincide / solo DXF / solo PDF / conflicto (sección o tipo distintos) /
 * requiere revisión (señal débil). El DXF funciona SOLO sin PDF; esta
 * comparación jamás obliga a subir PDF ni fusiona/aprueba nada.
 */
import type { ElementRecord } from '../drawing-element-registry';
import { normalizeDrawingText } from '../drawing-spatial-model';
import type { StructuralDrawingAnalysis } from '../structural-drawing-analysis';
import type { DxfElementCandidate, DxfElementType } from './dxf-structural-extractor';

export type DxfComparisonStatus = 'match' | 'dxf_only' | 'pdf_only' | 'conflict' | 'needs_review';

export const DXF_COMPARISON_STATUS_LABEL: Record<DxfComparisonStatus, string> = {
  match: 'Coincide',
  dxf_only: 'Solo DXF (el PDF no lo trae)',
  pdf_only: 'Solo PDF (el DXF no lo trae)',
  conflict: 'Conflicto',
  needs_review: 'Requiere revisión',
};

export interface DxfComparisonEntry {
  elementKey: string;
  status: DxfComparisonStatus;
  details: readonly string[];
  dxf?: DxfElementCandidate;
  pdf?: ElementRecord;
}

export interface DxfComparisonResult {
  entries: readonly DxfComparisonEntry[];
  summary: {
    match: number;
    dxfOnly: number;
    pdfOnly: number;
    conflicts: number;
    needsReview: number;
  };
}

/** Tipo F7 (es) ↔ tipo DXF (en) para detectar conflictos de clasificación. */
const DXF_TYPE_TO_F7_KIND: Record<DxfElementType, string | undefined> = {
  beam: 'viga',
  footing: 'zapata',
  pile: 'pilote',
  column: 'columna',
  unknown: undefined,
};

function normalizedSection(section: string | undefined): string | undefined {
  if (!section) return undefined;
  return normalizeDrawingText(section).replace(/\s+/g, '').replace(/×/g, 'X');
}

/**
 * Compara candidatos DXF vs registro F7 (PDF). Nada se fusiona ni aprueba:
 * es un tablero para que la ingeniera resuelva diferencias con evidencia.
 */
export function compareDxfWithPdfAnalysis(
  dxfElements: readonly DxfElementCandidate[],
  analysis: Pick<StructuralDrawingAnalysis, 'registry'>,
): DxfComparisonResult {
  const pdfByKey = new Map(analysis.registry.map((record) => [record.elementKey, record]));
  const dxfByKey = new Map<string, DxfElementCandidate>();
  for (const element of dxfElements) {
    if (!dxfByKey.has(element.elementKey)) dxfByKey.set(element.elementKey, element);
  }

  const entries: DxfComparisonEntry[] = [];

  for (const [key, dxf] of dxfByKey) {
    const pdf = pdfByKey.get(key);
    if (!pdf) {
      entries.push({
        elementKey: key,
        status: 'dxf_only',
        details: [
          `El DXF trae "${dxf.sourceText}" (capa ${dxf.sourceLayer}); F7 no lo detectó en los PDF del plan set.`,
        ],
        dxf,
      });
      continue;
    }

    const details: string[] = [];
    let conflict = false;

    const dxfSection = normalizedSection(dxf.sectionSpec);
    const pdfSection = normalizedSection(pdf.sectionSpec);
    if (dxfSection && pdfSection && dxfSection !== pdfSection) {
      conflict = true;
      details.push(`Sección en conflicto: DXF "${dxf.sectionSpec}" vs PDF "${pdf.sectionSpec}".`);
    }

    const dxfKind = DXF_TYPE_TO_F7_KIND[dxf.elementType];
    if (dxfKind && pdf.kind && dxfKind !== pdf.kind) {
      conflict = true;
      details.push(`Tipo en conflicto: DXF dice "${dxfKind}", PDF/F7 detectó "${pdf.kind}".`);
    }

    if (dxfSection && !pdfSection) {
      details.push(`El DXF aporta sección "${dxf.sectionSpec}" que el PDF no traía legible.`);
    }
    if (dxf.diameter) {
      details.push(`Diámetro según DXF: ${dxf.diameter}.`);
    }
    if (pdf.suspectedTitleBlockOnly) {
      details.push('Ojo: para F7 este código parecía rótulo; el DXF lo confirma como elemento real.');
    }
    if (details.length === 0) details.push('Mismo elemento detectado en DXF y PDF.');

    const weakSignal = dxf.confidence < 0.8 && !conflict;
    if (weakSignal) {
      details.push('Señal DXF débil (capa genérica): confirmar contra el plano.');
    }

    entries.push({
      elementKey: key,
      status: conflict ? 'conflict' : weakSignal ? 'needs_review' : 'match',
      details,
      dxf,
      pdf,
    });
  }

  for (const record of analysis.registry) {
    if (dxfByKey.has(record.elementKey)) continue;
    // Códigos que F7 ya marcó como probable rótulo no cuentan como faltantes.
    if (record.suspectedTitleBlockOnly) continue;
    entries.push({
      elementKey: record.elementKey,
      status: 'pdf_only',
      details: [`El PDF/F7 detectó "${record.elementKey}" y el DXF cargado no lo trae.`],
      pdf: record,
    });
  }

  const summary = {
    match: entries.filter((e) => e.status === 'match').length,
    dxfOnly: entries.filter((e) => e.status === 'dxf_only').length,
    pdfOnly: entries.filter((e) => e.status === 'pdf_only').length,
    conflicts: entries.filter((e) => e.status === 'conflict').length,
    needsReview: entries.filter((e) => e.status === 'needs_review').length,
  };

  return { entries, summary };
}
