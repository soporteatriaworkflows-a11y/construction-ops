import { describe, expect, it } from "vitest";

import { InMemoryPricingRepository } from "@/modules/pricing/in-memory-repository";
import { SupplierService } from "@/modules/suppliers/supplier-service";

import { ORG_A, RESOURCE_1 } from "./fixtures";

function service() {
  const repo = new InMemoryPricingRepository();
  return { repo, svc: new SupplierService(repo) };
}

describe("SupplierService — CRUD proveedores", () => {
  it("crea y lista proveedores por organización", async () => {
    const { svc } = service();
    await svc.createSupplier({ organizationId: ORG_A, name: "Homecenter" });
    await svc.createSupplier({ organizationId: ORG_A, name: "HB" });
    const list = await svc.listSuppliers(ORG_A);
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name)).toContain("Homecenter");
  });

  it("rechaza nombre vacío", async () => {
    const { svc } = service();
    await expect(
      svc.createSupplier({ organizationId: ORG_A, name: "   " }),
    ).rejects.toThrow(/name/);
  });

  it("actualiza un proveedor existente", async () => {
    const { svc } = service();
    const s = await svc.createSupplier({
      organizationId: ORG_A,
      name: "Proveedor X",
    });
    const updated = await svc.updateSupplier(s.id, { active: false });
    expect(updated?.active).toBe(false);
  });

  it("aislamiento: no lista proveedores de otra organización", async () => {
    const { svc } = service();
    await svc.createSupplier({ organizationId: ORG_A, name: "A" });
    await svc.createSupplier({
      organizationId: "00000000-0000-4000-9000-0000000000b9",
      name: "B",
    });
    const list = await svc.listSuppliers(ORG_A);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("A");
  });
});

describe("SupplierService — CRUD productos de proveedor", () => {
  it("crea producto con moneda por defecto COP", async () => {
    const { svc } = service();
    const s = await svc.createSupplier({ organizationId: ORG_A, name: "Prov" });
    const p = await svc.createSupplierProduct({
      supplierId: s.id,
      resourceId: RESOURCE_1,
    });
    expect(p.currency).toBe("COP");
    expect(p.syncStatus).toBe("manual");
  });

  it("valida moneda ISO-4217", async () => {
    const { svc } = service();
    const s = await svc.createSupplier({ organizationId: ORG_A, name: "Prov" });
    await expect(
      svc.createSupplierProduct({
        supplierId: s.id,
        resourceId: RESOURCE_1,
        currency: "pesos",
      }),
    ).rejects.toThrow(/ISO-4217/);
  });

  it("lista productos por recurso", async () => {
    const { svc } = service();
    const s = await svc.createSupplier({ organizationId: ORG_A, name: "Prov" });
    await svc.createSupplierProduct({
      supplierId: s.id,
      resourceId: RESOURCE_1,
    });
    const byResource = await svc.listSupplierProductsByResource(RESOURCE_1);
    expect(byResource).toHaveLength(1);
  });
});
