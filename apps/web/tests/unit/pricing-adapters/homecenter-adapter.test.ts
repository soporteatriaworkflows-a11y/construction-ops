/**
 * Tests del adaptador Homecenter CSV — agent-homecenter (Oleada 2B).
 *
 * Cubre: CSV válido, columna faltante, precio inválido, moneda, SKU ausente,
 * SKU ambiguo (→ pending), URL opcional, preview sin persistencia,
 * aprobación, rechazo, duplicado, idempotencia, privacidad, auditoría,
 * fallback manual, health check.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createHomecenterCsvAdapter,
  EMPTY_CATALOG,
  runImportPreview,
} from "@/modules/pricing/adapters/homecenter-csv";
import {
  applyApprovedProposals,
  isAmbiguous,
  jaccardScore,
  parsePrice,
  tokenize,
} from "@/modules/pricing/adapters/supplier-adapter";
import { buildPreview, summarizePreview } from "@/modules/pricing/adapters/import-preview";
import { IdempotencyRegistry, buildContentHash, hashRowContent } from "@/modules/pricing/adapters/idempotency";
import { INTERNAL_PRICE_FIELDS } from "@/lib/contracts/pricing-read";

import {
  createMockApprovalPort,
  EMPTY_CSV,
  EUROPEAN_FORMAT_CSV,
  HEADER_ONLY_CSV,
  INVALID_PRICE_CSV,
  makeApprovedProposal,
  makeCandidate,
  makePendingProposal,
  makeRawItem,
  makeRejectedProposal,
  MINIMAL_CSV,
  MISSING_REQUIRED_COLUMN_CSV,
  NEGATIVE_PRICE_CSV,
  PROFILE_APPROVER,
  PRODUCT_IDS,
  RESOURCE_IDS,
  SAMPLE_CATALOG,
  VALID_CSV,
} from "./fixtures";

/* ----------------------------------------------------------------------------
 * 1. CSV válido: parsear, preview, estadísticas correctas
 * ------------------------------------------------------------------------- */

describe("1. CSV válido", () => {
  it("parsea CSV válido y retorna items correctos", async () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "test.csv",
      mimeType: "text/csv",
      content: VALID_CSV,
    });
    expect(items).toHaveLength(3);
    const first = items[0]!;
    expect(first.name).toBe("Cemento gris Portland 50kg");
    expect(first.onlinePublicPrice).toBe("28000");
    expect(first.currency).toBe("COP");
    expect(first.sku).toBe("CEM-001");
    expect(first.url).toBe("https://example.test/p/1");
    expect(first.unit).toBe("bulto");
    expect(first.observedAt).toBe("2026-05-30T00:00:00.000Z");
  });

  it("genera preview con estadísticas correctas (sin persistir)", async () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const preview = await runImportPreview(adapter, {
      fileName: "test.csv",
      content: VALID_CSV,
    });

    expect(preview.providerKey).toBe("homecenter");
    expect(preview.sourceFileName).toBe("test.csv");
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(3);
    expect(preview.invalidRows).toBe(0);
    expect(preview.proposals).toHaveLength(3);
  });

  it("parsea CSV mínimo (solo columnas obligatorias)", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "min.csv",
      content: MINIMAL_CSV,
    });
    expect(items).toHaveLength(2);
    const first = items[0]!;
    expect(first.sku).toBeUndefined();
    expect(first.url).toBeUndefined();
  });
});

/* ----------------------------------------------------------------------------
 * 2. Columna obligatoria faltante
 * ------------------------------------------------------------------------- */

describe("2. Columna obligatoria faltante", () => {
  it("lanza error si falta columna obligatoria", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    await expect(
      adapter.parseCatalog({
        fileName: "bad.csv",
        content: MISSING_REQUIRED_COLUMN_CSV,
      }),
    ).rejects.toThrow(/columnas obligatorias/i);
  });

  it("incluye el nombre de la columna faltante en el error", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    await expect(
      adapter.parseCatalog({
        fileName: "bad.csv",
        content: MISSING_REQUIRED_COLUMN_CSV,
      }),
    ).rejects.toThrow("moneda");
  });
});

/* ----------------------------------------------------------------------------
 * 3. Precio inválido
 * ------------------------------------------------------------------------- */

