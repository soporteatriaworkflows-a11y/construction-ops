/**
 * fetch-public-page.ts — Fetch seguro de páginas públicas (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Límites: timeout 10s, máx 512KB, content-type HTML/JSON.
 * PageFetcher es inyectable para tests.
 */
import { FetchPublicPageError } from './types';
import type { FetchedPage, PageFetcher } from './types';
import { isFinalUrlSafe } from './validate-url';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/json',
  'application/ld+json',
];

async function realFetcher(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'ConstructionOps-PriceValidation/1.0',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new FetchPublicPageError('timeout', 'La solicitud tardó demasiado (timeout).');
    }
    throw new FetchPublicPageError('fetch_failed', 'No se pudo acceder a la URL.');
  } finally {
    clearTimeout(tid);
  }

  if (!response.ok) {
    throw new FetchPublicPageError('http_error', `La URL devolvió HTTP ${response.status}.`);
  }

  const finalUrl = response.url || url;
  if (!isFinalUrlSafe(finalUrl)) {
    throw new FetchPublicPageError('redirect_to_private', 'La URL redirigió a un destino no permitido.');
  }

  const rawCt = response.headers.get('content-type') ?? '';
  const ct = (rawCt.split(';')[0] ?? '').trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.some((a) => ct.startsWith(a))) {
    throw new FetchPublicPageError('invalid_content_type', 'El tipo de contenido no es HTML o JSON.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new FetchPublicPageError('empty_body', 'La respuesta no tiene contenido.');

  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchPublicPageError('response_too_large', 'La respuesta supera el límite de 512KB.');
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  return { text, contentType: ct, finalUrl };
}

export async function fetchPublicPage(
  url: string,
  fetcher: PageFetcher = realFetcher,
): Promise<FetchedPage> {
  return fetcher(url);
}
