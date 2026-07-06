/**
 * dxf-engine.test.ts — F8A: parser DXF + extractor estructural layer-resilient
 * + CAD Drawing Quality Report + evidencia `dxf` (tests 1–14, 19–20 del
 * mandato). Fixtures 100% SINTÉTICOS generados por código — jamás planos
 * reales de la usuaria.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDxfFile, DXF_NOT_ASCII_MESSAGE } from '@/lib/steel/dxf/dxf-parser';
import {
  assessLayers,
  extractDxfStructure,
} from '@/lib/steel/dxf/dxf-structural-extractor';
import { buildCadQualityReport } from '@/lib/steel/dxf/dxf-quality-report';
import {
  detectDxfNotationCandidates,
  dxfCandidatesToManualLines,
  dxfElementToEvidence,
} from '@/lib/steel/dxf/dxf-to-steel-evidence';

// ---------------------------------------------------------------------------
// Constructores de DXF sintético
// ---------------------------------------------------------------------------

function text(value: string, layer: string, x: number, y: number, extra: string[] = []): string {
  return ['0', 'TEXT', '5', 'A1', '8', layer, '10', String(x), '20', String(y), '40', '2.5', ...extra, '1', value].join('\n');
}

function mtext(value: string, layer: string, x: number, y: number): string {
  return ['0', 'MTEXT', '8', layer, '10', String(x), '20', String(y), '1', value].join('\n');
}

function insert(blockName: string, layer: string, x: number, y: number): string {
  return ['0', 'INSERT', '5', 'B1', '8', layer, '2', blockName, '10', String(x), '20', String(y), '50', '0'].join('\n');
}

function dimension(measurement: number, layer: string): string {
  return ['0', 'DIMENSION', '8', layer, '42', String(measurement), '1', '<>'].join('\n');
}

function wrapDxf(entityChunks: string[]): string {
  return [
    // HEADER y BLOCKS presentes para probar que solo ENTITIES cuenta.
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1027', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS',
    '0', 'BLOCK', '8', '0', '2', 'ZAPATA_TIPO_1',
    '0', 'TEXT', '8', '0', '10', '0', '20', '0', '1', 'TEXTO DENTRO DE BLOQUE (no cuenta)',
    '0', 'ENDBLK',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    ...entityChunks,
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');
}

/** Plano con capas limpias, bloques y cuadro (mejor caso). */
function cleanLayeredDxf(): string {
  return wrapDxf([
    text('VC-2 (50x60)', 'CIM-VIGAS-TEXTO', 40, 52),
    mtext('VIGA DE CIMENTACION VC-2\\P4#5 L=6.00\\PE#3@15', 'CIM-VIGAS-TEXTO', 40, 48),
    text('PILOTE %%C60 P-03', 'PILOTES-TEXTO', 27, -18),
    insert('ZAPATA_TIPO_1', 'ZAPATAS', 0, 0),
    insert('ZAPATA_TIPO_1', 'ZAPATAS', 50, 0),
    insert('ZAPATA_TIPO_1', 'ZAPATAS', 100, 0),
    text('Z-01', 'ZAPATAS-TEXTO', 2, 3),
    text('CUADRO DE ZAPATAS', 'TABLAS', 200, 100),
    text('Z-01 | 1.20x1.20 | CANT: 4', 'TABLAS', 200, 95),
    dimension(220, 'COTAS'),
    text('ING. RESPONSABLE: N.N.', 'ROTULO', 300, -50),
    text('CALLE 10 # 5-20', 'ROTULO', 300, -55),
  ]);
}

/** Mismo contenido pero TODO en Layer 0 (CAD desordenado típico). */
function layerZeroDxf(withInserts: boolean): string {
  const chunks = [
    text('VC-2 (50x60)', '0', 40, 52),
    mtext('VIGA DE CIMENTACION VC-2\\P4#5 L=6.00\\PE#3@15', '0', 40, 48),
    text('PILOTE %%C60 P-03', '0', 27, -18),
    text('Z-01', '0', 2, 3),
    text('Z-01', '0', 52, 3),
    text('Z-01', '0', 102, 3),
    text('Z-01 | 1.20x1.20 | CANT: 4', '0', 200, 95),
    text('ING. RESPONSABLE: N.N.', '0', 300, -50),
  ];
  if (withInserts) {
    chunks.push(
      insert('ZAPATA_TIPO_1', '0', 0, 0),
      insert('ZAPATA_TIPO_1', '0', 50, 0),
      insert('ZAPATA_TIPO_1', '0', 100, 0),
    );
  }
  return wrapDxf(chunks);
}

