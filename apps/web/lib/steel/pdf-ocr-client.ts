/**
 * pdf-ocr-client.ts — Borde BROWSER del OCR asistido (F6C).
 *
 * Renderiza UNA página del PDF a canvas con pdfjs-dist y la lee con
 * tesseract.js (Apache-2.0, docs/LICENSING.md), todo en el navegador:
 * la imagen jamás se sube ni persiste. Nota: en el primer uso tesseract
 * descarga su motor WASM y el modelo de idioma desde el CDN de jsDelivr
 * (assets estáticos; ningún dato del usuario viaja). El OCR es POR PÁGINA
 * elegida por el usuario — nunca masivo automático.
 */
import { buildPageLines, type PdfTextItemLike } from './pdf-text-extract';

export interface OcrPageResult {
  /** Texto OCR reconstruido por líneas. */
  text: string;
  /** Miniatura de la página renderizada (data URL, solo memoria). */
  previewDataUrl: string;
  durationMs: number;
}

const OCR_RENDER_SCALE = 2; // ~144 dpi: balance legibilidad/tiempo
const PREVIEW_MAX_WIDTH = 480;

export async function ocrPdfPageInBrowser(
  data: ArrayBuffer,
  pageNumber: number,
  onStatus?: (status: string) => void,
): Promise<OcrPageResult> {
  const started = Date.now();
  onStatus?.('Renderizando pagina…');

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  // Copia defensiva: pdfjs transfiere el buffer al worker y lo deja detached.
  const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
  let canvas: HTMLCanvasElement;
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d no disponible');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }

  const previewDataUrl = buildPreview(canvas);

  onStatus?.('Leyendo con OCR (puede tardar)…');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('spa');
  try {
    // Texto disperso (planos): mejor segmentación que el modo por bloques.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const result = await worker.recognize(canvas);
    const items: PdfTextItemLike[] = [];
    const lines = (result.data as { lines?: { text: string; bbox: { x0: number; y0: number } }[] }).lines ?? [];
    for (const line of lines) {
      const text = line.text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      // Y invertida: tesseract mide desde arriba; buildPageLines espera "arriba = mayor".
      items.push({ str: text, x: line.bbox.x0, y: canvas.height - line.bbox.y0 });
    }
    const text = items.length > 0 ? buildPageLines(items, 6) : result.data.text.trim();
    return { text, previewDataUrl, durationMs: Date.now() - started };
  } finally {
    await worker.terminate();
  }
}

function buildPreview(canvas: HTMLCanvasElement): string {
  if (canvas.width <= PREVIEW_MAX_WIDTH) return canvas.toDataURL('image/png');
  const scale = PREVIEW_MAX_WIDTH / canvas.width;
  const preview = document.createElement('canvas');
  preview.width = PREVIEW_MAX_WIDTH;
  preview.height = Math.ceil(canvas.height * scale);
  const context = preview.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');
  context.drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/png');
}