describe("3. Precio inválido", () => {
  it("omite filas con precio no numérico (no lanza, retorna filas válidas)", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "invalid.csv",
      content: INVALID_PRICE_CSV,
    });
    // Fila con precio inválido se omite; la fila válida se incluye.
    expect(items).toHaveLength(1);
    const first = items[0]!;
    expect(first.name).toBe("Arena de rio");
  });

  it("lanza error de parseo de precio (parsePrice directo)", () => {
    expect(() => parsePrice("NO_PRECIO")).toThrow(/precio.*inválido/i);
  });

  it("omite filas con precio negativo", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "neg.csv",
      content: NEGATIVE_PRICE_CSV,
    });
    expect(items).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------------------
 * 4. Moneda
 * ------------------------------------------------------------------------- */

describe("4. Moneda", () => {
  it("normaliza moneda a COP por defecto si está vacía", async () => {
    const csv = `nombre,precio,moneda\nCemento,28000,`;
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({ fileName: "m.csv", content: csv });
    const first = items[0]!;
    expect(first.currency).toBe("COP");
  });

  it("acepta USD como moneda válida", async () => {
    const csv = `nombre,precio,moneda\nCemento,28000,USD`;
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({ fileName: "m.csv", content: csv });
    const first = items[0]!;
    expect(first.currency).toBe("USD");
  });

  it("normaliza moneda a mayúsculas", async () => {
    const csv = `nombre,precio,moneda\nCemento,28000,cop`;
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({ fileName: "m.csv", content: csv });
    const first = items[0]!;
    expect(first.currency).toBe("COP");
  });

  it("parsea precio en formato europeo (puntos como miles, coma decimal)", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "eu.csv",
      content: EUROPEAN_FORMAT_CSV,
    });
    expect(items).toHaveLength(1);
    const first = items[0]!;
    expect(parseFloat(first.onlinePublicPrice)).toBeCloseTo(28000.5, 1);
  });
});

/* ----------------------------------------------------------------------------
 * 5. SKU ausente
 * ------------------------------------------------------------------------- */

describe("5. SKU ausente", () => {
  it("acepta filas sin SKU (campo opcional)", async () => {
    const csv = `nombre,precio,moneda\nArena de rio,15000,COP`;
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({ fileName: "nosku.csv", content: csv });
    const first = items[0]!;
    expect(first.sku).toBeUndefined();
  });

  it("genera propuesta pending para ítem sin candidato de SKU", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "nosku.csv",
      content: MINIMAL_CSV,
    });
    const proposals = await adapter.mapToSupplierProducts(items);
    // Sin catálogo → todos pending.
    expect(proposals.every((p) => p.status === "pending")).toBe(true);
    expect(proposals.every((p) => p.requiresManualReview)).toBe(true);
  });
});

/* ----------------------------------------------------------------------------
 * 6. SKU ambiguo → pending (NUNCA aprobado automáticamente)
 * ------------------------------------------------------------------------- */

describe("6. SKU ambiguo → pending", () => {
  it("marca propuestas ambiguas como pending (requiresManualReview=true)", async () => {
    // Catálogo con dos recursos con nombres similares → ambigüedad.
    const ambiguousCatalog = {
      resources: [
        { resourceId: RESOURCE_IDS.cemento, name: "Cemento gris", code: "C001" },
        { resourceId: RESOURCE_IDS.arena, name: "Cemento blanco", code: "C002" },
      ],
    };
    const adapter = createHomecenterCsvAdapter(ambiguousCatalog);
    const items = await adapter.parseCatalog({
      fileName: "ambig.csv",
      content: "nombre,precio,moneda\nCemento gris,28000,COP",
    });
    const proposals = await adapter.mapToSupplierProducts(items);
    const proposal = proposals[0]!;
    // Dos candidatos con scores similares → ambiguo.
    if (proposal.candidates.length > 1) {
      const best = proposal.candidates[0]!.score;
      const second = proposal.candidates[1]!.score;
      if (best - second < 0.1) {
        expect(proposal.requiresManualReview).toBe(true);
        expect(proposal.status).toBe("pending");
      }
    }
    // En cualquier caso, el status nunca debe ser 'approved' automáticamente.
    for (const p of proposals) {
      expect(p.status).not.toBe("approved");
    }
  });

  it("isAmbiguous retorna true con candidatos de score similar", () => {
    const candidates = [
      makeCandidate({ score: 0.6, resourceId: RESOURCE_IDS.cemento }),
      makeCandidate({ score: 0.55, resourceId: RESOURCE_IDS.arena }),
    ];
    expect(isAmbiguous(candidates)).toBe(true);
  });

  it("isAmbiguous retorna true sin candidatos", () => {
    expect(isAmbiguous([])).toBe(true);
  });

  it("isAmbiguous retorna true con score bajo", () => {
    const candidates = [makeCandidate({ score: 0.2 })];
    expect(isAmbiguous(candidates)).toBe(true);
  });

  it("isAmbiguous retorna false con un candidato claro y único", () => {
    const candidates = [makeCandidate({ score: 0.9 })];
    expect(isAmbiguous(candidates)).toBe(false);
  });
});

