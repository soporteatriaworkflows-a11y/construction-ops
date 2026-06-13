/**
 * helpers.ts — Constructores de hojas CANTIDADES SINTÉTICAS para pruebas
 * (QUANTITY_TAKEOFF_IMPORT_V1). 100% datos ficticios sanitizados; el workbook
 * real (golden master) JAMÁS entra al repositorio.
 *
 * Reutiliza los constructores genéricos del módulo APU (gridFromCells y
 * workbookFile operan sobre el mismo modelo de celdas).
 */
import type { BoqTakeoffCandidate } from '@/server/quantity-import/matching';
import { gridFromCells, workbookFile, type CellSpec } from '../apu-import/helpers';

export { gridFromCells, workbookFile };
export type { CellSpec };

/** Encabezado de la gramática (contrato §2) en la fila indicada. */
export function takeoffHeaderCells(row: number): CellSpec[] {
  return [
    [row, 'A', 'CAP'],
    [row, 'B', 'ÍTEM'],
    [row, 'C', 'DESCRIPCIÓN'],
    [row, 'D', 'UN'],
    [row, 'E', 'LARGO'],
    [row, 'F', 'ANCHO '],
    [row, 'G', 'ALTO'],
    [row, 'H', 'CANT'],
    [row, 'I', 'TOTAL'],
  ];
}

/**
 * Hoja sintética estándar que cubre la gramática real:
 *  - fila 1-2: preámbulo (se ignora)
 *  - fila 3: encabezado
 *  - fila 4: capítulo 1
 *  - filas 5-7: grupo P-01 (1.01, M², largo×alto×cant ×2 líneas + total)
 *  - filas 8-10: grupo MT-01 (2.01, D = etiqueta Z1/Z2 ⇒ unit_unknown,
 *    volumen largo×ancho×alto×cant + total)
 *  - filas 11-14: grupo BC-01 (2.02, M², con línea de deducción «(-) MENOS»
 *    restada en el total `SUM(I11:I12)-I13`)
 *  - fila 15: capítulo 2 CON el total del grupo anterior incrustado — NO:
 *    el total de BC-01 vive en la fila 14 y la fila 15 abre capítulo 4 con
 *    el total de un grupo SIN fila propia (caso real fila 187): para eso el
 *    grupo BC-02 (filas 16-17) tiene su total en la fila 18 junto al
 *    capítulo 5.
 *  - fila 19: grupo AC-01 sin líneas (skipped_no_lines)
 *  - filas 20-23: grupos duplicados 9.01 (occurrence index)
 */
