/**
 * pdf-text-extract-client.ts — Borde BROWSER de la extracción F6B.
 *
 * Única pieza que toca pdfjs-dist (Apache-2.0, docs/LICENSING.md). Import
 * dinámico: la librería solo se descarga cuando el usuario lee un PDF. El
 * archivo vive en memoria del navegador — no se sube, no se persiste, no hay
 * DB/Supabase/storage. Solo se extrae la CAPA DE TEXTO seleccionable: nada de
 * geometría, imágenes, OCR ni interpretación visual (contrato F6B).
 */
import {
  buildPageLines,
  MAX_PDF_PAGES,
  shapeExtractedPage,
  type ExtractedPdfPage,
  type PdfTextItemLike,
} from './pdf-text-extract';

export interface PdfExtractionResult {
  pageCount: number;
  /** Páginas procesadas (hasta MAX_PDF_PAGES). */
  pages: ExtractedPdfPage[];
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
    const pages: ExtractedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItemLike[] = [];
      for (const raw of content.items) {
        const item = raw as { str?: unknown; transform?: unknown };
        if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
        const transform = item.transform as number[];
        items.push({ str: item.str, x: Number(transform[4] ?? 0), y: Number(transform[5] ?? 0) });
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
      pages.push({ ...shapeExtractedPage(pageNumber, buildPageLines(items)), drawingOpCount });
      page.cleanup();
    }

    return { pageCount, pages, truncated: pageCount > limit };
  } finally {
    await loadingTask.destroy();
  }
}
