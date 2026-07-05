/**
 * external-structured-extraction.test.ts — Puente BYO-JSON (F7.1 G) + guardas.
 *
 * Sin APIs, sin keys, sin red: schema copiable + JSON pegado + comparación
 * contra F7 (coincide / solo externo / solo F7 / conflicto). Método
 * `external_json`, jamás auto-aprobación, hallazgos por campos faltantes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildExternalExtractionPromptBlock,
  STEEL_EXTRACTION_JSON_SCHEMA,
  STEEL_EXTRACTION_SCHEMA_VERSION,
} from '@/lib/steel/structured-extraction-schema';
import {
  canonicalExternalKey,
  compareExternalWithInternal,
  parseExternalExtractionJson,
} from '@/lib/steel/external-structured-extraction';
import { analyzeStructuralDrawings } from '@/lib/steel/structural-drawing-analysis';

const VALID_JSON = JSON.stringify({
  schemaVersion: STEEL_EXTRACTION_SCHEMA_VERSION,
  tool: 'lift',
  elements: [
    {
      elementKey: 'VC-2',
      elementType: 'viga',
      section: '50x60',
      axisContext: 'EJE 1 entre A y B',
      sourceFileName: 'vigas.pdf',
      pageNumber: 1,
      evidenceText: 'VC-2 VC-(50x60)',
      confidence: 0.9,
    },
    {
      elementKey: 'P-99',
      elementType: 'pilote',
      diameter: 'Ø60',
      sourceFileName: 'pilotes.pdf',
      pageNumber: 2,
      evidenceText: 'PILOTE P-99 Ø60',
      unresolvedFields: ['quantity'],
    },
  ],
});

describe('schema exportable (G.1/G.4)', () => {
  it('el schema define version, elementos requeridos y campos esperados', () => {
    expect(STEEL_EXTRACTION_JSON_SCHEMA.required).toEqual(['schemaVersion', 'elements']);
    const elementProps = STEEL_EXTRACTION_JSON_SCHEMA.properties.elements.items.properties;
    for (const field of [
      'elementKey',
      'elementType',
      'axisContext',
      'section',
      'diameter',
      'quantity',
      'repetitions',
      'tableReference',
      'detailReference',
      'confidence',
      'evidenceText',
      'unresolvedFields',
      'warnings',
      'sourceFileName',
      'pageNumber',
    ]) {
      expect(elementProps, field).toHaveProperty(field);
    }
  });

  it('el bloque copiable trae instrucciones anti-invencion + el schema completo', () => {
    const block = buildExternalExtractionPromptBlock();
    expect(block).toContain('NO inventes datos');
    expect(block).toContain('unresolvedFields');
    expect(block).toContain('evidenceText');
    expect(block).toContain('NUNCA direcciones (CALLE/CARRERA)');
    expect(block).toContain(STEEL_EXTRACTION_SCHEMA_VERSION);
    expect(block).toContain('"$schema"');
  });
});

describe('parseExternalExtractionJson (G.2)', () => {
  it('acepta JSON valido, normaliza claves y marca method external_json', () => {
    const result = parseExternalExtractionJson(VALID_JSON);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.elements).toHaveLength(2);
    expect(result.extraction.elements[0]).toMatchObject({
      elementKey: 'VC-2',
      canonicalKey: 'VC-2',
      method: 'external_json',
      section: '50x60',
    });
    expect(result.extraction.tool).toBe('lift');
  });

  it('crea hallazgos/issues por campos faltantes sin inventar', () => {
    const result = parseExternalExtractionJson(VALID_JSON);
    if (!result.ok) throw new Error('esperaba ok');
    // P-99 declaró quantity sin resolver ⇒ issue visible.
    expect(result.extraction.issues.some((i) => i.message.includes('campos sin resolver: quantity'))).toBe(true);
  });

  it('rechaza JSON invalido con errores claros', () => {
    const notJson = parseExternalExtractionJson('esto no es json');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.errors[0]).toContain('JSON invalido');

    const wrongVersion = parseExternalExtractionJson(
      JSON.stringify({ schemaVersion: 'otra-version', elements: [{ elementKey: 'VC-1' }] }),
    );
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.errors.join(' ')).toContain('no soportada');

    const emptyElements = parseExternalExtractionJson(
      JSON.stringify({ schemaVersion: STEEL_EXTRACTION_SCHEMA_VERSION, elements: [] }),
    );
    expect(emptyElements.ok).toBe(false);

    const noKeys = parseExternalExtractionJson(
      JSON.stringify({ schemaVersion: STEEL_EXTRACTION_SCHEMA_VERSION, elements: [{ foo: 1 }] }),
    );
    expect(noKeys.ok).toBe(false);
  });

  it('canonicalExternalKey alinea variantes tipograficas con el registro F7', () => {
    expect(canonicalExternalKey('VC 2')).toBe('VC-2');
    expect(canonicalExternalKey('vc-2')).toBe('VC-2');
    expect(canonicalExternalKey('PILOTE Ø60')).toBe('PILOTE-Ø60');
  });
});

describe('comparacion interno vs externo (G.2/G.3)', () => {
  const analysis = analyzeStructuralDrawings([
    {
      fileName: 'vigas.pdf',
      pages: [
        {
          pageNumber: 1,
          included: true,
          nativeText: ['DESPIECE', 'VC-2 VC-(50x60) 5#5600', 'Z-01 4#5450'].join('\n'),
        },
      ],
    },
  ]);

  it('match / solo externo / solo F7 quedan clasificados', () => {
    const parsed = parseExternalExtractionJson(VALID_JSON);
    if (!parsed.ok) throw new Error('esperaba ok');
    const comparison = compareExternalWithInternal(parsed.extraction, analysis);

    const vc2 = comparison.entries.find((e) => e.elementKey === 'VC-2')!;
    expect(vc2.status).toBe('match');
    const p99 = comparison.entries.find((e) => e.elementKey === 'P-99')!;
    expect(p99.status).toBe('external_only');
    const z01 = comparison.entries.find((e) => e.elementKey === 'Z-01')!;
    expect(z01.status).toBe('internal_only');
    expect(comparison.summary).toMatchObject({ match: 1, externalOnly: 1, internalOnly: 1, conflicts: 0 });
  });

  it('atributos contradictorios ⇒ conflicto con detalle legible (no se resuelve solo)', () => {
    const conflicting = parseExternalExtractionJson(
      JSON.stringify({
        schemaVersion: STEEL_EXTRACTION_SCHEMA_VERSION,
        elements: [
          { elementKey: 'VC-2', elementType: 'zapata', section: '40x40', evidenceText: 'x', sourceFileName: 'v.pdf', pageNumber: 1 },
        ],
      }),
    );
    if (!conflicting.ok) throw new Error('esperaba ok');
    const comparison = compareExternalWithInternal(conflicting.extraction, analysis);
    const vc2 = comparison.entries.find((e) => e.elementKey === 'VC-2')!;
    expect(vc2.status).toBe('conflict');
    expect(vc2.details.join(' ')).toContain('Seccion en conflicto');
    expect(comparison.summary.conflicts).toBe(1);
  });

  it('la comparacion no calcula ml/kg/costos ni aprueba nada', () => {
    const parsed = parseExternalExtractionJson(VALID_JSON);
    if (!parsed.ok) throw new Error('esperaba ok');
    const comparison = compareExternalWithInternal(parsed.extraction, analysis);
    const serialized = JSON.stringify(comparison).toLowerCase();
    for (const forbidden of ['"totalml"', '"totalkg"', '"costo"', '"approved"', '"subtotal"']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('guardas F7.1 (sin red/keys/env; UI cableada)', () => {
  const LIB_DIR = path.join(process.cwd(), 'lib', 'steel');
  const COMPONENTS_DIR = path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components');

  it('los modulos del puente no usan fetch/API keys/env/DB', () => {
    for (const name of ['structured-extraction-schema.ts', 'external-structured-extraction.ts']) {
      const source = readFileSync(path.join(LIB_DIR, name), 'utf8');
      expect(source, name).not.toMatch(/\bfetch\s*\(|process\.env|API_KEY|supabase|@\/server\/|drizzle|localStorage|XMLHttpRequest|WebSocket/i);
    }
  });

  it('la seccion experimental esta cableada en el panel con copiar schema y comparacion', () => {
    const panel = readFileSync(path.join(COMPONENTS_DIR, 'structural-review-panel.tsx'), 'utf8');
    const section = readFileSync(path.join(COMPONENTS_DIR, 'external-extraction-section.tsx'), 'utf8');
    expect(panel).toContain('<ExternalExtractionSection');
    expect(section).toContain('Importar extraccion estructurada JSON');
    expect(section).toContain('Copiar schema para herramienta externa');
    expect(section).toContain('external_json');
    expect(section).not.toMatch(/supabase|@\/server\/|process\.env/i);
  });

  it('la trazabilidad visible existe: fuente/pagina y copiar evidencia en intake y panel', () => {
    const intake = readFileSync(path.join(COMPONENTS_DIR, 'manual-pdf-intake-section.tsx'), 'utf8');
    const panel = readFileSync(path.join(COMPONENTS_DIR, 'structural-review-panel.tsx'), 'utf8');
    expect(intake).toContain('Fuente no disponible');
    expect(intake).toContain('Copiar evidencia');
    expect(panel).toContain('Fuente no disponible');
    expect(panel).toContain('Copiar evidencia');
    // Longitudes comerciales editables cableadas en el plan de corte.
    const cutPlan = readFileSync(path.join(COMPONENTS_DIR, 'manual-cut-plan-section.tsx'), 'utf8');
    expect(cutPlan).toContain('Longitudes comerciales');
    expect(cutPlan).toContain('validateCommercialLengthInput');
  });
});
