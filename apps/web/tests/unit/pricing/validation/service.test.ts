/**
 * service.test.ts — Tests de integración mock del servicio (Fase 3B, tests 31–38).
 * Sin DB real. Mocks inyectados via deps.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validatePublicPriceUrl,
  confirmPublicPriceObservation,
} from '@/server/pricing/validation/index';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type {
  AuthenticatedViewer,
  ResourcePriceObservationView,
  PriceObservationRepository,
} from '@/server/pricing/types';
import type { PageFetcher, FetchedPage } from '@/server/pricing/validation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewer(role = 'internal'): AuthenticatedViewer {
  return {
    userId: 'user-1',
    profileId: 'profile-1',
    organizationId: 'org-1',
    role: role as AuthenticatedViewer['role'],
  };
}

const noopDns = async (_: string) => ['93.184.216.34'];

const FIXTURE_HTML_JSONLD = `
<html><head>
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"Product",
  "name":"Cemento Gris 50kg",
  "sku":"CEM-001",
  "offers":{"@type":"Offer","price":"29900","priceCurrency":"COP"}
}
</script>
</head><body></body></html>`;

function makeFetcher(html: string, finalUrl?: string): PageFetcher {
  return async (url: string): Promise<FetchedPage> => ({
    text: html,
    contentType: 'text/html',
    finalUrl: finalUrl ?? url,
  });
}

function makePendingObs(over: Partial<ResourcePriceObservationView> = {}): ResourcePriceObservationView {
  return {
    id: 'obs-new-1',
    resourceId: 'resource-1',
    supplierId: null,
    supplierName: null,
    observedPrice: '29900',
    discountPercent: '0',
    suggestedNetPrice: '29900',
    unit: 'BUL',
    currency: 'COP',
    sourceType: 'public_web',
    sourceReference: 'https://example.com/product/1',
    observedAt: '2026-06-09T10:00:00.000Z',
    validUntil: null,
    status: 'pending',
    isStale: false,
    notes: null,
    createdAt: '2026-06-09T10:00:00.000Z',
    approvedAt: null,
    rejectionReason: null,
    ...over,
  };
}

function makeMockRepo(overrides: Partial<PriceObservationRepository> = {}): PriceObservationRepository {
  return {
    source: 'fixture',
    listResourcePriceObservations: vi.fn().mockResolvedValue([]),
    createResourcePriceObservation: vi.fn().mockResolvedValue(makePendingObs()),
    approveResourcePriceObservation: vi.fn().mockResolvedValue(makePendingObs()),
    rejectResourcePriceObservation: vi.fn().mockResolvedValue(makePendingObs()),
    getResourcePriceIntelligenceSummary: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validatePublicPriceUrl
// ---------------------------------------------------------------------------

describe('validatePublicPriceUrl', () => {
  const deps = { dnsLookup: noopDns, fetcher: makeFetcher(FIXTURE_HTML_JSONLD) };

  // T31: devuelve propuesta válida
  it('T31 — devuelve propuesta con precio, moneda y confianza', async () => {
    const proposal = await validatePublicPriceUrl(
      makeViewer(), 'resource-1', { url: 'https://example.com/product/1' }, deps,
    );
    expect(proposal.observedPrice).toBe('29900');
    expect(proposal.currency).toBe('COP');
    expect(proposal.confidence).toBe('high');
    expect(proposal.sourceType).toBe('public_web');
  });

  // T32: nunca aprueba — propuesta no tiene status
  it('T32 — la propuesta no tiene campo status (no aprueba automáticamente)', async () => {
    const proposal = await validatePublicPriceUrl(
      makeViewer(), 'resource-1', { url: 'https://example.com/product/1' }, deps,
    );
    expect('status' in proposal).toBe(false);
  });

  // T33: no modifica BOQ (solo devuelve propuesta; no llama repos)
  it('T33 — solo devuelve propuesta sin efectos secundarios en BOQ', async () => {
    const proposal = await validatePublicPriceUrl(
      makeViewer(), 'resource-1', { url: 'https://example.com/product/1' }, deps,
    );
    expect(proposal).toBeDefined();
    expect(proposal.sourceType).toBe('public_web');
  });

  // T36: organizationId no expuesto en propuesta
  it('T36 — organizationId no está en la propuesta (es server-side)', async () => {
    const proposal = await validatePublicPriceUrl(
      makeViewer('management'), 'resource-1',
      { url: 'https://example.com/product/1' }, deps,
    );
    expect('organizationId' in proposal).toBe(false);
  });

  // T37: rol no autorizado → InsufficientRoleError
  it('T37 — lanza InsufficientRoleError para rol consulta', async () => {
    await expect(
      validatePublicPriceUrl(
        makeViewer('consulta'), 'resource-1',
        { url: 'https://example.com/product/1' }, deps,
      ),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });

  // Extra: SKU extraído
  it('extrae externalSku del JSON-LD', async () => {
    const proposal = await validatePublicPriceUrl(
      makeViewer(), 'resource-1', { url: 'https://example.com/product/1' }, deps,
    );
    expect(proposal.externalSku).toBe('CEM-001');
  });
});

// ---------------------------------------------------------------------------
// confirmPublicPriceObservation
// ---------------------------------------------------------------------------

describe('confirmPublicPriceObservation', () => {
  const BASE_PROPOSAL = {
    sourceUrl: 'https://example.com/product/1',
    title: 'Cemento Gris 50kg',
    externalReference: null,
    externalSku: 'CEM-001',
    observedPrice: '29900',
    currency: 'COP',
    unit: 'BUL',
    extractedAt: '2026-06-09T10:00:00.000Z',
    extractionMethod: 'json-ld' as const,
    confidence: 'high' as const,
    warnings: [],
    sourceType: 'public_web' as const,
  };

  // T31b: confirmación crea observación pending
  it('T31b — crea observación con status pending', async () => {
    const repo = makeMockRepo();
    const obs = await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(obs.status).toBe('pending');
    expect(obs.sourceType).toBe('public_web');
  });

  // T32b: nunca approved automáticamente
  it('T32b — observación creada no tiene status approved', async () => {
    const repo = makeMockRepo();
    const obs = await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(obs.status).not.toBe('approved');
  });

  // T33b: no modifica BOQ — solo llama createResourcePriceObservation
  it('T33b — solo llama createResourcePriceObservation (no approve, no BOQ)', async () => {
    const repo = makeMockRepo();
    await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(repo.createResourcePriceObservation).toHaveBeenCalledOnce();
    expect(repo.approveResourcePriceObservation).not.toHaveBeenCalled();
  });

  // T34: no modifica AIU — confirma que ningún método de revisión fue llamado
  it('T34 — no invoca approve ni reject (no modifica AIU ni aprueba automáticamente)', async () => {
    const repo = makeMockRepo();
    await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(repo.approveResourcePriceObservation).not.toHaveBeenCalled();
    expect(repo.rejectResourcePriceObservation).not.toHaveBeenCalled();
  });

  // T35: organizationId server-side — pasa resourceId correcto
  it('T35 — pasa resourceId correcto al repositorio', async () => {
    const repo = makeMockRepo();
    await confirmPublicPriceObservation(makeViewer(), 'resource-target-X', BASE_PROPOSAL, 'BUL', repo);
    expect(repo.createResourcePriceObservation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.objectContaining({ resourceId: 'resource-target-X' }),
    );
  });

  // T38: fixture seguro — discountPercent = '0'
  it('T38 — crea observación con discountPercent "0" (precio público sin descuento)', async () => {
    const repo = makeMockRepo();
    await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(repo.createResourcePriceObservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ discountPercent: '0', sourceType: 'public_web' }),
    );
  });

  // Extra: sourceReference = sourceUrl
  it('sourceReference es la URL de origen', async () => {
    const repo = makeMockRepo();
    await confirmPublicPriceObservation(makeViewer(), 'resource-1', BASE_PROPOSAL, 'BUL', repo);
    expect(repo.createResourcePriceObservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceReference: 'https://example.com/product/1' }),
    );
  });

  // Extra: rol no autorizado
  it('lanza InsufficientRoleError para rol consulta', async () => {
    const repo = makeMockRepo();
    await expect(
      confirmPublicPriceObservation(makeViewer('consulta'), 'resource-1', BASE_PROPOSAL, 'BUL', repo),
    ).rejects.toBeInstanceOf(InsufficientRoleError);
  });
});
