/**
 * fetch-public-page.ts — Fetch seguro de páginas públicas (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Límites: timeout 10s, máx 512KB, content-type HTML/JSON.
 * Redirecciones: máx 5 saltos, redirect: 'manual', validación SSRF completa
 * (incluyendo DNS) en cada salto antes de hacer el fetch. Loop detection vía Set.
 * PageFetcher y DnsLookup son inyectables para tests.
 */
import { FetchPublicPageError, UrlValidationError } from './types';
import type { DnsLookup, FetchedPage, PageFetcher } from './types';
import { validatePublicUrl } from './validate-url';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/json',
  'application/ld+json',
];

async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const { resolve4, resolve6 } = await import('dns/promises');
  const v4 = await resolve4(hostname).catch(() => [] as string[]);
  if (v4.length > 0) return v4;
  const v6 = await resolve6(hostname).catch(() => [] as string[]);
  return v6;
}

async function realFetcher(startUrl: string, dnsLookup: DnsLookup): Promise<FetchedPage> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const visited = new Set<string>();
  let currentUrl = startUrl;
  let redirectCount = 0;

  try {
    for (;;) {
      // Validate SSRF before every hop (defense in depth — includes DNS check)
      try {
        await validatePublicUrl(currentUrl, dnsLookup);
      } catch (err) {
        if (err instanceof UrlValidationError) {
          throw new FetchPublicPageError(
            'redirect_to_private',
            `URL no permitida en salto ${redirectCount}: ${err.message}`,
          );
        }
        throw err;
      }

      // Loop detection: abort if this URL was already fetched this request
      if (visited.has(currentUrl)) {
        throw new FetchPublicPageError('redirect_loop', 'Se detectó un bucle de redirección.');
      }
      visited.add(currentUrl);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
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
      }

      // Manual redirect handling
      if (response.status >= 300 && response.status < 400) {
        if (redirectCount >= MAX_REDIRECTS) {
          throw new FetchPublicPageError(
            'too_many_redirects',
            `Se superó el límite de ${MAX_REDIRECTS} redirecciones.`,
          );
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new FetchPublicPageError(
            'redirect_missing_location',
            'Respuesta de redirección sin encabezado Location.',
          );
        }

        // Resolve relative redirects against the current URL
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          throw new FetchPublicPageError('redirect_invalid_url', 'URL de redirección inválida.');
        }

        redirectCount++;
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        throw new FetchPublicPageError('http_error', `La URL devolvió HTTP ${response.status}.`);
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
      return { text, contentType: ct, finalUrl: currentUrl };
    }
  } finally {
    clearTimeout(tid);
  }
}

export async function fetchPublicPage(
  url: string,
  fetcher?: PageFetcher,
  dnsLookup: DnsLookup = defaultDnsLookup,
): Promise<FetchedPage> {
  if (fetcher) return fetcher(url);
  return realFetcher(url, dnsLookup);
}
