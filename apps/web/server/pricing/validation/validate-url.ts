/**
 * validate-url.ts — Validación de URL pública con SSRF protection (Fase 3B).
 * Propiedad: agent-pricing.
 *
 * Rechaza: no-http/https, credenciales, localhost, IPs privadas, metadata endpoints.
 * DnsLookup es inyectable para tests.
 */
import { UrlValidationError } from './types';
import type { DnsLookup } from './types';

const PRIVATE_IP_V4 = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
];

const PRIVATE_IP_V6 = [
  /^::1$/,
  /^fc[0-9a-f][0-9a-f]:/i,
  /^fe[89ab][0-9a-f]:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
  'metadata',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localdomain'];

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    PRIVATE_IP_V4.some((r) => r.test(ip)) ||
    PRIVATE_IP_V6.some((r) => r.test(lower))
  );
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  return false;
}

async function defaultDnsLookup(hostname: string): Promise<string[]> {
  // Lazy import to avoid issues in edge/test environments
  const { resolve4, resolve6 } = await import('dns/promises');
  const v4 = await resolve4(hostname).catch(() => [] as string[]);
  if (v4.length > 0) return v4;
  const v6 = await resolve6(hostname).catch(() => [] as string[]);
  return v6;
}

export async function validatePublicUrl(
  rawUrl: string,
  dnsLookup: DnsLookup = defaultDnsLookup,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new UrlValidationError('invalid_url', 'La URL proporcionada no es válida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlValidationError('invalid_scheme', 'Solo se aceptan URLs http o https.');
  }

  if (parsed.username || parsed.password) {
    throw new UrlValidationError('credentials_in_url', 'La URL no puede contener credenciales.');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (isBlockedHost(hostname)) {
    throw new UrlValidationError('blocked_host', 'URL no permitida (host bloqueado).');
  }

  // If hostname looks like a raw IP, check immediately without DNS.
  // URL normalizes IPv6 hosts with brackets; strip them for IP checks.
  const bareHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (/^[\d.]+$/.test(bareHost) || bareHost.includes(':')) {
    if (isPrivateIp(bareHost)) {
      throw new UrlValidationError('private_ip', 'URL no permitida (IP privada).');
    }
    return parsed;
  }

  // DNS resolution — check all resolved addresses
  let addresses: string[];
  try {
    addresses = await dnsLookup(hostname);
  } catch {
    throw new UrlValidationError('dns_failed', 'No se pudo resolver el dominio.');
  }

  if (addresses.length === 0) {
    throw new UrlValidationError('dns_no_results', 'No se pudo resolver el dominio.');
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new UrlValidationError('private_ip', 'URL no permitida (IP privada).');
    }
  }

  return parsed;
}

/** Comprueba si una URL final (post-redirect) tiene host bloqueado o IP privada. */
export function isFinalUrlSafe(finalUrl: string): boolean {
  try {
    const u = new URL(finalUrl);
    const host = u.hostname.toLowerCase();
    if (isBlockedHost(host)) return false;
    const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if ((/^[\d.]+$/.test(bare) || bare.includes(':')) && isPrivateIp(bare)) return false;
    return true;
  } catch {
    return false;
  }
}
