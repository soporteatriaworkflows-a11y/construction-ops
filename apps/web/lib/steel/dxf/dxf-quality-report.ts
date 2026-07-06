/**
 * dxf-quality-report.ts — CAD Drawing Quality Report (F8A, puro).
 *
 * Evalúa qué tanta ESTRUCTURA aprovechable trae el DXF y lo dice de frente:
 * capas útiles o sospechosas, bloques contables, textos técnicos, cotas y
 * tablas. NO bloquea el flujo — orienta a la usuaria sobre cuánta confianza
 * merece la lectura automática y cuánta revisión manual exige.
 */
import type { DxfParseSuccess } from './dxf-parser';
import type { DxfStructuralExtraction } from './dxf-structural-extractor';

export type CadQualityConfidence = 'alto' | 'medio' | 'bajo';

export type CadQualityRecommendation =
  | 'usable'
  | 'usable_con_revision'
  | 'baja_calidad_cad'
  | 'no_confiable';

export const CAD_QUALITY_RECOMMENDATION_LABEL: Record<CadQualityRecommendation, string> = {
  usable: 'Usable',
  usable_con_revision: 'Usable con revisión',
  baja_calidad_cad: 'Baja calidad CAD',
  no_confiable: 'No confiable',
};

export interface CadDrawingQualityReport {
  /** Hay capas con nombre útil organizando el dibujo. */
  usefulLayers: boolean;
  /** Capas genéricas presentes (Layer 0, DEFPOINTS, numéricas). */
  suspiciousLayers: readonly string[];
  /** % de entidades concentradas en una sola capa (100 = todo junto). */
  dominantLayerPct: number;
  /** Hay textos con códigos/nomenclatura estructural. */
  usefulTexts: boolean;
  /** Hay inserciones de bloque. */
  usefulInserts: boolean;
  /** Hay bloques asociables a elementos ⇒ conteo gráfico verificable. */
  countableBlocks: boolean;
  /** Hay cotas DIMENSION o textos de medida (L=, @, sumas, secciones). */
  measurementsDetected: boolean;
  /** Hay cuadros/tablas/despieces con conteos. */
  tablesDetected: boolean;
  confidence: CadQualityConfidence;
  recommendation: CadQualityRecommendation;
  notes: readonly string[];
}

/**
 * Construye el reporte de calidad. Reglas honestas:
 * - Sin textos técnicos NO hay forma de identificar elementos ⇒ no confiable.
 * - Textos + capas útiles + bloques contables ⇒ confianza alta (usable).
 * - Textos con capas O bloques ⇒ media (usable con revisión).
 * - Solo textos (todo en Layer 0, sin bloques) ⇒ baja (baja calidad CAD):
 *   la detección sigue operando por texto/cercanía pero exige revisión fuerte.
 */
export function buildCadQualityReport(
  parse: DxfParseSuccess,
  extraction: DxfStructuralExtraction,
): CadDrawingQualityReport {
  const { layerAssessment } = extraction;
  const usefulTexts = extraction.elements.length > 0;
  const usefulInserts = parse.stats.insertCount > 0;
  const countableBlocks = extraction.blockCounts.some((block) => block.elementKey !== undefined);
  const measurementsDetected = parse.stats.dimensionCount > 0 || extraction.measurementTextCount > 0;
  const tablesDetected = extraction.tableTextCount > 0 || extraction.listedCounts.length > 0;

  const notes: string[] = [];
  if (!layerAssessment.usefulLayers) {
    notes.push(
      layerAssessment.dominantLayerPct >= 95
        ? `El ${layerAssessment.dominantLayerPct}% de las entidades está en una sola capa: el dibujo no está organizado por capas.`
        : 'Las capas no aportan semántica útil; la detección se apoya en textos, bloques y cercanía espacial.',
    );
  } else if (layerAssessment.semanticLayers.length > 0) {
    notes.push(`Capas estructurales detectadas: ${layerAssessment.semanticLayers.join(', ')}.`);
  }
  if (layerAssessment.suspiciousLayers.length > 0) {
    notes.push(`Capas genéricas presentes: ${layerAssessment.suspiciousLayers.join(', ')}.`);
  }
  if (!usefulTexts) {
    notes.push('No se detectaron textos con nomenclatura estructural (VC-#, Z-#, P-#…): no es posible identificar elementos.');
  }
  if (!usefulInserts) {
    notes.push('Sin inserciones de bloque: el conteo gráfico solo puede estimarse por repetición de textos (confianza baja).');
  } else if (!countableBlocks) {
    notes.push('Hay bloques pero ninguno se pudo asociar a un elemento: el conteo gráfico queda sin verificar.');
  }
  if (!measurementsDetected) {
    notes.push('Sin cotas ni textos de medida detectados.');
  }
  if (!tablesDetected) {
    notes.push('Sin cuadros/tablas de cantidades detectados.');
  }
  if (extraction.noiseDiscarded > 0) {
    notes.push(`${extraction.noiseDiscarded} texto(s) de rótulo/metadato descartados como ruido.`);
  }

  let confidence: CadQualityConfidence;
  if (usefulTexts && layerAssessment.usefulLayers && countableBlocks) {
    confidence = 'alto';
  } else if (usefulTexts && (layerAssessment.usefulLayers || usefulInserts)) {
    confidence = 'medio';
  } else {
    confidence = 'bajo';
  }

  let recommendation: CadQualityRecommendation;
  if (!usefulTexts) {
    recommendation = 'no_confiable';
  } else if (confidence === 'alto') {
    recommendation = 'usable';
  } else if (confidence === 'medio') {
    recommendation = 'usable_con_revision';
  } else {
    recommendation = 'baja_calidad_cad';
  }

  return {
    usefulLayers: layerAssessment.usefulLayers,
    suspiciousLayers: layerAssessment.suspiciousLayers,
    dominantLayerPct: layerAssessment.dominantLayerPct,
    usefulTexts,
    usefulInserts,
    countableBlocks,
    measurementsDetected,
    tablesDetected,
    confidence,
    recommendation,
    notes,
  };
}