export function standardTakeoffCells(): CellSpec[] {
  return [
    [1, 'A', 'PROYECTO:  SINTETICO'],
    [2, 'B', 'PRESUPUESTO DE OBRA CIVIL'],
    ...takeoffHeaderCells(3),
    // Capítulo 1.
    [4, 'B', 1], [4, 'C', 'PRELIMINARES DE OBRA'],
    // Grupo P-01 — unidad M², 2 líneas largo×alto×cant.
    [5, 'A', 'P-01'], [5, 'B', 1.01], [5, 'C', 'Demolición de muros sintética'], [5, 'D', 'M²'],
    [5, 'E', 4.2], [5, 'G', 2.4], [5, 'H', 1], [5, 'I', 10.08, '(E5*G5)*H5'],
    [6, 'E', 2], [6, 'G', 2.4], [6, 'H', 2], [6, 'I', 9.6, '(E6*G6)*H6'],
    [7, 'I', 19.68, 'SUM(I5:I6)'],
    // Grupo MT-01 — D etiqueta (Z1/Z2), volumen ×cant.
    [8, 'A', 'MT-01'], [8, 'B', 2.01], [8, 'C', 'Excavación manual sintética'], [8, 'D', 'Z1'],
    [8, 'E', 1.2], [8, 'F', 1.2], [8, 'G', 1.5], [8, 'H', 9], [8, 'I', 19.44, '(E8*F8*G8)*H8'],
    [9, 'D', 'Z2'], [9, 'E', 5.9], [9, 'F', 1.2], [9, 'G', 1.5], [9, 'H', 3], [9, 'I', 31.86, '(E9*F9*G9)*H9'],
    [10, 'I', 51.3, 'SUM(I8:I9)'],
    // Grupo BC-01 — deducción «(-) MENOS» restada en el total.
    [11, 'A', 'BC-01'], [11, 'B', 2.02], [11, 'C', 'Contrapiso sintético'], [11, 'D', 'M²'],
    [11, 'E', 10], [11, 'F', 2], [11, 'H', 1], [11, 'I', 20, '(E11*F11)*H11'],
    [12, 'E', 5], [12, 'F', 2], [12, 'H', 1], [12, 'I', 10, '(E12*F12)*H12'],
    [13, 'D', '(-) MENOS'], [13, 'E', 2], [13, 'F', 1], [13, 'H', 1], [13, 'I', 2, '(E13*F13)*H13'],
    [14, 'I', 28, 'SUM(I11:I12)-I13'],
    // Grupo BC-02 — total incrustado en la fila del capítulo siguiente.
    [16, 'A', 'BC-02'], [16, 'B', 2.03], [16, 'C', 'Viga sintética'], [16, 'D', 'Ml'],
    [16, 'E', 4.6], [16, 'H', 3], [16, 'I', 13.8, '(E16*H16)'],
    [17, 'E', 5.1], [17, 'H', 2], [17, 'I', 10.2, '(E17*H17)'],
    [18, 'B', 4], [18, 'C', 'ACERO DE REFUERZO'], [18, 'I', 24, 'SUM(I16:I17)'],
    // Grupo AC-01 sin líneas de medición (no se importa).
    [19, 'A', 'AC-01'], [19, 'B', 4.01], [19, 'C', 'Acero de refuerzo sintético'], [19, 'D', 'Kg'],
    // Capítulo 9 con ítems duplicados (occurrence index).
    [20, 'B', 9], [20, 'C', 'VARIOS'],
    [21, 'B', 9.01], [21, 'C', 'Aseo sintético'], [21, 'D', 'M²'],
    [21, 'E', 3], [21, 'H', 2], [21, 'I', 6, 'E21*H21'],
    [22, 'I', 6, 'SUM(I21)'],
    [23, 'B', 9.01], [23, 'C', 'Aseo sintético'], [23, 'D', 'M²'],
    [23, 'E', 4], [23, 'H', 1], [23, 'I', 4, 'E23*H23'],
    [24, 'I', 4, 'SUM(I23)'],
  ];
}

/** Hoja sintética como grid (parser puro). */
export function syntheticTakeoffSheet(extra?: CellSpec[]) {
  return gridFromCells([...standardTakeoffCells(), ...(extra ?? [])]);
}

/** Workbook en memoria con la hoja CANTIDADES 1 PISO sintética. */
export function takeoffWorkbookFile(
  cells: CellSpec[] = standardTakeoffCells(),
  sheetName = 'CANTIDADES 1 PISO',
  fileName = 'sintetico-cantidades.xlsx',
): File {
  return workbookFile([{ name: sheetName, cells }], fileName);
}

/** Candidatos BOQ sintéticos coherentes con la hoja estándar. */
export function boqCandidates(): BoqTakeoffCandidate[] {
  return [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      code: '1.01',
      description: 'Demolición de muros sintética',
      unit: 'M2',
      alreadyLinked: false,
    },
    {
      id: '00000000-0000-4000-8000-0000000000c2',
      code: '2.01',
      description: 'Excavación manual sintética',
      unit: 'm³',
      alreadyLinked: false,
    },
    {
      id: '00000000-0000-4000-8000-0000000000c3',
      code: '2.02',
      description: 'Contrapiso sintético',
      unit: 'm²',
      alreadyLinked: false,
    },
    {
      id: '00000000-0000-4000-8000-0000000000c4',
      code: '9.01',
      description: 'Aseo sintético',
      unit: 'm2',
      alreadyLinked: false,
    },
    {
      id: '00000000-0000-4000-8000-0000000000c5',
      code: '9.01',
      description: 'Aseo sintético',
      unit: 'm2',
      alreadyLinked: false,
    },
  ];
}
