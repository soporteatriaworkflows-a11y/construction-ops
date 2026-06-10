/**
 * large-page.test.ts — PUBLIC SOURCE COMPATIBILITY FIX V1 (T37–T43).
 * Propiedad: agent-pricing.
 *
 * Páginas comerciales legítimas >512KB se procesan; el hard cap de 3MB se
 * mantiene; streaming, redirects, SSRF, timeout y content-type intactos.
 * Sin red real: fetch mockeado vía vi.stubGlobal; DNS inyectado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPublicPage } from '@/server/pricing/validation/fetch-public-page';
import type { DnsLookup } from '@/server/pricing/validation/types';

const publicDns: DnsLookup = async () => ['93.184.216.34'];

function makeHtmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/** HTML con JSON-LD válido al inicio + relleno hasta el tamaño deseado. */
function bigHtml(totalBytes: number): string {
  const head =
    '<html><head><script type="application/ld+json">' +
    '{"@type":"Product","name":"P","offers":{"@type":"Offer","price":1000,"priceCurrency":"COP"}}' +
    '</script></head><body>';
  const tail = '</body></html>';
  const padLen = Math.max(0, totalBytes - head.length - tail.length);
  return head + 'x'.repeat(padLen) + tail;
}

describe('fetchPublicPage — páginas grandes (T37–T43)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T37 — página >512KB y dentro del hard cap se procesa (con warning de página pesada)', async () => {
    const body = bigHtml(1_300_000); // ~1.26MB como la URL real de Decorcerámica
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeHtmlResponse(body)));

    const page = await fetchPublicPage('https://shop.example.com/p', undefined, publicDns);
    expect(page.text.length).toBeGreaterThan(512 * 1024);
    expect(page.warnings?.some((w) => w.includes('512KB'))).toBe(true);
  });

  it('T38 — página > hard cap (3MB) se rechaza con error claro', async () => {
    const body = bigHtml(3 * 1024 * 1024 + 100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeHtmlResponse(body)));

    await expect(
      fetchPublicPage('https://shop.example.com/p', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('T38b — el mensaje de rechazo menciona el límite de 3MB (no 512KB)', async () => {
    const body = bigHtml(3 * 1024 * 1024 + 100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeHtmlResponse(body)));
    await expect(
      fetchPublicPage('https://shop.example.com/p', undefined, publicDns),
    ).rejects.toThrow(/3MB/);
  });

  it('T39 — streaming conserva límites: la sonda corta el stream con evidencia suficiente', async () => {
    // Body como stream por chunks de 64KB para ejercitar la lectura incremental.
    const body = bigHtml(2_000_000);
    const encoder = new TextEncoder();
    const CHUNK = 64 * 1024;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < body.length; i += CHUNK) {
          controller.enqueue(encoder.encode(body.slice(i, i + CHUNK)));
        }
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    );

    const probe = (text: string, _url: string) => text.includes('"priceCurrency":"COP"');
    const page = await fetchPublicPage('https://shop.example.com/p', undefined, publicDns, probe);

    expect(page.truncated).toBe(true);
    expect(page.warnings?.some((w) => w.toLowerCase().includes('truncado'))).toBe(true);
    // Se cortó: el texto es menor que el body completo pero conserva la evidencia.
    expect(page.text.length).toBeLessThan(body.length);
    expect(probe(page.text, page.finalUrl)).toBe(true);
  });

  it('T39b — sin sonda, una página normal (<512KB) no genera warnings ni truncado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeHtmlResponse('<p>peque</p>')));
    const page = await fetchPublicPage('https://shop.example.com/p', undefined, publicDns);
    expect(page.truncated).toBe(false);
    expect(page.warnings).toEqual([]);
  });

  it('T40 — redirects seguros intactos: 301 → página grande procesada', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://final.example.com/p' } }))
      .mockResolvedValueOnce(makeHtmlResponse(bigHtml(700_000)));
    vi.stubGlobal('fetch', mock);

    const page = await fetchPublicPage('https://shop.example.com/p', undefined, publicDns);
    expect(page.finalUrl).toBe('https://final.example.com/p');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('T41 — SSRF intacto: redirect a IP privada se rechaza antes del fetch', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/meta' } }));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/p', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
    expect(mock).toHaveBeenCalledTimes(1); // jamás se hace fetch a la IP privada
  });

  it('T42 — timeout intacto: AbortError ⇒ error timeout sanitizado', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));

    await expect(
      fetchPublicPage('https://shop.example.com/p', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('T43 — content-type guard intacto: image/png se rechaza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('binario', { status: 200, headers: { 'content-type': 'image/png' } }),
      ),
    );

    await expect(
      fetchPublicPage('https://shop.example.com/p', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'invalid_content_type' });
  });
});
