/**
 * Servicio de proveedores y productos de proveedor — agent-suppliers/pricing.
 *
 * CRUD de `suppliers` y `supplier_products` sobre el `PricingRepository`
 * (RLS garantiza el aislamiento por organización en la implementación real).
 * Aplica validaciones de dominio mínimas (nombre no vacío, moneda ISO-4217).
 *
 * Los campos 🔒 (`contactData`, `supplierSku`, `productUrl`,
 * `locationReference`) viven aquí pero NO se exponen a rol cliente: la
 * proyección de privacidad es responsabilidad de pricing/exports.
 */
import type { SupplierType, Uuid } from "@/lib/utils/types";

import type {
  NewSupplierInput,
  NewSupplierProductInput,
  PricingRepository,
  SupplierProductRecord,
  SupplierRecord,
  UpdateSupplierInput,
  UpdateSupplierProductInput,
} from "@/modules/pricing/repository";

const ISO_4217 = /^[A-Z]{3}$/;
const VALID_SUPPLIER_TYPES: readonly SupplierType[] = [
  "vendor",
  "distributor",
  "manufacturer",
  "subcontractor",
  "other",
];

export class SupplierService {
  constructor(private readonly repo: PricingRepository) {}

  /* ----------------------------------------------------------- Proveedores */

  async createSupplier(input: NewSupplierInput): Promise<SupplierRecord> {
    if (input.name.trim().length === 0) {
      throw new Error("createSupplier: 'name' no puede estar vacío.");
    }
    if (
      input.supplierType !== undefined &&
      !VALID_SUPPLIER_TYPES.includes(input.supplierType)
    ) {
      throw new Error(
        `createSupplier: supplierType inválido '${input.supplierType}'.`,
      );
    }
    return this.repo.createSupplier(input);
  }

  async getSupplier(id: Uuid): Promise<SupplierRecord | null> {
    return this.repo.getSupplier(id);
  }

  async listSuppliers(organizationId: Uuid): Promise<SupplierRecord[]> {
    return this.repo.listSuppliers(organizationId);
  }

  async updateSupplier(
    id: Uuid,
    input: UpdateSupplierInput,
  ): Promise<SupplierRecord | null> {
    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new Error("updateSupplier: 'name' no puede estar vacío.");
    }
    return this.repo.updateSupplier(id, input);
  }

  /* --------------------------------------------------- Productos de proveedor */

  async createSupplierProduct(
    input: NewSupplierProductInput,
  ): Promise<SupplierProductRecord> {
    const currency = input.currency ?? "COP";
    if (!ISO_4217.test(currency)) {
      throw new Error(
        `createSupplierProduct: 'currency' debe ser ISO-4217 (3 letras), recibido '${currency}'.`,
      );
    }
    return this.repo.createSupplierProduct({ ...input, currency });
  }

  async getSupplierProduct(
    id: Uuid,
  ): Promise<SupplierProductRecord | null> {
    return this.repo.getSupplierProduct(id);
  }

  async listSupplierProducts(
    supplierId: Uuid,
  ): Promise<SupplierProductRecord[]> {
    return this.repo.listSupplierProducts(supplierId);
  }

  async listSupplierProductsByResource(
    resourceId: Uuid,
  ): Promise<SupplierProductRecord[]> {
    return this.repo.listSupplierProductsByResource(resourceId);
  }

  async updateSupplierProduct(
    id: Uuid,
    input: UpdateSupplierProductInput,
  ): Promise<SupplierProductRecord | null> {
    if (input.currency !== undefined && !ISO_4217.test(input.currency)) {
      throw new Error(
        `updateSupplierProduct: 'currency' debe ser ISO-4217, recibido '${input.currency}'.`,
      );
    }
    return this.repo.updateSupplierProduct(id, input);
  }
}
