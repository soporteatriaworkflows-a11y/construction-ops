#!/usr/bin/env tsx
/**
 * Convertidor Excel → CSV para catálogos de proveedores.
 *
 * Usa `xlsx` (devDep de apps/web) para convertir Excel a CSV sanitizado.
 * Este script es SOLO para uso local/scripts; xlsx NO es una dependencia
 * de runtime del adaptador (que usa su propio parser CSV).
 *
 * Uso:
 *   corepack pnpm tsx scripts/catalog-sync/convert-excel.ts \
 *     --input private/catalogo-homecenter.xlsx \
 *     --output private/catalogo-homecenter.csv \
 *     --sheet "Precios"
 *
 * PRIVACIDAD:
 * - El archivo de entrada (Excel real) debe estar en private/ (ignorado por Git).
 * - El archivo de salida (CSV) también debe estar en private/ si contiene datos reales.
 * - Para datos de prueba, usar sample-catalog.csv (sanitizado).
 * - NO subir archivos de precios reales al repositorio.
 * - NO conectar a ningún servicio externo.
 *
 * FORMATO ESPERADO DEL EXCEL:
 * El Excel debe tener una hoja con columnas que mapeen al formato CSV esperado.
 * Las columnas se detectan por nombre (case-insensitive).
 *
 * Columnas reconocidas (mínimas: nombre, precio, moneda):
 *   nombre / name / descripcion / description
 *   precio / price / valor / value / precio_unitario
 *   moneda / currency / divisa
 *   sku / codigo / code / cod
 *   url / link / enlace
 *   unidad / unit / um
 *   fecha / date / fecha_precio
 *   referencia_fuente / source / fuente / ref
 */

import fs from "node:fs";
import path from "node:path";

/* ----------------------------------------------------------------------------
 * Parseo de argumentos
 * ------------------------------------------------------------------------- */

function parseArgs(args: string[]): {
  input?: string;
  output?: string;
  sheet?: string;
} {
  const result: { input?: string; output?: string; sheet?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      result.input = args[i + 1];
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === "--sheet" && args[i + 1]) {
      result.sheet = args[i + 1];
      i++;
    }
  }
  return result;
}

/* ----------------------------------------------------------------------------
 * Mapeo de columnas Excel → CSV (case-insensitive)
 * ------------------------------------------------------------------------- */

const COLUMN_ALIASES: Record<string, string> = {
  // nombre
  nombre: "nombre",
  name: "nombre",
  descripcion: "nombre",
  description: "nombre",
  producto: "nombre",
  // precio
  precio: "precio",
  price: "precio",
  valor: "precio",
  value: "precio",
  precio_unitario: "precio",
  "precio unitario": "precio",
  vr_unitario: "precio",
  "vr. unitario": "precio",
  // moneda
  moneda: "moneda",
  currency: "moneda",
  divisa: "moneda",
  // sku
  sku: "sku",
  codigo: "sku",
  code: "sku",
  cod: "sku",
  "cod.": "sku",
  referencia: "sku",
  ref: "sku",
  // url
  url: "url",
  link: "url",
  enlace: "url",
  // unidad
  unidad: "unidad",
  unit: "unidad",
  um: "unidad",
  "unidad medida": "unidad",
  "unidad de medida": "unidad",
  // fecha
  fecha: "fecha",
  date: "fecha",
  fecha_precio: "fecha",
  "fecha precio": "fecha",
  // referencia_fuente
  referencia_fuente: "referencia_fuente",
  source: "referencia_fuente",
  fuente: "referencia_fuente",
  origen: "referencia_fuente",
};

function normalizeColumnName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return COLUMN_ALIASES[lower] ?? lower;
}

/* ----------------------------------------------------------------------------
 * Conversión Excel → CSV
 * ------------------------------------------------------------------------- */

async function convertExcelToCsv(
  inputPath: string,
  outputPath: string,
  sheetName?: string,
): Promise<void> {
  // xlsx es devDep; importar dinámicamente para no romper el build si falta.
  let xlsx: typeof import("xlsx");
  try {
    xlsx = await import("xlsx");
  } catch {
    throw new Error(
      "xlsx no está disponible. Asegúrate de que está instalado como devDep en apps/web.",
    );
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
  }

  console.log(`Leyendo Excel: ${inputPath}`);
  const workbook = xlsx.readFile(inputPath, { type: "file" });

  // Seleccionar hoja.
  const sheetNames = workbook.SheetNames;
  const selectedSheet = sheetName ?? sheetNames[0];
  if (!sheetNames.includes(selectedSheet)) {
    throw new Error(
      `Hoja "${selectedSheet}" no encontrada. Hojas disponibles: ${sheetNames.join(", ")}.`,
    );
  }

  const sheet = workbook.Sheets[selectedSheet];
  if (!sheet) {
    throw new Error(`No se pudo leer la hoja: ${selectedSheet}`);
  }

  // Convertir a JSON (array de arrays para control manual de columnas).
  const rawData = xlsx.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (rawData.length === 0) {
    throw new Error(`La hoja "${selectedSheet}" está vacía.`);
  }

  // Primera fila = encabezados.
  const rawHeaders = rawData[0] as string[];
  const normalizedHeaders = rawHeaders.map(normalizeColumnName);

  // Construir CSV.
  const csvLines: string[] = [];
  csvLines.push(normalizedHeaders.join(","));

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as string[];
    if (row.every((c) => !c || String(c).trim() === "")) continue; // Fila vacía.

    const csvRow = row.map((cell) => {
      const s = String(cell ?? "").trim();
      // Escapar comas y comillas en el valor.
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    csvLines.push(csvRow.join(","));
  }

  const csvContent = csvLines.join("\n");

  // Asegurar que el directorio de salida exista.
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, csvContent, "utf-8");
  console.log(
    `CSV generado: ${outputPath} (${csvLines.length - 1} filas de datos)`,
  );
  console.log(
    "Columnas detectadas:",
    normalizedHeaders.filter((h) => h !== "").join(", "),
  );
}

/* ----------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error(
      "Uso: tsx convert-excel.ts --input <archivo.xlsx> --output <archivo.csv> [--sheet <nombre>]",
    );
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(
    args.output ??
      inputPath.replace(/\.(xlsx?|xls)$/i, ".csv"),
  );

  await convertExcelToCsv(inputPath, outputPath, args.sheet);
  console.log("Conversión completada. Verifique el CSV antes de importar.");
  console.log(
    "NOTA: Si el archivo contiene datos reales, mantenerlo en private/ (ignorado por Git).",
  );
}

main().catch((err) => {
  console.error("Error en convert-excel:", err);
  process.exit(1);
});
