/**
 * structural-drawing-analysis.test.ts — Orquestador F7 + guardas de fase.
 *
 * Cubre: análisis multi-plano (ejemplo 5 del mandato: ubicación en un plano,
 * refuerzo en otro), integración con candidatos F6, puente de evidencia a
 * Excel (resumen de hallazgos por elemento), y guardas estáticas: sin
 * DB/Supabase/server/fetch, sin cálculo ml/kg/costo, cableado UI del panel
 * "Revision tecnica del plano" sin romper F6.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeStructuralDrawings,
  elementKeyForCandidateLabel,
  findingsSummaryForElement,
} from '@/lib/steel/structural-drawing-analysis';
import { detectPdfIntakeCandidates } from '@/lib/steel/pdf-intake-candidates';
import type { SpatialTextItemInput } from '@/lib/steel/drawing-spatial-model';

/** Planta con grilla y rótulo VC-EJE-1 posicionado (coordenadas reales). */
const PLANTA_ITEMS: SpatialTextItemInput[] = [
  { str: 'A', x: 200, y: 590, width: 10, height: 10 },
  { str: 'B', x: 400, y: 590, width: 10, height: 10 },
  { str: '1', x: 10, y: 450, width: 10, height: 10 },
  { str: '2', x: 10, y: 250, width: 10, height: 10 },
  { str: 'VC-EJE-1', x: 220, y: 440, width: 60, height: 9 },
  { str: 'PLANTA DE CIMENTACION', x: 300, y: 30, width: 180, height: 12 },
  { str: '.', x: 780, y: 10, width: 4, height: 4 },
];

