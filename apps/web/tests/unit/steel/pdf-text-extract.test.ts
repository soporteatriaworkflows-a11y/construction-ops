/**
 * pdf-text-extract.test.ts — F6B: extracción de texto seleccionable de PDF.
 *
 * Todo en Node, sin pdfjs ni DOM: la lógica pura (validación, líneas, escala,
 * clasificación) más la integración con el detector F6A por páginas. El caso
 * prioritario "PDF técnico/vectorial de AutoCAD" está cubierto explícito:
 * texto seleccionable sí, geometría/escala como medición jamás.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPageLines,
  classifyPdfExtraction,
  detectScaleNotes,
  isAcceptablePdfFile,
  joinPagesForClipboard,
  MAX_PDF_BYTES,
  PDF_NO_TEXT_MESSAGE,
  shapeExtractedPage,
} from '@/lib/steel/pdf-text-extract';
import { detectPdfIntakeCandidatesFromPages } from '@/lib/steel/pdf-intake-candidates';

describe('validacion de archivo (F6B)', () => {
  it('rechaza archivos que no son PDF', () => {
    expect(isAcceptablePdfFile({ name: 'plano.docx', type: 'application/msword', size: 1000 }).ok).toBe(false);
    expect(isAcceptablePdfFile({ name: 'foto.png', type: 'image/png', size: 1000 }).ok).toBe(false);
  });

  it('acepta PDF por mime o por extension y rechaza vacios/gigantes', () => {
    expect(isAcceptablePdfFile({ name: 'plano.pdf', type: 'application/pdf', size: 5000 }).ok).toBe(true);
    expect(isAcceptablePdfFile({ name: 'PLANO.PDF', type: '', size: 5000 }).ok).toBe(true);
    expect(isAcceptablePdfFile({ name: 'plano.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
    expect(isAcceptablePdfFile({ name: 'plano.pdf', type: 'application/pdf', size: MAX_PDF_BYTES + 1 }).ok).toBe(false);
  });
});

describe('reconstruccion de lineas desde items posicionados', () => {
  it('agrupa por Y con tolerancia y ordena arriba->abajo, izquierda->derecha', () => {
    const text = buildPageLines([
      { str: '5#5600', x: 120, y: 700.8 },
      { str: 'VC-01', x: 40, y: 701.5 }, // misma linea visual que 5#5600
      { str: '74E#3200', x: 90, y: 650 },
      { str: 'PILOTE P-03', x: 20, y: 650 },
    ]);
    expect(text).toBe('VC-01 5#5600\nPILOTE P-03 74E#3200');
  });

  it('ignora items vacios y devuelve cadena vacia sin items', () => {
    expect(buildPageLines([])).toBe('');
    expect(buildPageLines([{ str: '   ', x: 0, y: 0 }])).toBe('');
  });
});

describe('escala anotada — SOLO contexto (caso AutoCAD)', () => {
  it('detecta ESC 1:50 / ESCALA 1:75 / 1:100 y deduplica', () => {
    expect(detectScaleNotes('PLANTA CIMENTACION ESC 1:50')).toEqual(['1:50']);
    expect(detectScaleNotes('DETALLE VIGA — ESCALA 1:75 y corte 1:75')).toEqual(['1:75']);
    expect(detectScaleNotes('VER LAMINA E-02 1:100')).toEqual(['1:100']);
    expect(detectScaleNotes('reunion 15:30 en obra')).toEqual([]);
  });

  it('la escala anotada JAMAS produce candidatos ni longitudes', () => {
    const candidates = detectPdfIntakeCandidatesFromPages(
      [{ pageNumber: 1, text: 'PLANTA ESTRUCTURAL ESC 1:50' }],
      { fileName: 'plano-autocad.pdf' },
    );
    expect(candidates).toEqual([]);
  });

  it('en una pagina real la escala queda como contexto y los despieces como candidatos', () => {
    const page = shapeExtractedPage(2, 'ESC 1:50\nVC-01 5#5600');
    expect(page.scaleNotes).toEqual(['1:50']);
    const candidates = detectPdfIntakeCandidatesFromPages([page], { fileName: 'plano.pdf' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.evidence.originalText).toBe('5#5600');
  });
});

describe('clasificacion global (PDF vectorial sin capa de texto => honesto)', () => {
  it('paginas sin texto (AutoCAD vectorial puro) => no_text con mensaje que ofrece OCR futuro/manual', () => {
    const pages = [shapeExtractedPage(1, ''), shapeExtractedPage(2, '  ')];
    const summary = classifyPdfExtraction(pages);
    expect(summary.status).toBe('no_text');
    expect(summary.pagesWithText).toBe(0);
    expect(PDF_NO_TEXT_MESSAGE).toContain('no contiene texto seleccionable suficiente');
    expect(PDF_NO_TEXT_MESSAGE).toContain('OCR');
    expect(PDF_NO_TEXT_MESSAGE).toContain('revisión manual');
  });

  it('texto suficiente => extracted', () => {
    const summary = classifyPdfExtraction([shapeExtractedPage(1, 'VC-01 5#5600 y estribos 74E#3200')]);
    expect(summary.status).toBe('extracted');
    expect(summary.pagesWithText).toBe(1);
  });
});

describe('integracion F6B -> detector F6A por paginas', () => {
  const pages = [
    shapeExtractedPage(1, 'VC-01 5#5600'),
    shapeExtractedPage(3, 'Estribos 74E#3200 y refuerzo #4 L=0.62'),
  ];
  const candidates = detectPdfIntakeCandidatesFromPages(pages, { fileName: 'despiece-torre-a.pdf' });

  it('los candidatos conservan pageNumber real y fileName en la evidencia', () => {
    expect(candidates.map((c) => c.evidence.pageNumber)).toEqual([1, 3, 3]);
    expect(candidates.every((c) => c.evidence.fileName === 'despiece-torre-a.pdf')).toBe(true);
    expect(candidates[0]!.evidence.originalText).toBe('5#5600');
    expect(candidates[0]!.elementLabel).toBe('VC-01');
  });

  it('ids unicos entre paginas', () => {
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
  });

  it('F6B no calcula: los candidatos no traen ml/kg/costos', () => {
    for (const candidate of candidates as unknown as Record<string, unknown>[]) {
      for (const forbidden of ['totalMl', 'totalKg', 'estimatedCost', 'calculated']) {
        expect(candidate).not.toHaveProperty(forbidden);
      }
    }
  });

  it('joinPagesForClipboard arma el texto con separadores por pagina', () => {
    const joined = joinPagesForClipboard(pages);
    expect(joined).toContain('— Página 1 —');
    expect(joined).toContain('— Página 3 —');
    expect(joined).toContain('VC-01 5#5600');
  });
});

describe('aislamiento F6B (analisis estatico)', () => {
  const libDir = path.join(process.cwd(), 'lib', 'steel');
  const pure = readFileSync(path.join(libDir, 'pdf-text-extract.ts'), 'utf8');
  const client = readFileSync(path.join(libDir, 'pdf-text-extract-client.ts'), 'utf8');
  const section = readFileSync(
    path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components', 'manual-pdf-intake-section.tsx'),
    'utf8',
  );

  it('no hay Supabase/DB/storage/subida en los modulos F6B (codigo, no comentarios)', () => {
    for (const source of [pure, client, section]) {
      const codeLines = source
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
      for (const line of codeLines) {
        expect(line).not.toMatch(/supabase|@\/server\/|FormData|fetch\s*\(/i);
      }
    }
  });

  it('pdfjs-dist solo entra por import dinamico en el borde cliente', () => {
    expect(client).toContain("await import('pdfjs-dist')");
    expect(pure).not.toMatch(/from ['"]pdfjs|import\(['"]pdfjs/);
    expect(section).not.toMatch(/from ['"]pdfjs-dist/);
  });

  it('la UI conserva el copy obligatorio F6B y el fallback manual', () => {
    expect(section).toContain('Lectura asistida preliminar. No reemplaza revision tecnica.');
    expect(section).toContain('No se aprueban cantidades automaticamente');
    expect(section).toContain('Solo se extrae texto seleccionable del PDF.');
    expect(section).toContain('no interpreta geometria, escala ni cotas visuales en esta fase');
    expect(section).toContain('O pega texto manualmente');
    expect(section).toContain('Detectar candidatos del plan set');
    expect(section).toContain('no se usa para calcular');
    expect(section).toContain('No se inventan cantidades desde lineas dibujadas.');
  });

  it('la UI expone el plan set: fuentes, clasificacion por pagina y evidencia por elemento', () => {
    expect(section).toContain('Fuentes del takeoff');
    expect(section).toContain('PLAN_SOURCE_TYPES');
    expect(section).toContain('summarizeElementEvidence');
    expect(section).toContain('Evidencia por elemento');
    expect(section).toContain('NO une planos automaticamente');
  });
});
