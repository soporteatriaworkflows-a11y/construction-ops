/**
 * pdf-text-extract-client.ts — Borde BROWSER de la extracción F6B/F7A.
 *
 * Única pieza que toca pdfjs-dist (Apache-2.0, docs/LICENSING.md). Import
 * dinámico: la librería solo se descarga cuando el usuario lee un PDF. El
 * archivo vive en memoria del navegador — no se sube, no se persiste, no hay
 * DB/Supabase/storage. Solo se extrae la CAPA DE TEXTO seleccionable: nada de
 * geometría, imágenes, OCR ni interpretación visual (contrato F6B).
 *
 * F7A: además del texto por líneas (vista F6), se CONSERVAN los items
 * posicionados (`spatialItems`: bbox, rotación, tamaño de fuente) en una
 * estructura paralela — la posición es contexto/evidencia, jamás medida.
 */
import {
  buildPageLines,
  MAX_PDF_PAGES,
  shapeExtractedPage,
  type ExtractedPdfPage,
  type PdfTextItemLike,
} from './pdf-text-extract';
import type { SpatialTextItemInput } from './drawing-spatial-model';

/** Página extraída F6B + items posicionados F7A (estructura paralela). */
export interface ExtractedPdfPageWithLayout extends ExtractedPdfPage {
  spatialItems: SpatialTextItemInput[];
}

export interface PdfExtractionResult {
  pageCount: number;
  /** Páginas procesadas (hasta MAX_PDF_PAGES). */
  pages: ExtractedPdfPageWithLayout[];
  truncated: boolean;
}

export async function extractPdfTextInBrowser(data: ArrayBuffer): Promise<PdfExtractionResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  // pdfjs TRANSFIERE el buffer a su worker (queda "detached"): se le pasa una
  // copia para que el ArrayBuffer del caller siga usable (p. ej. OCR F6C).
  const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    const limit = Math.min(pageCount, MAX_PDF_PAGES);
    const pages: ExtractedPdfPageWithLayout[] = [];

    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItemLike[] = [];
      const spatialItems: SpatialTextItemInput[] = [];
      for (const raw of content.items) {
        const item = raw as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
        if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
        const transform = item.transform as number[];
        const x = Number(transform[4] ?? 0);
        const y = Number(transform[5] ?? 0);
        items.push({ str: item.str, x, y });
        if (item.str.trim().length === 0) continue;
        // F7A: el transform completo trae escala y rotación del texto.
        // fontSize ≈ |columna Y| del transform; rotación desde la columna X.
        const scaleX = Number(transform[0] ?? 0);
        const skewY = Number(transform[1] ?? 0);
        const fontSize = Math.hypot(Number(transform[2] ?? 0), Number(transform[3] ?? 0));
        const rotationRad = Math.atan2(skewY, scaleX);
        const rotationDeg = Math.round((rotationRad * 180) / Math.PI);
        spatialItems.push({
          str: item.str,
          x,
          y,
          width: typeof item.width === 'number' ? item.width : undefined,
          height: typeof item.height === 'number' ? item.height : fontSize || undefined,
          fontSize: fontSize > 0 ? fontSize : undefined,
          rotation: rotationDeg !== 0 ? rotationDeg : undefined,
        });
      }
      // Señal F6C: cuánta geometría dibuja la página (texto SHX convertido a
      // curvas produce muchas rutas y poco texto nativo).
      let drawingOpCount = 0;
      try {
        const opList = await page.getOperatorList();
        drawingOpCount = opList.fnArray.filter((fn: number) => fn === pdfjs.OPS.constructPath).length;
      } catch {
        // Sin señal de dibujo: la cobertura se clasifica solo por texto.
      }
      pages.push({ ...shapeExtractedPage(pageNumber, buildPageLines(items)), drawingOpCount, spatialItems });
      page.cleanup();
    }

    return { pageCount, pages, truncated: pageCount > limit };
  } finally {
    await loadingTask.destroy();
  }
}
