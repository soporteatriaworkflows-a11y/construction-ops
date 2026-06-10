/**
 * validate-url.test.ts — Tests SSRF de validación de URL (Fase 3B, tests 1–11).
 * Sin llamadas de red reales; DNS inyectado como mock.
 */
import { describe, it, expect } from 'vitest';
import { validatePublicUrl } from '@/server/pricing/validation/validate-url';
import { UrlValidationError } from '@/server/pricing/validation/types';

const publicDns = async (_host: string) => ['93.184.216.34'];  // IP pública
const privateDns = async (_host: string) => ['192.168.1.1'];
const emptyDns = async (_host: string): Promise<string[]> => [];

describe('validatePublicUrl — SSRF protection', () => {
  // T1: rechaza localhost
  it('T1 — rechaza localhost', async () => {
    await expect(validatePublicUrl('http://localhost/test', publicDns))
      .rejects.toMatchObject({ code: 'blocked_host' });
  });

  // T2: rechaza 127.0.0.1
  it('T2 — rechaza 127.0.0.1', async () => {
    await expect(validatePublicUrl('http://127.0.0.1/test', publicDns))
      .rejects.toMatchObject({ code: 'private_ip' });
  });

  // T3: rechaza ::1 (IPv6 loopback)
  it('T3 — rechaza [::1] IPv6 loopback', async () => {
    await expect(validatePublicUrl('http://[::1]/test', publicDns))
      .rejects.toMatchObject({ code: 'private_ip' });
  });

  // T4: rechaza IP privada directa
  it('T4 — rechaza IP privada 192.168.x.x en URL', async () => {
    await expect(validatePublicUrl('http://192.168.1.100/product', publicDns))
      .rejects.toMatchObject({ code: 'private_ip' });
  });

  // T5: rechaza metadata endpoint
  it('T5 — rechaza 169.254.169.254 (metadata endpoint)', async () => {
    await expect(validatePublicUrl('http://169.254.169.254/latest/meta-data/', publicDns))
      .rejects.toMatchObject({ code: 'blocked_host' });
  });

  // T6: rechaza URL con credenciales embebidas
  it('T6 — rechaza URL con usuario:clave', async () => {
    await expect(validatePublicUrl('https://user:pass@example.com/product', publicDns))
      .rejects.toMatchObject({ code: 'credentials_in_url' });
  });

  // T7: rechaza host que DNS resuelve a IP privada (redirect via DNS)
  it('T7 — rechaza host que resuelve a IP privada', async () => {
    await expect(validatePublicUrl('https://evil.example.com/product', privateDns))
      .rejects.toMatchObject({ code: 'private_ip' });
  });

  // T8: límite DNS — rechaza cuando DNS no resuelve
  it('T8 — rechaza cuando DNS no retorna resultados', async () => {
    await expect(validatePublicUrl('https://nonexistent.invalid/product', emptyDns))
      .rejects.toMatchObject({ code: 'dns_no_results' });
  });

  // T9: acepta URL pública válida
  it('T9 — acepta URL https pública válida', async () => {
    const result = await validatePublicUrl(
      'https://www.homecenter.com.co/product/12345',
      publicDns,
    );
    expect(result).toBeInstanceOf(URL);
    expect(result.protocol).toBe('https:');
  });

  // T10: rechaza esquema ftp
  it('T10 — rechaza esquema ftp://', async () => {
    await expect(validatePublicUrl('ftp://files.example.com/price.csv', publicDns))
      .rejects.toMatchObject({ code: 'invalid_scheme' });
  });

  // T11: rechaza URL malformada
  it('T11 — rechaza URL malformada', async () => {
    await expect(validatePublicUrl('not-a-url-at-all', publicDns))
      .rejects.toMatchObject({ code: 'invalid_url' });
  });

  // Extra: rechaza esquema data:
  it('rechaza esquema data:', async () => {
    await expect(validatePublicUrl('data:text/html,<h1>Hi</h1>', publicDns))
      .rejects.toBeInstanceOf(UrlValidationError);
  });

  // Extra: rechaza IP 10.x.x.x
  it('rechaza IP privada 10.x.x.x', async () => {
    await expect(validatePublicUrl('http://10.0.0.1/api', publicDns))
      .rejects.toMatchObject({ code: 'private_ip' });
  });

  // Extra: rechaza metadata.google.internal
  it('rechaza metadata.google.internal', async () => {
    await expect(validatePublicUrl('http://metadata.google.internal/', publicDns))
      .rejects.toMatchObject({ code: 'blocked_host' });
  });
});
