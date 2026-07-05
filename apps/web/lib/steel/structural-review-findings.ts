/**
 * structural-review-findings.ts — Motor de hallazgos técnicos (F7, puro).
 *
 * Convierte la comprensión estructural (regiones, ejes, elementos,
 * nomenclatura, tablas) + los candidatos F6 en HALLAZGOS revisables:
 * contradicciones, faltantes, nomenclaturas sin resolver, desfases de conteo
 * y pérdidas de símbolo del OCR.
 *
 * Reglas duras:
 * - El motor NUNCA inventa el dato correcto: detecta la contradicción y la
 *   describe con evidencia ("los segmentos suman 220 pero el texto dice X.
 *   Revisar."), jamás la corrige.
 * - Cero cálculo de cantidades/ml/kg/costo: el parser F1 se usa SOLO para
 *   LEER longitudes declaradas (misma disciplina que F6A/F6E).
 * - Si no hay evidencia suficiente para afirmar algo (conteo gráfico), el
 *   hallazgo lo dice explícitamente (`graphic_count_unverified`), no calla.
 * - Nada bloquea el flujo F6 actual: los hallazgos COMPLEMENTAN la revisión.
 */
import { parseSteelDescription, toDecimal } from '@/modules/steel';
import type { PdfIntakeCandidate } from './pdf-intake-candidates';
import type { ElementLocationContext, PageGridContext } from './drawing-grid-context';
import type { ElementRecord } from './drawing-element-registry';
import type { NomenclatureReport } from './drawing-nomenclature';
import type { PageRegionResult } from './drawing-page-regions';
import { dataRowCount, type TableDetectionResult } from './drawing-table-structure';
import { normalizeDrawingText, type SpatialPage } from './drawing-spatial-model';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type StructuralFindingType =
  | 'unresolved_nomenclature'
  | 'missing_location'
  | 'missing_reinforcement'
  | 'conflicting_reinforcement'
  | 'segment_sum_mismatch'
  | 'count_mismatch'
  | 'possible_table'
  | 'possible_axis_context'
  | 'graphic_count_unverified'
  | 'ocr_symbol_loss'
  | 'low_layout_confidence'
  | 'complex_notation_unparsed'
  | 'title_block_noise';

export type StructuralFindingSeverity = 'info' | 'warning' | 'critical';

export type StructuralFindingConfidence = 'alta' | 'media' | 'baja';

export interface StructuralFinding {
  id: string;
  type: StructuralFindingType;
  severity: StructuralFindingSeverity;
  elementKey?: string;
  sourceFileName?: string;
  pageNumber?: number;
  /** Fragmentos literales que sustentan el hallazgo (trazabilidad). */
  evidence: readonly string[];
  explanation: string;
  suggestedAction: string;
  confidence: StructuralFindingConfidence;
  /** true ⇒ la revisión humana debería resolverlo antes de aprobar. */
  blockingForApproval: boolean;
}

export const STRUCTURAL_FINDING_TYPE_LABEL: Record<StructuralFindingType, string> = {
  unresolved_nomenclature: 'Nomenclatura no resuelta',
  missing_location: 'Falta ubicacion',
  missing_reinforcement: 'Falta refuerzo',
  conflicting_reinforcement: 'Refuerzo en conflicto',
  segment_sum_mismatch: 'Segmentos vs longitud no coinciden',
  count_mismatch: 'Desfase de conteo',
  possible_table: 'Posible tabla/cuadro',
  possible_axis_context: 'Contexto de ejes disponible',
  graphic_count_unverified: 'Conteo grafico no confiable',
  ocr_symbol_loss: 'Simbolo perdido por OCR',
  low_layout_confidence: 'Layout con baja confianza',
  complex_notation_unparsed: 'Notacion compleja sin normalizar',
  title_block_noise: 'Posible rotulo / metadato del plano',
};

const SEVERITY_ORDER: Record<StructuralFindingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// Chequeos puros individuales (testeables de forma aislada)
// ---------------------------------------------------------------------------

export interface SegmentSumCheckInput {
  /** Segmentos del detalle gráfico, en cm (p. ej. [35, 150, 35] o "35 + 150 + 35"). */
  segments: readonly number[] | string;
  /** Texto/nomenclatura bajo el detalle (p. ej. "2x34#7210@15" o "E#3 L=2.20"). */
  calloutText: string;
  elementKey?: string;
  sourceFileName?: string;
  pageNumber?: number;
}

