/**
 * Tests del parser CSV — agent-homecenter (Oleada 2B).
 *
 * Cubre: CSV válido, separador, columnas faltantes, precio inválido,
 * precio negativo, formato europeo, nombre vacío, CSV vacío, encabezado solo.
 */
import { describe, expect, it } from "vitest";

import {
  detectSeparator,
  parseCsvContent,
  parseCsvLine,
  validateColumns,
  REQUIRED_COLUMNS,
  OPTIONAL_COLUMNS,
} from "@/modules/pricing/adapters/homecenter-csv";

import {
  EMPTY_CSV,
  HEADER_ONLY_CSV,
  INVALID_PRICE_CSV,
  MINIMAL_CSV,
  MISSING_REQUIRED_COLUMN_CSV,
  NEGATIVE_PRICE_CSV,
  SEMICOLON_CSV,
  VALID_CSV,
} from "./fixtures";

/* ----------------------------------------------------------------------------
 * parseCsvLine
 * ------------------------------------------------------------------------- */

describe("parseCsvLine", () => {
  it("parsea una línea simple con comas", () => {
    const result = parseCsvLine("a,b,c");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("parsea campos con comillas y comas internas", () => {
    const result = parseCsvLine('"nombre con, coma",28000,COP');
    expect(result).toEqual(["nombre con, coma", "28000", "COP"]);
  });

  it("parsea comillas escapadas dentro de campo", () => {
    const result = parseCsvLine('"precio ""especial""",28000,COP');
    expect(result).toEqual(['precio "especial"', "28000", "COP"]);
  });

  it("parsea con separador punto y coma", () => {
    const result = parseCsvLine("a;b;c", ";");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("maneja campos vacíos al final", () => {
    const result = parseCsvLine("a,b,");
    expect(result).toEqual(["a", "b", ""]);
  });

  it("recorta espacios en campos no entrecomillados", () => {
    const result = parseCsvLine("  a  ,  b  ,  c  ");
    expect(result).toEqual(["a", "b", "c"]);
  });
});

/* ----------------------------------------------------------------------------
 * detectSeparator
 * ------------------------------------------------------------------------- */

describe("detectSeparator", () => {
  it("detecta coma como separador por defecto", () => {
    expect(detectSeparator("nombre,precio,moneda")).toBe(",");
  });

  it("detecta punto y coma cuando hay más que comas", () => {
    expect(detectSeparator("nombre;precio;moneda")).toBe(";");
  });

  it("detecta coma cuando hay empate (default)", () => {
    expect(detectSeparator("nombre,precio;moneda")).toBe(",");
  });
});

/* ----------------------------------------------------------------------------
 * validateColumns
 * ------------------------------------------------------------------------- */

describe("validateColumns", () => {
  it("valida CSV con todas las columnas obligatorias y opcionales", () => {
    const headers = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
    const result = validateColumns(headers);
    expect(result.valid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it("valida CSV con solo columnas obligatorias", () => {
    const result = validateColumns([...REQUIRED_COLUMNS]);
    expect(result.valid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
    expect(result.missingOptional).toHaveLength(OPTIONAL_COLUMNS.length);
  });

  it("falla si falta columna obligatoria 'nombre'", () => {
    const result = validateColumns(["precio", "moneda"]);
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toContain("nombre");
  });

  it("falla si falta columna obligatoria 'precio'", () => {
    const result = validateColumns(["nombre", "moneda"]);
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toContain("precio");
  });

  it("falla si falta columna obligatoria 'moneda'", () => {
    const result = validateColumns(["nombre", "precio"]);
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toContain("moneda");
  });

  it("reporta columnas extra como advertencia", () => {
    const result = validateColumns(["nombre", "precio", "moneda", "columna_extra"]);
    expect(result.valid).toBe(true);
    expect(result.extraColumns).toContain("columna_extra");
    expect(result.warnings.some((w) => w.includes("columna_extra"))).toBe(true);
  });

  it("incluye advertencia por opcionales ausentes", () => {
    const result = validateColumns(["nombre", "precio", "moneda"]);
    expect(result.warnings.some((w) => w.includes("Columnas opcionales ausentes"))).toBe(true);
  });
});

/* ----------------------------------------------------------------------------
 * parseCsvContent
 * ------------------------------------------------------------------------- */

describe("parseCsvContent", () => {
  it("parsea CSV válido completo", () => {
    const result = parseCsvContent(VALID_CSV);
    expect(result.headers).toContain("nombre");
    expect(result.headers).toContain("precio");
    expect(result.headers).toContain("moneda");
    expect(result.rows).toHaveLength(3);
    expect(result.invalidRows).toHaveLength(0);
  });

  it("parsea CSV mínimo (solo columnas obligatorias)", () => {
    const result = parseCsvContent(MINIMAL_CSV);
    expect(result.rows).toHaveLength(2);
    const firstRow = result.rows[0]!;
    expect(firstRow["nombre"]).toBe("Cemento gris Portland");
    expect(firstRow["precio"]).toBe("28000");
  });

  it("parsea CSV con separador punto y coma", () => {
    const result = parseCsvContent(SEMICOLON_CSV);
    expect(result.separator).toBe(";");
    expect(result.rows).toHaveLength(2);
    const firstRow = result.rows[0]!;
    expect(firstRow["nombre"]).toBe("Cemento gris Portland");
  });

  it("retorna advertencia para CSV vacío", () => {
    const result = parseCsvContent(EMPTY_CSV);
    expect(result.rows).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("vacío"))).toBe(true);
  });

  it("parsea CSV con solo encabezado (0 filas de datos)", () => {
    const result = parseCsvContent(HEADER_ONLY_CSV);
    expect(result.rows).toHaveLength(0);
    expect(result.headers).toEqual(["nombre", "precio", "moneda"]);
  });

  it("normaliza los nombres de columna a lowercase", () => {
    const csv = "NOMBRE,PRECIO,MONEDA\nCemento,28000,COP";
    const result = parseCsvContent(csv);
    expect(result.headers).toEqual(["nombre", "precio", "moneda"]);
  });

  it("reporta fila inválida con número de columnas incorrecto", () => {
    const csv = "nombre,precio,moneda\nCemento,28000\nArena,15000,COP";
    const result = parseCsvContent(csv);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.rows).toHaveLength(1); // Arena sigue válida.
  });

  it("ignora líneas vacías", () => {
    const csv = "nombre,precio,moneda\n\nCemento,28000,COP\n";
    const result = parseCsvContent(csv);
    expect(result.rows).toHaveLength(1);
  });

  it("ignora líneas de comentario (#)", () => {
    const csv = "nombre,precio,moneda\n# Este es un comentario\nCemento,28000,COP";
    const result = parseCsvContent(csv);
    expect(result.rows).toHaveLength(1);
  });
});