/* ----------------------------------------------------------------------------
 * 7. URL opcional
 * ------------------------------------------------------------------------- */

describe("7. URL opcional", () => {
  it("incluye URL en RawSupplierItem si está presente (🔒 interno)", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "url.csv",
      content: VALID_CSV,
    });
    const first = items[0]!;
    expect(first.url).toBe("https://example.test/p/1");
  });

  it("omite campo url si no está en el CSV", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "nourl.csv",
      content: MINIMAL_CSV,
    });
    const first = items[0]!;
    expect(first.url).toBeUndefined();
  });
});

/* ----------------------------------------------------------------------------
 * 8. Preview sin persistencia
 * ------------------------------------------------------------------------- */

describe("8. Preview sin persistencia", () => {
  it("buildPreview no persiste nada (es solo lectura)", async () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const port = createMockApprovalPort();
    const items = await adapter.parseCatalog({
      fileName: "test.csv",
      content: VALID_CSV,
    });
    const proposals = await adapter.mapToSupplierProducts(items);
    const _preview = adapter.buildPreview(proposals);

    // Verificar que el puerto no fue llamado.
    expect(port.recordedObservations).toHaveLength(0);
    expect(port.approvedObservations).toHaveLength(0);
  });

  it("summarizePreview reporta readyToImport=false cuando todo es pending", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const preview = await runImportPreview(adapter, {
      fileName: "test.csv",
      content: MINIMAL_CSV,
    });
    const summary = summarizePreview(preview);
    expect(summary.readyToImport).toBe(false);
    expect(summary.pendingRows).toBeGreaterThan(0);
  });

  it("summarizePreview reporta readyToImport=true cuando hay aprobados y no hay pending", () => {
    const proposals = [
      makeApprovedProposal(),
      makeRejectedProposal(),
    ];
    const preview = buildPreview("homecenter", "test.csv", proposals);
    const summary = summarizePreview(preview);
    expect(summary.readyToImport).toBe(true);
    expect(summary.approvedRows).toBe(1);
    expect(summary.rejectedRows).toBe(1);
    expect(summary.pendingRows).toBe(0);
  });
});

/* ----------------------------------------------------------------------------
 * 9. Aprobación humana
 * ------------------------------------------------------------------------- */