function analyze(dxf: string) {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error(`fixture inválido: ${parse.message}`);
  const extraction = extractDxfStructure(parse);
  return { parse, extraction, quality: buildCadQualityReport(parse, extraction) };
}

// ---------------------------------------------------------------------------
// 1–3: parser de entidades
// ---------------------------------------------------------------------------

describe('F8A parser DXF', () => {
  const { parse } = analyze(cleanLayeredDxf());

  it('1. parsea TEXT con layer, handle y coordenadas', () => {
    const vc = parse.entities.find((e) => e.type === 'TEXT' && e.rawText.includes('VC-2'));
    expect(vc?.type).toBe('TEXT');
    if (vc?.type === 'TEXT') {
      expect(vc.layer).toBe('CIM-VIGAS-TEXTO');
      expect(vc.handle).toBe('A1');
      expect(vc.x).toBe(40);
      expect(vc.y).toBe(52);
      expect(vc.normalizedText).toContain('VC-2');
    }
  });

  it('2. parsea MTEXT con saltos \\P y lo desdobla en líneas', () => {
    const mt = parse.entities.find((e) => e.type === 'MTEXT');
    expect(mt?.type).toBe('MTEXT');
    if (mt?.type === 'MTEXT') {
      expect(mt.rawText).toContain('VC-2');
      expect(mt.rawText).toContain('\n4#5 L=6.00');
      expect(mt.rawText).toContain('E#3@15');
    }
  });

  it('3. parsea INSERT con blockName, layer y coordenadas', () => {
    const inserts = parse.entities.filter((e) => e.type === 'INSERT');
    expect(inserts.length).toBe(3);
    const first = inserts[0];
    if (first?.type === 'INSERT') {
      expect(first.blockName).toBe('ZAPATA_TIPO_1');
      expect(first.layer).toBe('ZAPATAS');
      expect(typeof first.x).toBe('number');
    }
  });

  it('decodifica %%C como Ø y detecta cotas DIMENSION', () => {
    const pilote = parse.entities.find((e) => e.type === 'TEXT' && e.rawText.includes('P-03'));
    if (pilote?.type === 'TEXT') expect(pilote.rawText).toContain('Ø60');
    expect(parse.stats.dimensionCount).toBe(1);
  });

  it('el texto dentro de definiciones BLOCKS no cuenta como entidad dibujada', () => {
    expect(parse.entities.some((e) => e.type === 'TEXT' && e.rawText.includes('DENTRO DE BLOQUE'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4–7: detección estructural
// ---------------------------------------------------------------------------

describe('F8A detección estructural', () => {
  const { extraction } = analyze(cleanLayeredDxf());

  it('4. detecta VC-2 con sección 50x60 y tipo beam', () => {
    const vc = extraction.elements.find((el) => el.elementKey === 'VC-2');
    expect(vc?.sectionSpec).toBe('50x60');
    expect(vc?.elementType).toBe('beam');
    expect(vc?.sourceLayer).toBe('CIM-VIGAS-TEXTO');
    expect(vc?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('5. detecta PILOTE Ø60 (P-03) con diámetro', () => {
    const pilote = extraction.elements.find((el) => el.elementKey === 'P-03');
    expect(pilote?.elementType).toBe('pile');
    expect(pilote?.diameter).toBe('Ø60');
  });

  it('6. detecta Z-01 como footing', () => {
    const z = extraction.elements.find((el) => el.elementKey === 'Z-01');
    expect(z?.elementType).toBe('footing');
    expect(z?.coordinates).toBeDefined();
  });

  it('7. no crea elementos desde ING./CALLE/rotulado (por capa Y por texto)', () => {
    expect(extraction.noiseDiscarded).toBeGreaterThanOrEqual(2);
    for (const el of extraction.elements) {
      expect(el.sourceText).not.toMatch(/ING\.|CALLE|CARRERA/);
    }
  });

  it('7b. una frase descriptiva no se vuelve elemento ("EN 8 PISOS" ≠ EN-8)', () => {
    const { extraction: prose } = analyze(
      wrapDxf([
        text('MULTIFAMILIAR EN 8 PISOS Y 1 SEMISOTANO', 'COR', 0, 0),
        text('VC-2 (50x60)', 'VIGAS', 10, 10),
      ]),
    );
    expect(prose.elements.some((el) => el.elementKey === 'EN-8')).toBe(false);
    expect(prose.elements.some((el) => el.elementKey === 'VC-2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8–9: calidad por capas
// ---------------------------------------------------------------------------

describe('F8A CAD Drawing Quality Report', () => {
  it('8. reporta calidad degradada cuando TODO está en Layer 0', () => {
    const { parse, extraction, quality } = analyze(layerZeroDxf(true));
    expect(assessLayers(parse).usefulLayers).toBe(false);
    expect(quality.usefulLayers).toBe(false);
    expect(quality.suspiciousLayers).toContain('0');
    expect(quality.dominantLayerPct).toBe(100);
    expect(quality.confidence).toBe('medio'); // hay bloques, no capas
    expect(quality.recommendation).toBe('usable_con_revision');
    // Los elementos siguen saliendo, con confianza menor y advertencia.
    const vc = extraction.elements.find((el) => el.elementKey === 'VC-2');
    expect(vc?.confidence).toBeLessThan(0.8);
    expect(vc?.warnings.some((w) => w.includes('Capa genérica'))).toBe(true);
  });

  it('9. reporta calidad alta con capas estructurales útiles y bloques contables', () => {
    const { quality } = analyze(cleanLayeredDxf());
    expect(quality.usefulLayers).toBe(true);
    expect(quality.usefulTexts).toBe(true);
    expect(quality.countableBlocks).toBe(true);
    expect(quality.measurementsDetected).toBe(true);
    expect(quality.tablesDetected).toBe(true);
    expect(quality.confidence).toBe('alto');
    expect(quality.recommendation).toBe('usable');
  });

  it('sin textos técnicos ⇒ no confiable, cero elementos inventados', () => {
    const { extraction, quality } = analyze(
      wrapDxf([
        text('ING. RESPONSABLE: N.N.', '0', 0, 0),
        text('ESCALA 1:50', '0', 0, -5),
      ]),
    );
    expect(extraction.elements.length).toBe(0);
    expect(quality.recommendation).toBe('no_confiable');
    expect(quality.notes.some((n) => n.includes('No se detectaron textos'))).toBe(true);
  });

  it('solo textos sin bloques y sin capas ⇒ baja calidad CAD (pero opera)', () => {
    const { extraction, quality } = analyze(layerZeroDxf(false));
    expect(quality.confidence).toBe('bajo');
    expect(quality.recommendation).toBe('baja_calidad_cad');
    expect(extraction.elements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 10–12: conteos
// ---------------------------------------------------------------------------

describe('F8A conteo de bloques e inserts', () => {
  it('10. cuenta inserts de zapata y los asocia a Z-01', () => {
    const { extraction } = analyze(cleanLayeredDxf());
    const block = extraction.blockCounts.find((b) => b.blockName === 'ZAPATA_TIPO_1');
    expect(block?.count).toBe(3);
    expect(block?.elementKey).toBe('Z-01');
  });

  it('11. count_mismatch entre inserts (3) y CANT (4)', () => {
    const { extraction } = analyze(cleanLayeredDxf());
    const finding = extraction.findings.find((f) => f.kind === 'count_mismatch');
    expect(finding?.elementKey).toBe('Z-01');
    expect(finding?.graphicCount).toBe(3);
    expect(finding?.listedCount).toBe(4);
    expect(finding?.severity).toBe('critical');
    expect(finding?.message).toContain('Diferencia: 1');
    expect(finding?.message).toContain('Requiere revisión');
  });

  it('sin bloques, cuenta por repetición de textos con base declarada', () => {
    const { extraction } = analyze(layerZeroDxf(false));
    const finding = extraction.findings.find((f) => f.elementKey === 'Z-01');
    // 3 textos "Z-01" dibujados + el del cuadro ⇒ 4 vs 4 listadas… la línea
    // del cuadro también menciona Z-01: el conteo por texto es honesto pero
    // impreciso — por eso su base lo declara y la confianza es baja.
    expect(finding).toBeDefined();
    expect(finding?.graphicBasis ?? finding?.message).toContain('repetici');
  });

  it('12. graphic_count_unverified si no hay inserts útiles ni repeticiones', () => {
    const { extraction } = analyze(
      wrapDxf([
        text('Z-01 | 1.20x1.20 | CANT: 4', '0', 200, 95),
      ]),
    );
    const finding = extraction.findings.find((f) => f.kind === 'graphic_count_unverified');
    expect(finding?.elementKey).toBe('Z-01');
    expect(finding?.message).toContain('No hay bloques/entidades suficientes');
  });
});

// ---------------------------------------------------------------------------
// 13: DXF no soportado
// ---------------------------------------------------------------------------

describe('F8A DXF no soportado', () => {
  it('13. binario/no legible devuelve error amable, sin crash', () => {
    for (const content of ['AutoCAD Binary DXF ', ' ', '', 'esto no es un dxf']) {
      const result = parseDxfFile(content);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(20);
    }
    const binary = parseDxfFile('AutoCAD Binary DXF ');
    if (!binary.ok) expect(binary.message).toBe(DXF_NOT_ASCII_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// 14 + G: evidencia
// ---------------------------------------------------------------------------

describe('F8A evidencia DXF', () => {
  const { parse, extraction } = analyze(cleanLayeredDxf());

  it('14. la evidencia incluye layer, entityType, coordinates y método dxf', () => {
    const vc = extraction.elements.find((el) => el.elementKey === 'VC-2');
    const evidence = dxfElementToEvidence(vc!, 'plano-sintetico.dxf');
    expect(evidence.method).toBe('dxf');
    expect(evidence.sourceType).toBe('dxf');
    expect(evidence.sourceFileName).toBe('plano-sintetico.dxf');
    expect(evidence.layer).toBe('CIM-VIGAS-TEXTO');
    expect(evidence.entityType).toBe('TEXT');
    expect(evidence.coordinates).toEqual({ x: 40, y: 52 });
    expect(evidence.originalFragment).toContain('VC-2');
    expect(evidence.observation).toContain('Capa: CIM-VIGAS-TEXTO');
  });

  it('los candidatos de notación aprobados llegan al takeoff con evidencia dxf (Excel F4A.2)', () => {
    const detection = detectDxfNotationCandidates(parse, 'plano-sintetico.dxf');
    // El MTEXT trae "4#5 L=6.00" y "E#3@15": el detector F6A debe verlos.
    expect(detection.candidates.length).toBeGreaterThan(0);
    const approvable = detection.candidates.filter((c) => c.f1Ready);
    expect(approvable.length).toBeGreaterThan(0);

    const approved = {
      ...detection,
      candidates: detection.candidates.map((c) => (c.f1Ready ? { ...c, status: 'approved' as const } : c)),
    };
    const lines = dxfCandidatesToManualLines(approved, 'plano-sintetico.dxf');
    expect(lines.length).toBe(approvable.length);
    for (const line of lines) {
      expect(line.evidence?.readingMethod).toBe('dxf');
      expect(line.evidence?.sourceType).toBe('dxf');
      expect(line.evidence?.sourceFileName).toBe('plano-sintetico.dxf');
      expect(line.evidence?.observation).toContain('Capa:');
      expect(line.evidence?.observation).toContain('Entidad:');
      expect(line.evidence?.originalFragment?.length).toBeGreaterThan(0);
    }
  });

  it('nada se aprueba automáticamente: sin aprobar, cero líneas', () => {
    const detection = detectDxfNotationCandidates(parse, 'plano-sintetico.dxf');
    expect(dxfCandidatesToManualLines(detection, 'plano-sintetico.dxf')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 19–20: guardas estáticas (sin red/DB/env; sin cálculo kg/costo)
// ---------------------------------------------------------------------------

describe('F8A guardas estáticas', () => {
  const dxfDir = path.join(process.cwd(), 'lib', 'steel', 'dxf');
  const moduleSources = [
    'dxf-entities.ts',
    'dxf-parser.ts',
    'dxf-structural-extractor.ts',
    'dxf-quality-report.ts',
    'dxf-to-steel-evidence.ts',
    'dxf-pdf-comparison.ts',
  ].map((file) => ({ file, source: readFileSync(path.join(dxfDir, file), 'utf8') }));

  it('19. los módulos DXF no tocan red, DB, Supabase, storage ni env', () => {
    for (const { file, source } of moduleSources) {
      expect(source, file).not.toMatch(/fetch\(|XMLHttpRequest|axios|supabase|createClient|process\.env|localStorage|drizzle|postgres/i);
    }
  });

  it('20. F8A no calcula kg/costos (F1 única calculadora)', () => {
    for (const { file, source } of moduleSources) {
      expect(source, file).not.toMatch(/calculateSteelLine|kgPerMeter|KG_POR_METRO|unitCost|costo\s*=|precio/i);
    }
  });
});