function parseSegments(input: readonly number[] | string): number[] {
  if (Array.isArray(input)) return input.filter((n) => Number.isFinite(n) && n > 0);
  const text = String(input);
  return text
    .split(/[+\-–]/)
    .map((part) => Number(part.trim().replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Ejemplo 1 del mandato: segmentos de estribo 35-150-35 (suma 220) vs texto
 * que declara otra longitud ⇒ `segment_sum_mismatch`. Si el texto declara la
 * misma longitud ⇒ sin hallazgo. Si el texto no se puede normalizar a una
 * longitud ⇒ `complex_notation_unparsed` (no se descarta en silencio ni se
 * inventa el dato final).
 */
export function checkSegmentSumAgainstCallout(
  input: SegmentSumCheckInput,
): StructuralFinding | undefined {
  const segments = parseSegments(input.segments);
  if (segments.length < 2) return undefined;

  const sumCm = segments.reduce((acc, n) => acc.plus(toDecimal(String(n))), toDecimal('0'));
  // La separación final ("@15") es dato de espaciamiento, no de longitud: se
  // retira SOLO para comparar longitudes (lectura, no invención; el texto
  // original queda íntegro en la evidencia).
  const lengthOnlyText = input.calloutText.replace(/@\s*\d+(?:[.,]\d+)?\s*(?:CM)?\s*$/i, '').trim();
  const parsed = parseSteelDescription(lengthOnlyText);
  const base = {
    elementKey: input.elementKey,
    sourceFileName: input.sourceFileName,
    pageNumber: input.pageNumber,
  };

  if (parsed.steelFamily !== 'rebar' || parsed.cutLengthM === undefined) {
    return {
      id: '',
      type: 'complex_notation_unparsed',
      severity: 'warning',
      ...base,
      evidence: [`Segmentos: ${segments.join(' + ')} = ${sumCm.toString()} cm`, `Texto: "${input.calloutText}"`],
      explanation: `El detalle trae segmentos que suman ${sumCm.toString()} cm, pero la nomenclatura "${input.calloutText}" no se pudo normalizar a una longitud comparable (${parsed.explanation}). No se descarta ni se inventa: requiere lectura humana.`,
      suggestedAction:
        'Interpretar la nomenclatura manualmente contra el plano y digitar la linea en el formulario manual si aplica.',
      confidence: 'media',
      blockingForApproval: true,
    };
  }

  const statedCm = toDecimal(parsed.cutLengthM).times(100);
  if (statedCm.eq(sumCm)) return undefined;

  return {
    id: '',
    type: 'segment_sum_mismatch',
    severity: 'warning',
    ...base,
    evidence: [
      `Segmentos del detalle: ${segments.join(' + ')} = ${sumCm.toString()} cm`,
      `Nomenclatura: "${input.calloutText}" ⇒ longitud declarada ${statedCm.toString()} cm`,
    ],
    explanation: `Posible inconsistencia: la longitud del estribo por segmentos es ${sumCm.toString()} cm, pero la nomenclatura/texto indica ${statedCm.toString()} cm. No se corrige automaticamente.${input.elementKey ? ` Revisar detalle ${input.elementKey}.` : ' Revisar el detalle en el plano.'}`,
    suggestedAction:
      'Verificar contra el plano cual longitud es la correcta (segmentos del grafico vs texto) antes de aprobar el candidato.',
    confidence: 'media',
    blockingForApproval: true,
  };
}

export interface CountComparisonInput {
  /** Cuántas instancias lista la tabla/listado. */
  listedCount: number;
  listedEvidence: string;
  /** Claves/rótulos de instancias detectadas gráfica/textualmente. */
  detectedKeys: readonly string[];
  /** ¿La detección alcanza para afirmar un conteo? */
  detectionReliable: boolean;
  unreliableReason?: string;
  /** Qué se está contando ("zapatas", "pilotes"). */
  kindLabel: string;
  sourceFileName?: string;
  pageNumber?: number;
}

/**
 * Ejemplos 2/7/8 del mandato: 19 zapatas detectadas vs 16 listadas ⇒
 * `count_mismatch`. Detección insuficiente ⇒ `graphic_count_unverified`
 * (se dice, no se calla). Conteos iguales ⇒ sin hallazgo.
 */
export function compareListedVsDetectedCount(
  input: CountComparisonInput,
): StructuralFinding | undefined {
  const base = { sourceFileName: input.sourceFileName, pageNumber: input.pageNumber };

  if (!input.detectionReliable) {
    return {
      id: '',
      type: 'graphic_count_unverified',
      severity: 'info',
      ...base,
      evidence: [input.listedEvidence, `Instancias detectadas: ${input.detectedKeys.length}`],
      explanation: `Conteo grafico no confiable para ${input.kindLabel}: ${input.unreliableReason ?? 'la evidencia detectada no alcanza para contar instancias con seguridad'}. El listado declara ${input.listedCount}; no se afirma ni se niega el desfase.`,
      suggestedAction: `Contar manualmente las instancias de ${input.kindLabel} en el plano y contrastar con el listado (${input.listedCount}).`,
      confidence: 'baja',
      blockingForApproval: false,
    };
  }

  const detected = new Set(input.detectedKeys).size;
  if (detected === input.listedCount) return undefined;

  const difference = Math.abs(detected - input.listedCount);
  return {
    id: '',
    type: 'count_mismatch',
    severity: 'warning',
    ...base,
    evidence: [
      input.listedEvidence,
      `Instancias graficas/rotuladas detectadas: ${detected} (${[...new Set(input.detectedKeys)].slice(0, 12).join(', ')}${detected > 12 ? '…' : ''})`,
    ],
    explanation: `Desfase de conteo: se detectan ${detected} instancias graficas/rotuladas de ${input.kindLabel}, pero la tabla/listado contiene ${input.listedCount}. Diferencia: ${difference}. Requiere revision — no se ajusta ninguna cantidad automaticamente.`,
    suggestedAction: `Revisar el plano y el cuadro para confirmar cuantas ${input.kindLabel} existen realmente antes de tomar cantidades.`,
    confidence: 'media',
    blockingForApproval: true,
  };
}

export interface OcrSymbolLossInput {
  /** Líneas de texto NATIVO de una página (con `#` confiable). */
  nativeLines: readonly { text: string; lineId?: string }[];
  /** Texto OCR de la MISMA página. */
  ocrText: string;
  sourceFileName?: string;
  pageNumber?: number;
}

/** Fragmento nativo de despiece con `#`: 5#5600 · 74E#3200 · 2X65E#3182. */
const NATIVE_HASH_FRAGMENT_PATTERN = /(?:\d+\s*[xX]\s*)?\d+\s*E?\s*#\s*\d{2,5}/g;

/**
 * Ejemplo 9 del mandato: el OCR leyó `545600` (o `55600`) donde el nativo
 * dice `5#5600` ⇒ hallazgo ESPECÍFICO por lectura (no banner genérico).
 * El `#` jamás se reconstruye automáticamente: eso sería inventar.
 */
export function detectOcrSymbolLoss(input: OcrSymbolLossInput): StructuralFinding[] {
  if (input.ocrText.trim().length === 0) return [];
  const ocrTokens = new Set(
    normalizeDrawingText(input.ocrText)
      .split(/[^0-9A-ZØ#=@.]+/)
      .filter((token) => token.length >= 4),
  );

  const findings: StructuralFinding[] = [];
  const reported = new Set<string>();

  for (const line of input.nativeLines) {
    NATIVE_HASH_FRAGMENT_PATTERN.lastIndex = 0;
    for (const match of normalizeDrawingText(line.text).matchAll(NATIVE_HASH_FRAGMENT_PATTERN)) {
      const nativeFragment = (match[0] ?? '').replace(/\s+/g, '');
      if (!nativeFragment.includes('#') || reported.has(nativeFragment)) continue;
      // El # pudo perderse (55600) o leerse como otro carácter (545600).
      const escaped = nativeFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lossPattern = new RegExp(`^${escaped.replace('#', '[^#]?')}$`);
      const corrupted = [...ocrTokens].find(
        (token) => token !== nativeFragment && lossPattern.test(token),
      );
      if (!corrupted) continue;
      reported.add(nativeFragment);
      findings.push({
        id: '',
        type: 'ocr_symbol_loss',
        severity: 'warning',
        sourceFileName: input.sourceFileName,
        pageNumber: input.pageNumber,
        evidence: [`Texto nativo: "${nativeFragment}"`, `Lectura OCR: "${corrupted}"`],
        explanation: `El OCR leyo "${corrupted}" donde el texto nativo dice "${nativeFragment}": el simbolo # se perdio o se confundio en esa lectura especifica. La lectura nativa es la confiable; el texto OCR de esa zona no debe usarse sin corregir.`,
        suggestedAction: `Corregir la lectura OCR "${corrupted}" a "${nativeFragment}" (o descartar el candidato OCR duplicado). No se reconstruye automaticamente.`,
        confidence: 'media',
        blockingForApproval: false,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Motor: hallazgos desde el análisis completo
// ---------------------------------------------------------------------------

export interface StructuralFindingsInput {
  /** Páginas espaciales NATIVAS (una por página incluida de cada fuente). */
  spatialPages: readonly SpatialPage[];
  /** PARALELO a `spatialPages` (mismo índice: varias fuentes pueden repetir número de página). */
  regionResults: readonly PageRegionResult[];
  gridContexts: readonly PageGridContext[];
  registry: readonly ElementRecord[];
  locationContexts: readonly ElementLocationContext[];
  nomenclature: NomenclatureReport;
  tableResults: readonly TableDetectionResult[];
  candidates: readonly PdfIntakeCandidate[];
  /** Texto OCR por página (para pérdida de símbolos), si existe. */
  ocrTextByPage?: ReadonlyMap<string, string>;
}

function pageKey(fileName: string | undefined, pageNumber: number): string {
  return `${fileName ?? ''}·${pageNumber}`;
}

/** Segmentos "35 + 150 + 35" y llamado "…#…" conviviendo en la misma región. */
const SEGMENT_SUM_PATTERN = /\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?){1,}/;
const CALLOUT_PATTERN = /(?:\d+\s*[xX]\s*)?\d+\s*E?\s*#\s*\d{2,5}(?:\s*@\s*\d+(?:[.,]\d+)?(?:\s*CM)?)?|#\s*\d{1,2}\s*L\s*=\s*\d+(?:[.,]\d+)?/;

const KIND_BY_TABLE_HINT: readonly { pattern: RegExp; kind: string; kindLabel: string }[] = [
  { pattern: /ZAPATAS?/, kind: 'zapata', kindLabel: 'zapatas' },
  { pattern: /VIGAS?/, kind: 'viga', kindLabel: 'vigas' },
  { pattern: /PILOTES?/, kind: 'pilote', kindLabel: 'pilotes' },
  { pattern: /COLUMNAS?/, kind: 'columna', kindLabel: 'columnas' },
];

export function buildStructuralReviewFindings(input: StructuralFindingsInput): StructuralFinding[] {
  const findings: StructuralFinding[] = [];

  // 1. Nomenclaturas no resueltas (Q sin leyenda ⇒ hallazgo; con leyenda no).
  for (const resolution of input.nomenclature.resolutions) {
    if (resolution.kind !== 'unresolved') continue;
    const first = resolution.occurrences[0];
    findings.push({
      id: '',
      type: 'unresolved_nomenclature',
      severity: 'warning',
      sourceFileName: first?.sourceFileName,
      pageNumber: first?.pageNumber,
      evidence: resolution.occurrences.slice(0, 5).map((o) => `p.${o.pageNumber}: "${o.lineText}"`),
      explanation: `Nomenclatura no resuelta: "${resolution.symbol}" aparece en el plano pero no fue encontrada en la leyenda detectada. Requiere definicion manual — el sistema no asume su significado.`,
      suggestedAction: `Buscar la convencion de "${resolution.symbol}" en las notas/leyenda del plano (u otra hoja del plan set) y definirla manualmente.`,
      confidence: 'media',
      blockingForApproval: false,
    });
  }

  // 2. Estados de elementos: faltantes, conflictos y ruido de rótulo (F7.1).
  for (const record of input.registry) {
    const firstMention = record.sourceMentions[0];
    if (record.suspectedTitleBlockOnly) {
      findings.push({
        id: '',
        type: 'title_block_noise',
        severity: 'info',
        elementKey: record.elementKey,
        sourceFileName: firstMention?.sourceFileName,
        pageNumber: firstMention?.pageNumber,
        evidence: record.sourceMentions.slice(0, 3).map((m) => `p.${m.pageNumber}: "${m.lineText}"`),
        explanation: `${record.displayLabel}: ${record.reviewStatusReason}`,
        suggestedAction:
          'Confirmar contra el plano: si es un elemento real, vincula su mencion tecnica (planta/despiece); si es el nombre del plano, ignora este codigo.',
        confidence: 'media',
        blockingForApproval: false,
      });
      continue;
    }
    if (record.reviewStatus === 'conflicto') {
      findings.push({
        id: '',
        type: 'conflicting_reinforcement',
        severity: 'critical',
        elementKey: record.elementKey,
        sourceFileName: firstMention?.sourceFileName,
        pageNumber: firstMention?.pageNumber,
        evidence: record.conflicts,
        explanation: `Conflicto en ${record.displayLabel}: ${record.conflicts.join(' · ')} No se resuelve automaticamente.`,
        suggestedAction: 'Verificar contra el plano y descartar la lectura incorrecta antes de aprobar.',
        confidence: 'media',
        blockingForApproval: true,
      });
      continue;
    }
    if (record.missingEvidence.length > 0) {
      const missingLocation = record.reviewStatus === 'falta_ubicacion';
      const missingReinforcement = record.reviewStatus === 'falta_refuerzo';
      if (missingLocation || missingReinforcement) {
        findings.push({
          id: '',
          type: missingLocation ? 'missing_location' : 'missing_reinforcement',
          severity: 'warning',
          elementKey: record.elementKey,
          sourceFileName: firstMention?.sourceFileName,
          pageNumber: firstMention?.pageNumber,
          evidence: record.sourceMentions.slice(0, 4).map((m) => `p.${m.pageNumber}: "${m.lineText}"`),
          explanation: `${record.displayLabel}: ${record.missingEvidence.join(' ')}`,
          suggestedAction: missingLocation
            ? 'Cargar/incluir la planta donde el elemento esta localizado o vincular manualmente la fuente de ubicacion.'
            : 'Cargar/incluir el despiece o cuadro con el refuerzo del elemento, o registrarlo manualmente.',
          confidence: 'media',
          blockingForApproval: false,
        });
      }
    }
  }

  // 3. Contexto de ejes logrado (evidencia de ubicación agregada) + grillas.
  for (const location of input.locationContexts) {
    if (location.locationConfidence === 'no_ubicable' || !location.locationContext) continue;
    findings.push({
      id: '',
      type: 'possible_axis_context',
      severity: 'info',
      elementKey: input.registry.find((r) =>
        r.sourceMentions.some((m) => normalizeDrawingText(m.rawLabel) === normalizeDrawingText(location.elementText)),
      )?.elementKey,
      pageNumber: location.pageNumber,
      evidence: [`Ejes cercanos: ${location.nearbyAxisLabels.join(', ')}`],
      explanation: `${location.elementText}: ${location.locationContext} (${location.reason})`,
      suggestedAction: 'Confirmar la ubicacion sugerida contra la planta; es una sugerencia por posicion, no un dato del plano.',
      confidence: location.locationConfidence,
      blockingForApproval: false,
    });
  }

  // 4. Segmentos vs texto en la misma región (detalles de estribo).
  const segmentChecked = new Set<string>();
  for (const [pageIndex, page] of input.spatialPages.entries()) {
    const regions = input.regionResults[pageIndex]?.regions ?? [];
    for (const region of regions) {
      const regionLines = page.lines.filter((line) => region.lineIds.includes(line.lineId));
      const segmentLine = regionLines.find((line) => SEGMENT_SUM_PATTERN.test(line.normalizedText));
      const calloutLine = regionLines.find(
        (line) => CALLOUT_PATTERN.test(line.normalizedText) && line !== segmentLine,
      );
      if (!segmentLine || !calloutLine) continue;
      const dedupe = `${pageIndex}·${segmentLine.lineId}·${calloutLine.lineId}`;
      if (segmentChecked.has(dedupe)) continue;
      segmentChecked.add(dedupe);
      const segmentsText = segmentLine.normalizedText.match(SEGMENT_SUM_PATTERN)?.[0] ?? '';
      const calloutText = calloutLine.normalizedText.match(CALLOUT_PATTERN)?.[0] ?? '';
      const finding = checkSegmentSumAgainstCallout({
        segments: segmentsText,
        calloutText,
        sourceFileName: page.sourceFileName,
        pageNumber: page.pageNumber,
        elementKey: input.registry.find((r) =>
          r.sourceMentions.some((m) => m.lineId === segmentLine.lineId || m.lineId === calloutLine.lineId),
        )?.elementKey,
      });
      if (finding) findings.push(finding);
    }
  }

  // 5. Tablas detectadas + conteos por tipo de elemento (arrays paralelos).
  for (const [pageIndex, result] of input.tableResults.entries()) {
    for (const table of result.tables) {
      findings.push({
        id: '',
        type: 'possible_table',
        severity: 'info',
        sourceFileName: table.sourceFileName,
        pageNumber: table.pageNumber,
        evidence: table.headerGuesses.length > 0 ? [`Encabezados: ${table.headerGuesses.join(' | ')}`] : [table.reason],
        explanation: `Posible tabla/cuadro en p.${table.pageNumber}: ${table.rows.length} filas × ${table.columnCount} columnas. ${table.reason}`,
        suggestedAction: 'Revisar la tabla detectada y confirmar filas/columnas antes de usar sus valores.',
        confidence: table.confidence,
        blockingForApproval: false,
      });

      const hint = KIND_BY_TABLE_HINT.find(
        (entry) =>
          entry.pattern.test(table.headerGuesses.join(' ')) ||
          entry.pattern.test(
            input.regionResults[pageIndex]?.regions.find((region) =>
              table.rows.some((row) => region.lineIds.includes(row.lineId)),
            )?.titleText ?? '',
          ),
      );
      if (!hint) continue;
      const detectedKeys = input.registry
        .filter((record) => record.kind === hint.kind)
        .map((record) => record.elementKey);
      const listedCount = dataRowCount(table);
      if (listedCount <= 0) continue;
      const reliable = detectedKeys.length > 0;
      const finding = compareListedVsDetectedCount({
        listedCount,
        listedEvidence: `Tabla p.${table.pageNumber} (${table.tableId}): ${listedCount} fila(s) de datos`,
        detectedKeys,
        detectionReliable: reliable,
        unreliableReason: reliable
          ? undefined
          : `no se detectaron rotulos de ${hint.kindLabel} en las paginas incluidas`,
        kindLabel: hint.kindLabel,
        sourceFileName: table.sourceFileName,
        pageNumber: table.pageNumber,
      });
      if (finding) findings.push(finding);
    }
  }

  // 6. Pérdida de símbolo OCR específica por lectura.
  if (input.ocrTextByPage) {
    for (const page of input.spatialPages) {
      const ocrText = input.ocrTextByPage.get(pageKey(page.sourceFileName, page.pageNumber));
      if (!ocrText) continue;
      findings.push(
        ...detectOcrSymbolLoss({
          nativeLines: page.lines.map((line) => ({ text: line.text, lineId: line.lineId })),
          ocrText,
          sourceFileName: page.sourceFileName,
          pageNumber: page.pageNumber,
        }),
      );
    }
  }

  // 7. Candidatos no interpretables ⇒ hallazgo técnico, no descarte silencioso.
  for (const candidate of input.candidates) {
    if (candidate.status === 'discarded') continue;
    if (candidate.confidenceLevel !== 'not_interpretable') continue;
    findings.push({
      id: '',
      type: 'complex_notation_unparsed',
      severity: 'warning',
      elementKey: candidate.elementLabel ? normalizeDrawingText(candidate.elementLabel) : undefined,
      sourceFileName: candidate.evidence.fileName,
      pageNumber: candidate.evidence.pageNumber,
      evidence: [`"${candidate.evidence.lineText}"`, `Fragmento: "${candidate.candidateText}"`],
      explanation: `La notacion "${candidate.candidateText}" no se pudo normalizar (${candidate.confidenceReason}). Se conserva como hallazgo tecnico para lectura humana — no se descarta en silencio.`,
      suggestedAction: 'Interpretar el fragmento contra el plano y digitarlo en el formulario manual si corresponde.',
      confidence: 'media',
      blockingForApproval: false,
    });
  }

  // 8. Layout con baja confianza (páginas sin coordenadas útiles).
  for (const page of input.spatialPages) {
    if (page.layoutConfidence !== 'baja' || page.lines.length === 0) continue;
    findings.push({
      id: '',
      type: 'low_layout_confidence',
      severity: 'info',
      sourceFileName: page.sourceFileName,
      pageNumber: page.pageNumber,
      evidence: [page.layoutConfidenceReason],
      explanation: `p.${page.pageNumber}: ${page.layoutConfidenceReason} Regiones, ejes y tablas de esta pagina no son confiables.`,
      suggestedAction: 'Usar el PDF nativo (texto seleccionable) cuando exista, o revisar manualmente esta pagina.',
      confidence: 'alta',
      blockingForApproval: false,
    });
  }

  // Ids estables + orden por severidad (critical → warning → info).
  return findings
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((finding, index) => ({ ...finding, id: `f7-${finding.type}-${index + 1}` }));
}