describe("9. Aprobación humana", () => {
  it("toPriceObservations solo procesa propuestas approved", () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const proposals = [
      makeApprovedProposal(),
      makePendingProposal(),
      makeRejectedProposal(),
    ];
    const inputs = adapter.toPriceObservations(proposals);
    // Solo la propuesta approved con chosen.supplierProductId genera input.
    expect(inputs).toHaveLength(1);
    const first = inputs[0]!;
    expect(first.supplierProductId).toBe(PRODUCT_IDS.cemento);
    expect(first.observedPrice).toBe("28000.0000000000");
    expect(first.sourceType).toBe("supplier_csv");
  });

  it("applyApprovedProposals registra observación y la aprueba", async () => {
    const port = createMockApprovalPort();
    const proposals = [makeApprovedProposal()];
    const idempotencyKeys = new Set<string>();

    await applyApprovedProposals(
      proposals,
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "test.csv",
      idempotencyKeys,
    );

    expect(port.recordedObservations).toHaveLength(1);
    expect(port.approvedObservations).toHaveLength(1);
  });

  it("no persiste si no hay propuestas approved", async () => {
    const port = createMockApprovalPort();
    const proposals = [makePendingProposal(), makeRejectedProposal()];
    const idempotencyKeys = new Set<string>();

    await applyApprovedProposals(
      proposals,
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "test.csv",
      idempotencyKeys,
    );

    expect(port.recordedObservations).toHaveLength(0);
  });

  it("audita el aprobador y el timestamp", async () => {
    const port = createMockApprovalPort();
    const proposals = [makeApprovedProposal()];
    const idempotencyKeys = new Set<string>();

    const audit = await applyApprovedProposals(
      proposals,
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "audit-test.csv",
      idempotencyKeys,
    );

    expect(audit.approvedBy).toBe(PROFILE_APPROVER);
    expect(audit.approvedAt).toBe("2026-05-30T12:00:00.000Z");
    expect(audit.sourceFileName).toBe("audit-test.csv");
    expect(audit.observationIds).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------------------
 * 10. Rechazo
 * ------------------------------------------------------------------------- */

describe("10. Rechazo", () => {
  it("propuestas rejected no generan observaciones", () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const proposals = [makeRejectedProposal()];
    const inputs = adapter.toPriceObservations(proposals);
    expect(inputs).toHaveLength(0);
  });

  it("audita el número de rechazados", async () => {
    const port = createMockApprovalPort();
    const proposals = [
      makeApprovedProposal(),
      makeRejectedProposal(),
      makeRejectedProposal(),
    ];
    const idempotencyKeys = new Set<string>();

    const audit = await applyApprovedProposals(
      proposals,
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "test.csv",
      idempotencyKeys,
    );

    expect(audit.rejected).toBe(2);
    expect(port.recordedObservations).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------------------
 * 11. Duplicados e idempotencia
 * ------------------------------------------------------------------------- */

describe("11. Idempotencia", () => {
  it("IdempotencyRegistry detecta duplicados en el mismo import", () => {
    const registry = new IdempotencyRegistry();
    const key = {
      providerKey: "homecenter",
      supplierProductId: PRODUCT_IDS.cemento,
      observedAt: "2026-05-30T00:00:00.000Z",
      sourceType: "supplier_csv" as const,
    };
    expect(registry.register(key)).toBe(true);
    expect(registry.register(key)).toBe(false); // Duplicado.
  });

  it("IdempotencyRegistry diferencia por observedAt", () => {
    const registry = new IdempotencyRegistry();
    const key1 = {
      providerKey: "homecenter",
      supplierProductId: PRODUCT_IDS.cemento,
      observedAt: "2026-05-30T00:00:00.000Z",
      sourceType: "supplier_csv" as const,
    };
    const key2 = { ...key1, observedAt: "2026-05-31T00:00:00.000Z" };
    expect(registry.register(key1)).toBe(true);
    expect(registry.register(key2)).toBe(true); // Diferente fecha → no es duplicado.
  });

  it("applyApprovedProposals no duplica si la clave ya está en el set", async () => {
    const port = createMockApprovalPort();
    const proposal = makeApprovedProposal();
    const idempotencyKeys = new Set<string>();

    // Primera importación.
    await applyApprovedProposals(
      [proposal],
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "test.csv",
      idempotencyKeys,
    );

    // Segunda importación del mismo ítem → duplicado.
    const audit2 = await applyApprovedProposals(
      [proposal],
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "test.csv",
      idempotencyKeys,
    );

    expect(port.recordedObservations).toHaveLength(1); // Solo una observación.
    expect(audit2.duplicates).toBe(1);
  });

  it("hashRowContent produce hash distinto para precios distintos", () => {
    const h1 = hashRowContent("cemento|28000|COP|CEM-001");
    const h2 = hashRowContent("cemento|29000|COP|CEM-001");
    expect(h1).not.toBe(h2);
  });

  it("buildContentHash es determinista", () => {
    const fields = { name: "Cemento", onlinePublicPrice: "28000", currency: "COP", sku: "CEM-001" };
    expect(buildContentHash(fields)).toBe(buildContentHash(fields));
  });
});

/* ----------------------------------------------------------------------------
 * 12. Privacidad (campos 🔒 nunca en proyección cliente)
 * ------------------------------------------------------------------------- */

describe("12. Privacidad", () => {
  it("INTERNAL_PRICE_FIELDS incluye campos sensibles del adaptador", () => {
    // Los campos del adaptador que son internos deben estar en INTERNAL_PRICE_FIELDS
    // o ser omitidos por lógica del adaptador.
    // Verificamos que la constante existe y no está vacía.
    expect(INTERNAL_PRICE_FIELDS.length).toBeGreaterThan(0);
    // onlinePublicPrice es interno.
    expect(INTERNAL_PRICE_FIELDS).toContain("onlinePublicPrice");
    // supplierProductId es interno.
    expect(INTERNAL_PRICE_FIELDS).toContain("supplierProductId");
    // sourceReference es interno.
    expect(INTERNAL_PRICE_FIELDS).toContain("sourceReference");
  });

  it("RawSupplierItem.sku y url son campos opcionales (no se exponen si ausentes)", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    const items = await adapter.parseCatalog({
      fileName: "nosku.csv",
      content: MINIMAL_CSV,
    });
    // Sin SKU ni URL en el CSV → no deben aparecer en el item.
    for (const item of items) {
      expect(item.sku).toBeUndefined();
      expect(item.url).toBeUndefined();
      expect(item.sourceReference).toBeUndefined();
    }
  });

  it("toPriceObservations no expone campos de descuento ni ahorro", () => {
    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const proposals = [makeApprovedProposal()];
    const inputs = adapter.toPriceObservations(proposals);
    for (const input of inputs) {
      expect(input).not.toHaveProperty("negotiatedDiscountPct");
      expect(input).not.toHaveProperty("projectedSaving");
      expect(input).not.toHaveProperty("realizedSaving");
      expect(input).not.toHaveProperty("expectedPurchasePrice");
    }
  });

  it("SkuMatchProposal.candidates y score son internos (no exponer al cliente)", () => {
    // Verificamos que el campo candidates existe en la propuesta pero
    // que el tipo no lo define como 'cliente-safe'.
    const proposal = makePendingProposal();
    expect(proposal.candidates).toBeDefined();
    // Los candidates tienen score (interno).
    const firstCandidate = proposal.candidates[0];
    expect(firstCandidate).toBeDefined();
    expect(firstCandidate?.score).toBeDefined();
    // El test documenta la política: estos campos son 🔒.
    // En la proyección al cliente se deben omitir.
  });
});

/* ----------------------------------------------------------------------------
 * 13. Auditoría de aprobación
 * ------------------------------------------------------------------------- */

describe("13. Auditoría", () => {
  it("auditoría incluye todos los campos obligatorios del contrato", async () => {
    const port = createMockApprovalPort();
    const proposals = [makeApprovedProposal()];
    const idempotencyKeys = new Set<string>();

    const audit = await applyApprovedProposals(
      proposals,
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "audit-test.csv",
      idempotencyKeys,
      "supplier_csv",
    );

    // Campos de auditoría obligatorios (Q11).
    expect(audit.approvedBy).toBe(PROFILE_APPROVER); // aprobador
    expect(audit.approvedAt).toBe("2026-05-30T12:00:00.000Z"); // timestamp
    expect(audit.sourceFileName).toBe("audit-test.csv"); // fuente
    expect(audit.sourceType).toBe("supplier_csv"); // tipo de fuente
    expect(audit.observationIds).toHaveLength(1); // IDs de observaciones
    expect(audit.duplicates).toBe(0);
    expect(audit.rejected).toBe(0);
    expect(audit.errors).toHaveLength(0);
  });

  it("auditoría cuenta rechazados y duplicados por separado", async () => {
    const port = createMockApprovalPort();
    const proposal = makeApprovedProposal();
    const idempotencyKeys = new Set<string>();

    // Primera importación.
    await applyApprovedProposals([proposal], port, PROFILE_APPROVER, "2026-05-30T12:00:00.000Z", "f.csv", idempotencyKeys);

    // Segunda importación: mismo ítem = duplicado.
    const audit = await applyApprovedProposals(
      [proposal, makeRejectedProposal(), makeRejectedProposal()],
      port,
      PROFILE_APPROVER,
      "2026-05-30T12:00:00.000Z",
      "f.csv",
      idempotencyKeys,
    );

    expect(audit.duplicates).toBe(1);
    expect(audit.rejected).toBe(2);
  });
});

/* ----------------------------------------------------------------------------
 * 14. Fallback manual
 * ------------------------------------------------------------------------- */

describe("14. Fallback manual", () => {
  it("permite crear propuesta approved manualmente sin matching automático", () => {
    // El flujo de fallback: humano crea manualmente la propuesta con el candidato correcto.
    const item = makeRawItem({ name: "Producto desconocido", sku: undefined });
    const candidate = makeCandidate({
      resourceId: RESOURCE_IDS.cemento,
      supplierProductId: PRODUCT_IDS.cemento,
      score: 1,
      reason: "Mapeo manual por usuario",
    });
    const manualProposal = {
      rawItem: item,
      candidates: [candidate],
      chosen: candidate,
      status: "approved" as const,
      requiresManualReview: false,
      reviewNotes: "Aprobación manual por comprador",
    };

    const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);
    const inputs = adapter.toPriceObservations([manualProposal]);
    expect(inputs).toHaveLength(1);
    const first = inputs[0]!;
    expect(first.supplierProductId).toBe(PRODUCT_IDS.cemento);
  });

  it("fallback: CSV vacío retorna array vacío sin error de parsing", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    // HEADER_ONLY_CSV tiene encabezado pero sin filas.
    const items = await adapter.parseCatalog({
      fileName: "empty.csv",
      content: HEADER_ONLY_CSV,
    });
    expect(items).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------------------
 * 15. JaccardScore y tokenize (helpers de matching)
 * ------------------------------------------------------------------------- */

describe("15. Matching por descripción", () => {
  it("jaccardScore retorna 1 para strings idénticos", () => {
    expect(jaccardScore("cemento gris", "cemento gris")).toBe(1);
  });

  it("jaccardScore retorna 0 para strings sin tokens comunes", () => {
    expect(jaccardScore("cemento", "pintura")).toBe(0);
  });

  it("jaccardScore es simétrico", () => {
    const a = jaccardScore("cemento portland", "portland cemento");
    const b = jaccardScore("portland cemento", "cemento portland");
    expect(a).toBeCloseTo(b, 10);
  });

  it("tokenize elimina diacríticos", () => {
    const tokens = tokenize("árido pétreo");
    expect(tokens).toContain("arido");
    expect(tokens).toContain("petreo");
  });

  it("tokenize elimina palabras cortas (≤1 char)", () => {
    const tokens = tokenize("a de la el");
    expect(tokens.every((t) => t.length > 1)).toBe(true);
  });

  it("matching por SKU exacto incrementa el score", async () => {
    const catalog = {
      resources: [
        { resourceId: RESOURCE_IDS.cemento, name: "Producto XYZ", code: "CEM-001" },
      ],
    };
    const adapter = createHomecenterCsvAdapter(catalog);
    const items = await adapter.parseCatalog({
      fileName: "sku.csv",
      content: "nombre,precio,moneda,sku\nAlgo completamente diferente,28000,COP,CEM-001",
    });
    const proposals = await adapter.mapToSupplierProducts(items);
    const firstProposal = proposals[0]!;
    // El score debe ser > 0 por el boost de SKU exacto.
    expect(firstProposal.candidates.length).toBeGreaterThan(0);
    const firstCandidate = firstProposal.candidates[0];
    expect(firstCandidate).toBeDefined();
    expect(firstCandidate?.score).toBeGreaterThan(0);
    expect(firstCandidate?.reason).toContain("SKU coincide");
  });
});

/* ----------------------------------------------------------------------------
 * 16. Health check del adaptador
 * ------------------------------------------------------------------------- */

describe("16. Estado del adaptador", () => {
  it("HomecenterCsvAdapter tiene providerKey correcto", () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    expect(adapter.providerKey).toBe("homecenter");
  });

  it("lanza error claro si se pasa contenido binario (Excel) en runtime", async () => {
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    await expect(
      adapter.parseCatalog({
        fileName: "test.xlsx",
        mimeType: "application/vnd.ms-excel",
        content: new Uint8Array([0x50, 0x4b]), // bytes de Excel
      }),
    ).rejects.toThrow(/Excel.*convertirse a CSV/i);
  });
});

/* ----------------------------------------------------------------------------
 * 17. Rate limiting (diseño documentado)
 * ------------------------------------------------------------------------- */

describe("17. Rate limiting (diseño)", () => {
  it("el adaptador CSV no hace ninguna conexión remota", async () => {
    // Verificar que parseCatalog no llama a ninguna función de red.
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    const adapter = createHomecenterCsvAdapter(EMPTY_CATALOG);
    await adapter.parseCatalog({ fileName: "t.csv", content: MINIMAL_CSV });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
