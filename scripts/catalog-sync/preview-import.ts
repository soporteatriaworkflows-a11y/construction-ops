#!/usr/bin/env tsx
/**
 * Script de preview de importación CSV — scripts/catalog-sync/preview-import.ts
 *
 * Ejecuta el flujo de importación hasta el paso de preview (sin persistir).
 * Muestra estadísticas y propuestas para revisión humana.
 *
 * Uso:
 *   corepack pnpm tsx scripts/catalog-sync/preview-import.ts \
 *     --file scripts/catalog-sync/sample-catalog.csv \
 *     --provider homecenter
 *
 * NOTA: Solo para uso local. NO enviar datos reales de precios a ningún
 * servicio externo. Los archivos de entrada deben estar en private/ (no Git).
 *
 * Reglas de privacidad:
 * - NO mostrar campos 🔒 en salidas no autorizadas.
 * - NO conectar a endpoints remotos.
 * - Solo CSV local.
 */

import fs from "node:fs";
import path from "node:path";

import {
  createHomecenterCsvAdapter,
  EMPTY_CATALOG,
  runImportPreview,
  summarizePreview,
} from "../../apps/web/modules/pricing/adapters/index.js";
import type { ResourceCatalog } from "../../apps/web/modules/pricing/adapters/index.js";

/* ----------------------------------------------------------------------------
 * Parseo de argumentos (sin dependencia de commander)
 * ------------------------------------------------------------------------- */

function parseArgs(args: string[]): { file?: string; provider?: string } {
  const result: { file?: string; provider?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      result.file = args[i + 1];
      i++;
    } else if (args[i] === "--provider" && args[i + 1]) {
      result.provider = args[i + 1];
      i++;
    }
  }
  return result;
}

/* ----------------------------------------------------------------------------
 * Catálogo de ejemplo (sanitizado, sin datos reales)
 * ------------------------------------------------------------------------- */

/**
 * Catálogo de recursos de ejemplo para el preview local.
 * En producción, este catálogo se obtiene de la DB.
 * NO incluir datos privados ni nombres de clientes.
 */
const SAMPLE_CATALOG: ResourceCatalog = {
  resources: [
    {
      resourceId: "00000000-0000-4000-9000-000000000r01",
      name: "Cemento gris Portland",
      code: "CEM-001",
      unit: "bulto",
    },
    {
      resourceId: "00000000-0000-4000-9000-000000000r02",
      name: "Arena de rio",
      code: "ARE-001",
      unit: "bulto",
    },
    {
      resourceId: "00000000-0000-4000-9000-000000000r03",
      name: "Gravilla 3/4",
      code: "GRV-034",
      unit: "bulto",
    },
    {
      resourceId: "00000000-0000-4000-9000-000000000r04",
      name: "Ladrillo prensado",
      code: "LAD-001",
      unit: "und",
    },
    {
      resourceId: "00000000-0000-4000-9000-000000000r05",
      name: "Ceramica piso 45x45",
      code: "CER-4545G",
      unit: "m2",
    },
  ],
};

/* ----------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const filePath = args.file ?? "scripts/catalog-sync/sample-catalog.csv";
  const _provider = args.provider ?? "homecenter";

  console.log(`\nPreview de importación — ${filePath}`);
  console.log("=".repeat(50));

  // Leer el archivo CSV.
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: archivo no encontrado: ${absolutePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const fileName = path.basename(absolutePath);

  // Crear adaptador con catálogo de ejemplo.
  const adapter = createHomecenterCsvAdapter(SAMPLE_CATALOG);

  // Ejecutar preview (sin persistir).
  const preview = await runImportPreview(adapter, {
    fileName,
    mimeType: "text/csv",
    content,
  });

  // Mostrar resumen.
  const summary = summarizePreview(preview);
  console.log("\nResumen:");
  console.log(`  Total filas      : ${summary.totalRows}`);
  console.log(`  Válidas          : ${summary.validRows}`);
  console.log(`  Inválidas        : ${summary.invalidRows}`);
  console.log(`  Pendientes       : ${summary.pendingRows}`);
  console.log(`  Aprobadas        : ${summary.approvedRows}`);
  console.log(`  Rechazadas       : ${summary.rejectedRows}`);
  console.log(`  Ambiguas         : ${summary.ambiguousRows}`);
  console.log(`  Listo para import: ${summary.readyToImport ? "SI" : "NO (requiere revisión humana)"}`);

  if (preview.warnings.length > 0) {
    console.log("\nAdvertencias:");
    for (const w of preview.warnings) {
      console.log(`  [WARN] ${w}`);
    }
  }

  // Mostrar propuestas.
  console.log("\nPropuestas:");
  for (const p of preview.proposals) {
    const status = p.requiresManualReview ? "[PENDIENTE]" : "[AUTO-CANDIDATO]";
    const best =
      p.candidates[0]
        ? ` → ${p.candidates[0].reason} (${p.candidates[0].resourceId})`
        : " → sin candidato";
    console.log(`  ${status} ${p.rawItem.name}${best}`);
  }

  console.log(
    "\nNOTA: Este es solo un preview. Ningún dato fue persistido.",
  );
  console.log(
    "Para importar, aprueba los ítems e invoca PricingApprovalPort.",
  );
}

main().catch((err) => {
  console.error("Error en preview-import:", err);
  process.exit(1);
});
