/**
 * redirect.test.ts — Tests de seguridad de redirecciones HTTP (Fase 3B fix).
 * Propiedad: agent-pricing.
 *
 * Valida que fetchPublicPage valide SSRF en cada salto de redirección:
 * redirect: 'manual', máx 5 saltos, loop detection, Location inválido, etc.
 *
 * Sin red real: global.fetch mockeado vía vi.stubGlobal. DNS inyectado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPublicPage } from '@/server/pricing/validation/fetch-public-page';
import { FetchPublicPageError } from '@/server/pricing/validation/types';
import type { DnsLookup } from '@/server/pricing/validation/types';

// DNS mocks
const publicDns: DnsLookup = async () => ['93.184.216.34'];
const dnsPrivateForEvil: DnsLookup = async (host: string) => {
  if (host === 'evil-redirect.example.com') return ['192.168.1.1'];
  return ['93.184.216.34'];
};

function makeRedirectResponse(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

function makeRedirectNoLocation(status: number): Response {
  return new Response(null, { status });
}

function makeHtmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

describe('fetchPublicPage — redirect security (Fase 3B fix)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // R01: single 301 to valid public URL → success
  it('R01 — sigue 301 a URL pública válida y devuelve finalUrl correcto', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'https://final.example.com/product'))
      .mockResolvedValueOnce(makeHtmlResponse('<h1>Product</h1>'));
    vi.stubGlobal('fetch', mock);

    const result = await fetchPublicPage('https://shop.example.com/item', undefined, publicDns);
    expect(result.finalUrl).toBe('https://final.example.com/product');
    expect(result.text).toContain('Product');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  // R02: single 302 to valid public URL → success
  it('R02 — sigue 302 a URL pública válida', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(302, 'https://dest.example.com/page'))
      .mockResolvedValueOnce(makeHtmlResponse('<p>Dest</p>'));
    vi.stubGlobal('fetch', mock);

    const result = await fetchPublicPage('https://origin.example.com/', undefined, publicDns);
    expect(result.finalUrl).toBe('https://dest.example.com/page');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  // R03: exactly 5 hops (max allowed) → success
  it('R03 — cadena de exactamente 5 redirecciones válidas (al límite) → éxito', async () => {
    const mock = vi.fn();
    for (let i = 1; i <= 5; i++) {
      mock.mockResolvedValueOnce(makeRedirectResponse(301, `https://h${i}.example.com/`));
    }
    mock.mockResolvedValueOnce(makeHtmlResponse('<p>Final</p>'));
    vi.stubGlobal('fetch', mock);

    const result = await fetchPublicPage('https://h0.example.com/', undefined, publicDns);
    expect(result.text).toContain('Final');
    expect(result.finalUrl).toBe('https://h5.example.com/');
    expect(mock).toHaveBeenCalledTimes(6);
  });

  // R04: 6 hops → too_many_redirects
  it('R04 — 6 redirecciones superan el límite → too_many_redirects', async () => {
    const mock = vi.fn();
    for (let i = 1; i <= 6; i++) {
      mock.mockResolvedValueOnce(makeRedirectResponse(301, `https://h${i}.example.com/`));
    }
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://h0.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'too_many_redirects' });
  });

  // R05: redirect to direct private IP → redirect_to_private
  it('R05 — redirect a IP privada directa (192.168.x.x) → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'http://192.168.1.50/data'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/item', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });

  // R06: redirect to host that DNS resolves to private IP → redirect_to_private
  it('R06 — redirect a host cuyo DNS resuelve a IP privada → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'https://evil-redirect.example.com/'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/item', undefined, dnsPrivateForEvil),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });

  // R07: redirect loop (URL redirects to itself) → redirect_loop
  it('R07 — bucle de redirección (URL redirige a sí misma) → redirect_loop', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'https://shop.example.com/item'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/item', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_loop' });
  });

  // R08: redirect with no Location header → redirect_missing_location
  it('R08 — 301 sin encabezado Location → redirect_missing_location', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectNoLocation(301));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_missing_location' });
  });

  // R09: relative redirect resolved correctly → success
  it('R09 — redirect relativo (/new-path) se resuelve correctamente → éxito', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, '/new-path'))
      .mockResolvedValueOnce(makeHtmlResponse('<p>New Page</p>'));
    vi.stubGlobal('fetch', mock);

    const result = await fetchPublicPage('https://shop.example.com/item', undefined, publicDns);
    expect(result.finalUrl).toBe('https://shop.example.com/new-path');
    expect(result.text).toContain('New Page');
  });

  // R10: redirect to localhost → redirect_to_private
  it('R10 — redirect a http://localhost/api → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(302, 'http://localhost/api/secret'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });

  // R11: redirect to metadata endpoint → redirect_to_private
  it('R11 — redirect a http://169.254.169.254/ (metadata) → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'http://169.254.169.254/latest/meta-data/'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });

  // R12: no redirect at all (direct 200) → normal success
  it('R12 — sin redirección (200 directo) → éxito normal', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeHtmlResponse('<h1>Direct Product</h1>'));
    vi.stubGlobal('fetch', mock);

    const result = await fetchPublicPage('https://shop.example.com/product', undefined, publicDns);
    expect(result.text).toContain('Direct Product');
    expect(result.finalUrl).toBe('https://shop.example.com/product');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  // R13: redirect with invalid IPv6 host in Location → redirect_invalid_url
  // WHATWG URL parser throws on invalid IPv6 literals (e.g. [gggg::1])
  it('R13 — redirect con IPv6 inválido en Location → redirect_invalid_url', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'http://[gggg::1]/page'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_invalid_url' });
  });

  // R14: redirect with credentials in URL → redirect_to_private
  it('R14 — redirect con credenciales en URL → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'https://user:pass@target.example.com/'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });

  // R15: redirect to ftp:// → redirect_to_private (invalid scheme)
  it('R15 — redirect a ftp:// (esquema no permitido) → redirect_to_private', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(makeRedirectResponse(301, 'ftp://files.example.com/prices.csv'));
    vi.stubGlobal('fetch', mock);

    await expect(
      fetchPublicPage('https://shop.example.com/', undefined, publicDns),
    ).rejects.toMatchObject({ code: 'redirect_to_private' });
  });
});
