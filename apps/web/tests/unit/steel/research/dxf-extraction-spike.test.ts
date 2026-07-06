/**
 * dxf-extraction-spike.test.ts — Prototipo F8: motor CAD/DXF aislado.
 *
 * Verifica sobre un DXF SINTÉTICO (generado por código, sin planos reales):
 * - parser de entidades TEXT/MTEXT/INSERT con capa y coordenadas;
 * - detección de VC-2 / Z-01 / P-03 reutilizando el registro F7;
 * - conteo GRÁFICO por bloques vs conteo TEXTUAL por cuadros;
 * - discrepancia 3 dibujadas vs 4 listadas como hallazgo crítico;
 * - salida steel-ext-2 con evidencia completa y needsReview=true (jamás
 *   auto-aprobación);
 * - el rótulo (ING./CALLE) jamás se vuelve elemento.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSyntheticFoundationDxf,
  countBlockInserts,
  dxfToSteelExt2,
  extractDxfElementCandidates,
  extractTextCounts,
  parseDxfEntities,
} from '@/lib/steel/research/dxf-extraction-spike';
import {
  STEEL_EXT2_JSON_SCHEMA,
  STEEL_EXT2_SCHEMA_VERSION,
  validateSteelExt2Invariants,
} from '@/lib/steel/structural-extraction-v2';

const DXF = buildSyntheticFoundationDxf();

describe('F8 spike — parser DXF mínimo', () => {
  it('extrae entidades TEXT/MTEXT/INSERT con capa y coordenadas', () => {
    const { entities, layers } = parseDxfEntities(DXF);

    const texts = entities.filter((e) => e.type === 'TEXT');
    const mtexts = entities.filter((e) => e.type === 'MTEXT');
    const inserts = entities.filter((e) => e.type === 'INSERT');

    expect(texts.length).toBeGreaterThanOrEqual(8);
    expect(mtexts.length).toBe(1);
    expect(inserts.length).toBe(4); // 3 zapatas + 1 pilote

    expect(layers).toContain('ZAPATAS');
    expect(layers).toContain('CIM-VIGAS-TEXTO');
    expect(layers).toContain('PILOTES');

    const vcText = texts.find((t) => t.type === 'TEXT' && t.text.includes('VC-2'));
    expect(vcText).toBeDefined();
    expect(vcText?.type === 'TEXT' && vcText.x).toBe(40);
    expect(vcText?.type === 'TEXT' && vcText.y).toBe(52);
  });

  it('desdobla el MTEXT multilínea (\\P) en líneas legibles', () => {
    const { entities } = parseDxfEntities(DXF);
    const mtext = entities.find((e) => e.type === 'MTEXT');
    expect(mtext?.type === 'MTEXT' && mtext.text).toContain('VC-2');
    expect(mtext?.type === 'MTEXT' && mtext.text).toContain('4#5 L=6.00');
    expect(mtext?.type === 'MTEXT' && mtext.text).toContain('E#3@15');
  });
});

describe('F8 spike — candidatos estructurales desde entidades CAD', () => {
  it('detecta VC-2, Z-01 y P-03 con capa de origen', () => {
    const { entities } = parseDxfEntities(DXF);
    const candidates = extractDxfElementCandidates(entities);
    const keys = new Set(candidates.map((c) => c.elementKey));

    expect(keys).toContain('VC-2');
    expect(keys).toContain('Z-01');
    expect(keys).toContain('P-03');

    const vc = candidates.find((c) => c.elementKey === 'VC-2');
    expect(vc?.layer).toBe('CIM-VIGAS-TEXTO');
    expect(vc?.section).toBe('50x60');
    expect(vc?.elementType).toBe('beam');
  });

  it('descarta el texto del rótulo (capa ROTULO) — direcciones/responsables jamás son elementos', () => {
    const { entities } = parseDxfEntities(DXF);
    const candidates = extractDxfElementCandidates(entities);
    expect(candidates.some((c) => c.evidenceText.includes('CALLE'))).toBe(false);
    expect(candidates.some((c) => c.evidenceText.includes('ING.'))).toBe(false);
  });

  it('cuenta instancias dibujadas por bloque y lee el conteo textual del cuadro', () => {
    const { entities } = parseDxfEntities(DXF);

    const byBlock = countBlockInserts(entities);
    expect(byBlock.get('ZAPATA_TIPO_1')?.length).toBe(3);
    expect(byBlock.get('PILOTE_D60')?.length).toBe(1);

    const textCounts = extractTextCounts(entities);
    const z01 = textCounts.find((tc) => tc.elementKey === 'Z-01');
    expect(z01?.count).toBe(4);
  });
});

describe('F8 spike — salida steel-ext-2', () => {
  const doc = dxfToSteelExt2(DXF, 'planta-sintetica.dxf');

  it('produce un documento steel-ext-2 válido con documentos fuente y capas', () => {
    expect(doc.schemaVersion).toBe(STEEL_EXT2_SCHEMA_VERSION);
    expect(doc.tool).toBe('dxf-spike');
    expect(doc.sourceDocuments[0]?.format).toBe('dxf');
    expect(doc.sourceDocuments[0]?.layers).toContain('ZAPATAS');
    expect(validateSteelExt2Invariants(doc)).toEqual([]);
  });

  it('todos los datos llevan evidencia completa, método dxf_entity y needsReview=true', () => {
    expect(doc.elements.length).toBeGreaterThanOrEqual(3);
    for (const el of doc.elements) {
      expect(el.method).toBe('dxf_entity');
      expect(el.needsReview).toBe(true);
      expect(el.evidenceText.length).toBeGreaterThan(0);
      expect(el.sourceFileName).toBe('planta-sintetica.dxf');
      expect(el.region).toMatch(/^layer:/);
      expect(el.confidence).toBeGreaterThan(0.9);
    }
  });

  it('vincula las inserciones de bloque como instancias del elemento Z-01', () => {
    const z01 = doc.elements.find((el) => el.elementKey === 'Z-01');
    expect(z01?.elementType).toBe('footing');
    expect(z01?.instances?.length).toBe(3);
    expect(z01?.instances?.every((i) => i.blockName === 'ZAPATA_TIPO_1')).toBe(true);
  });

  it('detecta la discrepancia crítica: 3 zapatas dibujadas vs 4 listadas en el cuadro', () => {
    const disc = doc.discrepancies?.find((d) => d.elementKey === 'Z-01');
    expect(disc).toBeDefined();
    expect(disc?.kind).toBe('graphic_vs_text_count');
    expect(disc?.severity).toBe('critical');
    expect(disc?.found).toBe('3');
    expect(disc?.expected).toBe('4');
    expect(disc?.needsReview).toBe(true);
  });

  it('separa conteo gráfico y conteo textual como entidades con evidencia propia', () => {
    const gc = doc.graphicCounts?.find((g) => g.elementKey === 'Z-01');
    const tc = doc.textCounts?.find((t) => t.elementKey === 'Z-01');
    expect(gc?.count).toBe(3);
    expect(gc?.basis).toContain('INSERT block');
    expect(tc?.count).toBe(4);
    expect(tc?.evidenceText).toContain('CANT: 4');
  });
});

describe('F8 spike — schema steel-ext-2', () => {
  it('el JSON Schema exige evidencia en elementos, conteos y discrepancias', () => {
    const schema = STEEL_EXT2_JSON_SCHEMA as unknown as {
      required: string[];
      properties: Record<string, { items?: { required?: string[] } }>;
    };
    expect(schema.required).toEqual(['schemaVersion', 'sourceDocuments', 'elements']);
    for (const section of ['elements', 'graphicCounts', 'textCounts', 'discrepancies']) {
      const required = schema.properties[section]?.items?.required ?? [];
      expect(required).toContain('evidenceText');
      expect(required).toContain('needsReview');
      expect(required).toContain('sourceFileName');
      expect(required).toContain('pageNumber');
      expect(required).toContain('method');
      expect(required).toContain('confidence');
    }
  });

  it('el validador de invariantes rechaza documentos auto-aprobados', () => {
    const bad = dxfToSteelExt2(DXF, 'planta-sintetica.dxf');
    const el = bad.elements[0];
    if (el) el.needsReview = false;
    const issues = validateSteelExt2Invariants(bad);
    expect(issues.some((i) => i.includes('needsReview'))).toBe(true);
  });
});
