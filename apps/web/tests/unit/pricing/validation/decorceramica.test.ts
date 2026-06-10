/**
 * decorceramica.test.ts — Adapter Decorcerámica V1 (T44–T50).
 * Propiedad: agent-pricing.
 *
 * Fixture HTML SANITIZADO local (tests/fixtures/decorceramica-product.html).
 * Sin red externa en tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  extractDecorceramica,
  matchesDecorceramica,
  runAdapters,
} from '@/server/pricing/validation/adapters';
import { normalizeExtraction } from '@/server/pricing/validation/normalize';
import { computeConfidence } from '@/server/pricing/validation/confidence';
import { validatePublicPriceUrl } from '@/server/pricing/validation/index';
import type { AuthenticatedViewer } from '@/server/pricing/types';
import type { FetchedPage } from '@/server/pricing/validation/types';

const FIXTURE = readFileSync(
  join(__dirname, '..', '..', '..', 'fixtures', 'decorceramica-product.html'),
  'utf8',
);

const VIEWER: AuthenticatedViewer = {
  userId: 'u-1',
  profileId: 'p-1',
  organizationId: 'org-A',
  role: 'management',
};

describe('Adapter Decorcerámica (T44–T50)', () => {
  it('aísla por hostname: solo decorceramica.com y subdominios', () => {
    expect(matchesDecorceramica('www.decorceramica.com')).toBe(true);
    expect(matchesDecorceramica('decorceramica.com')).toBe(true);
    expect(matchesDecorceramica('evil-decorceramica.com')).toBe(false);
    expect(matchesDecorceramica('decorceramica.com.evil.com')).toBe(false);
    expect(matchesDecorceramica('homecenter.com.co')).toBe(false);
  });

  it('T44 — el fixture extrae el título', () => {
    const data = extractDecorceramica(FIXTURE);
    expect(data.title).toBe('Dolce Vita Sei 20x20 Negro');
  });

  it('T45 — el fixture extrae la referencia KP04NG1620 (mpn)', () => {
    const data = extractDecorceramica(FIXTURE);
    expect(data.externalReference).toBe('KP04NG1620');
  });

  it('T46 — el fixture extrae el código comercial 6751 (meta product:sku)', () => {
    const data = extractDecorceramica(FIXTURE);
    expect(data.sku).toBe('6751');
  });

  it('T47 — el fixture extrae el precio 169000 COP (AggregateOffer)', () => {
    const data = extractDecorceramica(FIXTURE);
    expect(data.rawPrice).toBe('169000');
    expect(data.currency).toBe('COP');
  });

  it('T47b — el genérico JSON-LD NO extraía AggregateOffer (justificación del adapter)', () => {
    // Sin hostname el registro no aplica el adapter dedicado; el merge genérico
    // cae a meta tags (precio plano), no al AggregateOffer anidado.
    const generic = runAdapters(FIXTURE);
    expect(generic.extractionMethod).not.toBe('json-ld');
  });

  it('T48 — múltiples precios distintos generan warning explícito y proponen el menor', () => {
    const variant = FIXTURE.replace(
      '"lowPrice":169000,"highPrice":169000',
      '"lowPrice":149000,"highPrice":169000',
    );
    const data = extractDecorceramica(variant);
    expect(data.rawPrice).toBe('149000'); // propone el menor…
    expect(data.warnings?.length).toBeGreaterThan(0); // …pero nunca en silencio
    expect(data.warnings![0]).toContain('149000');
    expect(data.warnings![0]).toContain('169000');
    expect(data.warnings![0]).toMatch(/verifica/i);
  });

  it('T49 — la unidad NUNCA se inventa (unit = null) y genera warning en la propuesta', () => {
    const data = extractDecorceramica(FIXTURE);
    expect(data.unit).toBeNull();

    const merged = runAdapters(FIXTURE, 'www.decorceramica.com');
    const proposal = normalizeExtraction(
      merged,
      'https://www.decorceramica.com/dolce-vita-sei-20x20-negro/p',
      new Date().toISOString(),
      computeConfidence(merged),
    );
    expect(proposal.unit).toBeNull();
    expect(proposal.warnings.some((w) => w.toLowerCase().includes('unidad'))).toBe(true);
  });

  it('T50 — la propuesta del servicio sigue siendo revisión humana (nunca persiste sola)', async () => {
    const fetcher = async (): Promise<FetchedPage> => ({
      text: FIXTURE,
      contentType: 'text/html',
      finalUrl: 'https://www.decorceramica.com/dolce-vita-sei-20x20-negro/p',
      warnings: ['Página pesada (>512KB): se procesó con límites extendidos. Revisa la propuesta con cuidado.'],
      truncated: false,
    });

    const proposal = await validatePublicPriceUrl(
      VIEWER,
      'resource-1',
      { url: 'https://www.decorceramica.com/dolce-vita-sei-20x20-negro/p' },
      { fetcher, dnsLookup: async () => ['93.184.216.34'] },
    );

    // Es una PROPUESTA: no tiene estado approved; la confirmación humana
    // separada crea la observación SIEMPRE pending (Phase 3A repo).
    expect(proposal.sourceType).toBe('public_web');
    expect(proposal.observedPrice).toBe('169000');
    expect(proposal.currency).toBe('COP');
    expect(proposal.externalReference).toBe('KP04NG1620');
    expect(proposal.externalSku).toBe('6751');
    expect(proposal.extractionMethod).toBe('json-ld');
    expect(proposal.confidence).toBe('high');
    // Warnings del fetch (página pesada) llegan a la propuesta:
    expect(proposal.warnings.some((w: string) => w.includes('512KB'))).toBe(true);
    expect((proposal as unknown as Record<string, unknown>).status).toBeUndefined();
  });

  it('tolerancia: HTML sin precio ⇒ extracción vacía (sin inventar)', () => {
    const noPrice = FIXTURE
      .replace(/"offers":\{[\s\S]*?"offerCount":1\}/, '"offers":{}')
      .replace(/<meta[^>]*product:price:amount[^>]*\/>/, '');
    const data = extractDecorceramica(noPrice);
    expect(data.rawPrice).toBeUndefined();
    expect(data.extractionMethod).toBe('none');
  });
});