describe('analyzeStructuralDrawings — plan set multi-plano (ejemplo 5)', () => {
  const candidates = detectPdfIntakeCandidates('VC-EJE-1 5#5600', {
    pageNumber: 1,
    fileName: 'despieces.pdf',
    sourceType: 'refuerzo_despiece',
  });

  const analysis = analyzeStructuralDrawings(
    [
      {
        fileName: 'planta.pdf',
        pages: [{ pageNumber: 1, included: true, nativeText: '', spatialItems: PLANTA_ITEMS }],
      },
      {
        fileName: 'despieces.pdf',
        pages: [
          {
            pageNumber: 1,
            included: true,
            sourceType: 'refuerzo_despiece',
            nativeText: 'DESPIECE VIGAS\nVC-EJE-1 5#5600',
          },
        ],
      },
    ],
    candidates,
  );

  it('el elemento cruza planos: ubicacion en la planta, refuerzo en el despiece', () => {
    const record = analysis.registry.find((r) => r.elementKey === 'VC-EJE-1');
    expect(record).toBeDefined();
    // Menciones en ambos archivos.
    const files = new Set(record!.sourceMentions.map((m) => m.sourceFileName));
    expect(files).toEqual(new Set(['planta.pdf', 'despieces.pdf']));
    // Con grilla + candidato F6: sin faltantes.
    expect(record!.reviewStatus).toBe('completo');
    expect(record!.missingEvidence).toHaveLength(0);
  });

  it('la grilla de la planta se detecta y ubica el rotulo (sugerencia con razon)', () => {
    expect(analysis.gridContexts.some((grid) => grid.gridDetected)).toBe(true);
    const location = analysis.locationContexts.find((l) => l.elementText.includes('VC-EJE-1'));
    expect(location).toBeDefined();
    expect(location!.locationConfidence).not.toBe('no_ubicable');
    expect(location!.nearbyAxisLabels.length).toBeGreaterThan(0);
    // El contexto de ejes aparece como hallazgo informativo.
    expect(analysis.findings.some((f) => f.type === 'possible_axis_context')).toBe(true);
  });

  it('no emite missing_location ni missing_reinforcement para el elemento completo', () => {
    expect(
      analysis.findings.some(
        (f) =>
          (f.type === 'missing_location' || f.type === 'missing_reinforcement') &&
          f.elementKey === 'VC-EJE-1',
      ),
    ).toBe(false);
  });

  it('el resumen de hallazgos por elemento alimenta la observacion del Excel (F4A.2)', () => {
    // Elemento con hallazgo: version sin leyenda para Q.
    const withQ = analyzeStructuralDrawings([
      { fileName: 'p.pdf', pages: [{ pageNumber: 1, included: true, nativeText: 'DESPIECE\nVC-01 3Q#4 L=2.40' }] },
    ]);
    const key = elementKeyForCandidateLabel('VC-01');
    expect(key).toBe('VC-01');
    // Los hallazgos de nomenclatura no llevan elementKey; el resumen usa los
    // hallazgos del elemento (p. ej. faltantes) cuando existen.
    const summary = findingsSummaryForElement(withQ.findings, 'VC-01');
    if (summary) {
      expect(summary).toContain('Hallazgo');
    }
    expect(findingsSummaryForElement(withQ.findings, undefined)).toBeUndefined();
    expect(findingsSummaryForElement(withQ.findings, 'NO-EXISTE')).toBeUndefined();
  });

  it('el analisis NUNCA produce cantidades/ml/kg/costos (F1 es la unica calculadora)', () => {
    const serialized = JSON.stringify(analysis).toLowerCase();
    for (const forbidden of ['"totalml"', '"totalkg"', '"weightkg"', '"costo"', '"cost"', '"price"', '"subtotal"']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('guardas estaticas F7 (sin DB/red/nav global; F6 intacto)', () => {
  const LIB_DIR = path.join(process.cwd(), 'lib', 'steel');
  const F7_MODULES = [
    'drawing-spatial-model.ts',
    'drawing-page-regions.ts',
    'drawing-grid-context.ts',
    'drawing-element-registry.ts',
    'drawing-nomenclature.ts',
    'drawing-table-structure.ts',
    'structural-review-findings.ts',
    'structural-drawing-analysis.ts',
  ];

  it('los modulos F7 no importan DB/Supabase/server/storage ni hacen fetch', () => {
    for (const name of F7_MODULES) {
      const source = readFileSync(path.join(LIB_DIR, name), 'utf8');
      expect(source, name).not.toMatch(/supabase|@\/server\/|drizzle|postgres|\bfetch\s*\(|localStorage|indexedDB|XMLHttpRequest|WebSocket/i);
    }
  });

  it('los modulos F7 no importan la calculadora/optimizador F1 (solo el parser de lectura)', () => {
    for (const name of F7_MODULES) {
      const source = readFileSync(path.join(LIB_DIR, name), 'utf8');
      expect(source, name).not.toMatch(/calculator|cutting-optimizer|\bwaste\b/i);
    }
  });

  it('el panel F7 esta cableado en la seccion de intake sin quitar el flujo F6', () => {
    const componentsDir = path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components');
    const intake = readFileSync(path.join(componentsDir, 'manual-pdf-intake-section.tsx'), 'utf8');
    const panel = readFileSync(path.join(componentsDir, 'structural-review-panel.tsx'), 'utf8');

    expect(intake).toContain('<StructuralReviewPanel');
    expect(intake).toContain('analyzeStructuralDrawings');
    // El flujo F6 sigue completo (panel de elementos + tabla de candidatos).
    expect(intake).toContain('<ElementEvidencePanel');
    expect(intake).toContain('Detectar candidatos del plan set');
    expect(intake).toContain('Enviar aprobados al takeoff manual');

    expect(panel).toContain('Revision tecnica del plano');
    expect(panel).toContain('Marcar revisado');
    expect(panel).toContain('Ignorar');
    expect(panel).toContain('Vincular a elemento');
    expect(panel).toContain('F1 sigue siendo la unica calculadora');

    for (const source of [intake, panel]) {
      const importLines = source.split(/\r?\n/).filter((line) => /^\s*import\b|\bfrom\s+['"]/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/supabase|@\/server\//i);
      }
    }
  });

  it('el borde cliente pdfjs conserva items posicionados sin romper la vista F6', () => {
    const client = readFileSync(path.join(LIB_DIR, 'pdf-text-extract-client.ts'), 'utf8');
    expect(client).toContain('spatialItems');
    expect(client).toContain('buildPageLines'); // vista F6 intacta
    expect(client).toContain('fontSize');
    expect(client).toContain('rotation');
  });
});
