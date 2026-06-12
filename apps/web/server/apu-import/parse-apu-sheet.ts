/**
 * parse-apu-sheet.ts — Parser estructurado de la hoja APU (PURO, sin xlsx).
 * ENTRE_PATIOS_APU_IMPORT_V1, contrato §3 (gramática congelada).
 *
 * Entrada: grid de celdas crudas (valor cacheado + texto de fórmula).
 * Salida: bloques salariales + actividades con componentes, raw values y
 * occurrence index. NUNCA evalúa fórmulas; NUNCA confía en subtotales del
 * Excel (quedan como evidencia de comparación).
 */
import type { DecimalString } from '@/lib/utils/types';
import {
  cellNumber,
  cellText,
  normalizeDescription,
  normalizeLabel,
  type ApuCellGrid,
  type ApuColumn,
  type RawCell,
} from './sheet-model';
import {
  deriveSalaryRole,
  numberToDecimalString,
  type DerivedSalaryRole,
  type SalaryBlockInputs,
} from './salary';

/** Rol laboral reconocido (contrato §3.6: SOLO Oficial y Ayudante). */
export type RecognizedRole = 'oficial' | 'ayudante';

/** Integrante de cuadrilla reconocido en una fila M.O. */
export interface ParsedCrewMember {
  role: RecognizedRole;
  count: number;
}

/** Bloque salarial parseado y derivado. */
export interface ParsedSalaryRole {
  role: RecognizedRole | null;
  blockLabel: string;
  headerRow: number;
  derived: DerivedSalaryRole;
}

/** Componente parseado (raw values SIEMPRE preservados). */
export interface ParsedApuComponent {
  sourceRow: number;
  rawCode: string;
  description: string;
  rawUnit: string;
  kind: 'material' | 'labor' | 'equipment' | 'tool';
  quantity: DecimalString | null;
  wastePct: DecimalString;
  unitPrice: DecimalString | null;
  /** Subtotal del Excel (G cacheado) — EVIDENCIA, jamás fuente de verdad. */
  excelSubtotal: DecimalString | null;
  /** Cuadrilla reconocida (solo labor reconocida). */
  crew: ParsedCrewMember[] | null;
  /** Labor con descripción NO reconocida (no se inventa rol). */
  crewUnrecognized: boolean;
  warnings: string[];
  errors: string[];
}

/** Actividad parseada. */
export interface ParsedApuActivity {
  sourceRow: number;
  visibleCode: string;
  /** 1-based por código visible normalizado (códigos repetibles). */
  occurrenceIndex: number;
  description: string;
  rawUnit: string;
  /** Fracción [0,1] de herramienta menor derivada (§3.5); '0' si no aplica. */
  defaultToolPct: DecimalString;
  /** Costo total del Excel (G de TOTAL COSTO ACTIVIDAD) — evidencia. */
  excelTotal: DecimalString | null;
  /** Componentes SIN la fila de herramienta derivada (no es fila). */
  components: ParsedApuComponent[];
  warnings: string[];
  errors: string[];
}

/** Resultado completo del parseo estructurado. */
export interface ParsedApuSheet {
  salaryRoles: ParsedSalaryRole[];
  activities: ParsedApuActivity[];
  /** Advertencias a nivel de hoja. */
  warnings: string[];
  /** Errores críticos a nivel de hoja (bloquean confirmación). */
  errors: string[];
}

const TOTAL_ROW_LABEL = 'TOTAL COSTO ACTIVIDAD';
/** Patrón congelado §3.5: F = `G<fila>*<pct>%` o `G<fila>*<fracción>`. */
const DERIVED_TOOL_PCT = /^G(\d+)\s*\*\s*(\d+(?:\.\d+)?)\s*%$/i;
const DERIVED_TOOL_FRACTION = /^G(\d+)\s*\*\s*(0?\.\d+)$/i;
const CREW_MEMBER = /(\d+)\s*(AYUDANTES?|OFICIAL(?:ES)?)/g;

function getCell(
  grid: ApuCellGrid,
  row: number,
  col: ApuColumn,
): RawCell | undefined {
  return grid.get(row)?.[col];
}

function numToDec(n: number | null): DecimalString | null {
  return n === null ? null : numberToDecimalString(n);
}

/** Reconoce la cuadrilla de una descripción laboral (§3.6). */
export function parseCrewDescription(description: string): ParsedCrewMember[] {
  const normalized = normalizeLabel(description);
  const members: ParsedCrewMember[] = [];
  for (const match of normalized.matchAll(CREW_MEMBER)) {
    const countText = match[1];
    const roleText = match[2];
    if (countText === undefined || roleText === undefined) continue;
    const count = Number.parseInt(countText, 10);
    if (!Number.isFinite(count) || count <= 0) continue;
    const role: RecognizedRole = roleText.startsWith('AYUDANTE') ? 'ayudante' : 'oficial';
    const existing = members.find((m) => m.role === role);
    if (existing) {
      existing.count += count;
    } else {
      members.push({ role, count });
    }
  }
  return members;
}

/** Localiza la fila del header de actividades (`A=ID, B=DESCRIPCION, C=UND`). */
function findActivitiesHeaderRow(grid: ApuCellGrid, lastRow: number): number | null {
  for (let row = 1; row <= lastRow; row++) {
    const a = normalizeLabel(cellText(getCell(grid, row, 'A')));
    const b = normalizeLabel(cellText(getCell(grid, row, 'B')));
    const c = normalizeLabel(cellText(getCell(grid, row, 'C')));
    if (a === 'ID' && b === 'DESCRIPCION' && c === 'UND') return row;
  }
  return null;
}

/** Parsea los bloques salariales previos al header de actividades (§3.1). */
function parseSalaryBlocks(
  grid: ApuCellGrid,
  headerRow: number,
): ParsedSalaryRole[] {
  // Headers de bloque: A empieza con 'S-', B con texto, C vacía.
  const headerRows: Array<{ row: number; label: string }> = [];
  for (let row = 1; row < headerRow; row++) {
    const a = normalizeLabel(cellText(getCell(grid, row, 'A')));
    const b = cellText(getCell(grid, row, 'B'));
    const c = cellText(getCell(grid, row, 'C'));
    if (a.startsWith('S-') && b !== '' && c === '') {
      headerRows.push({ row, label: b });
    }
  }

  const blocks: ParsedSalaryRole[] = [];
  for (let i = 0; i < headerRows.length; i++) {
    const header = headerRows[i];
    if (!header) continue;
    const { row: blockRow, label } = header;
    const endRow = headerRows[i + 1]?.row ?? headerRow;
    const labelNorm = normalizeLabel(label);
    const role: RecognizedRole | null = labelNorm.includes('AYUDANTE')
      ? 'ayudante'
      : labelNorm.includes('OFICIAL')
        ? 'oficial'
        : null;

    const inputs: SalaryBlockInputs = {
      smlv: null,
      factor: null,
      transport: null,
      benefitsPct: null,
      socialSecurityPct: null,
      payrollTaxPct: null,
      uniformCost: null,
      uniformPeriodInverse: null,
      workingDaysMonth: null,
      workingHoursDay: null,
      hourlyExcel: null,
    };

    for (let row = blockRow + 1; row < endRow; row++) {
      const b = normalizeLabel(cellText(getCell(grid, row, 'B')));
      const c = normalizeLabel(cellText(getCell(grid, row, 'C')));
      if (b === '') continue;
      if (b.includes('SALARIO MINIMO')) {
        inputs.smlv = cellNumber(getCell(grid, row, 'F'));
        inputs.factor = cellNumber(getCell(grid, row, 'D'));
      } else if (b.includes('SUBSIDIO DE TRANSPORTE')) {
        inputs.transport = cellNumber(getCell(grid, row, 'F'));
      } else if (b.includes('PRESTACIONES')) {
        inputs.benefitsPct = cellNumber(getCell(grid, row, 'E'));
      } else if (b.includes('SEGURIDAD SOCIAL')) {
        inputs.socialSecurityPct = cellNumber(getCell(grid, row, 'E'));
      } else if (b.includes('PARAFISCALES')) {
        inputs.payrollTaxPct = cellNumber(getCell(grid, row, 'E'));
      } else if (b.includes('DOTACION')) {
        inputs.uniformCost = cellNumber(getCell(grid, row, 'F'));
        inputs.uniformPeriodInverse = cellNumber(getCell(grid, row, 'D'));
      } else if (b.includes('HORA')) {
        inputs.workingHoursDay = cellNumber(getCell(grid, row, 'D'));
        inputs.hourlyExcel = cellNumber(getCell(grid, row, 'F'));
      } else if (b.startsWith('COSTO SALARIO') && c === 'DIA') {
        inputs.workingDaysMonth = cellNumber(getCell(grid, row, 'D'));
      }
    }

    blocks.push({
      role,
      blockLabel: label,
      headerRow: blockRow,
      derived: deriveSalaryRole(inputs),
    });
  }
  return blocks;
}

interface OpenActivity {
  sourceRow: number;
  visibleCode: string;
  description: string;
  rawUnit: string;
  components: ParsedApuComponent[];
  warnings: string[];
  errors: string[];
}

/** Construye una fila de componente preservando raw values (§3.4). */
function parseComponentRow(
  grid: ApuCellGrid,
  row: number,
): ParsedApuComponent {
  const rawCode = cellText(getCell(grid, row, 'A'));
  const description = cellText(getCell(grid, row, 'B'));
  const rawUnit = cellText(getCell(grid, row, 'C'));
  const warnings: string[] = [];
  const errors: string[] = [];

  const qty = cellNumber(getCell(grid, row, 'D'));
  const wasteCell = getCell(grid, row, 'E');
  const waste = cellNumber(wasteCell);
  const price = cellNumber(getCell(grid, row, 'F'));
  const excelSubtotal = cellNumber(getCell(grid, row, 'G'));

  if (qty === null) errors.push(`Fila ${row}: cantidad/rendimiento (D) no numérico.`);
  if (price === null) errors.push(`Fila ${row}: precio unitario (F) no numérico.`);
  if (waste === null && wasteCell !== undefined && cellText(wasteCell) !== '') {
    warnings.push(`Fila ${row}: desperdicio (E) no numérico; se asume 0.`);
  }
  if (qty !== null && qty < 0) errors.push(`Fila ${row}: cantidad negativa.`);
  if (price !== null && price < 0) errors.push(`Fila ${row}: precio negativo.`);
  if (waste !== null && waste < 0) errors.push(`Fila ${row}: desperdicio negativo.`);

  const labelA = normalizeLabel(rawCode);
  const descNorm = normalizeDescription(description);
  let kind: ParsedApuComponent['kind'];
  if (labelA.startsWith('M.O')) {
    kind = 'labor';
  } else if (labelA === 'HERRAMIENTA') {
    kind = 'tool';
  } else if (descNorm.startsWith('alquiler')) {
    kind = 'equipment';
  } else {
    kind = 'material';
  }

  let crew: ParsedCrewMember[] | null = null;
  let crewUnrecognized = false;
  if (kind === 'labor') {
    const members = parseCrewDescription(description);
    if (members.length > 0) {
      crew = members;
    } else {
      crewUnrecognized = true;
      errors.push(
        `Fila ${row}: descripción laboral no reconocida ("${description}"). Solo se mapean Oficial y Ayudante; no se inventan roles.`,
      );
    }
  }

  return {
    sourceRow: row,
    rawCode,
    description,
    rawUnit,
    kind,
    quantity: numToDec(qty),
    wastePct: waste !== null && waste >= 0 ? numberToDecimalString(waste) : '0',
    unitPrice: numToDec(price),
    excelSubtotal: numToDec(excelSubtotal),
    crew,
    crewUnrecognized,
    warnings,
    errors,
  };
}

/**
 * Detección de herramienta menor DERIVADA (§3.5) al cerrar el bloque:
 * fila tool con D=1, E∈{0,vacío} y fórmula F = G<filaLabor>*<pct>.
 * Devuelve los componentes finales (sin la fila derivada) y la fracción.
 */
function resolveDerivedTool(
  grid: ApuCellGrid,
  open: OpenActivity,
): { components: ParsedApuComponent[]; defaultToolPct: DecimalString } {
  const laborRows = new Set(
    open.components.filter((c) => c.kind === 'labor').map((c) => c.sourceRow),
  );
  let defaultToolPct: DecimalString = '0';
  let derivedFound = false;
  const components: ParsedApuComponent[] = [];

  for (const component of open.components) {
    if (component.kind !== 'tool') {
      components.push(component);
      continue;
    }
    const fCell = getCell(grid, component.sourceRow, 'F');
    const formula = fCell?.f?.trim() ?? '';
    const pctMatch = DERIVED_TOOL_PCT.exec(formula);
    const fracMatch = pctMatch ? null : DERIVED_TOOL_FRACTION.exec(formula);
    const match = pctMatch ?? fracMatch;

    const qtyIsOne = component.quantity !== null && Number(component.quantity) === 1;
    const wasteIsZero = Number(component.wastePct) === 0;

    const refRowText = match?.[1];
    const pctText = match?.[2];
    if (match && refRowText !== undefined && pctText !== undefined && qtyIsOne && wasteIsZero) {
      const refRow = Number.parseInt(refRowText, 10);
      const pct = pctMatch
        ? numberToDecimalString(Number(pctText) / 100)
        : numberToDecimalString(Number(pctText));
      if (laborRows.has(refRow) && !derivedFound && Number(pct) >= 0 && Number(pct) <= 1) {
        // Herramienta derivada: NO es fila (contrato 4B.1 §6).
        defaultToolPct = pct;
        derivedFound = true;
        continue;
      }
      if (derivedFound) {
        component.warnings.push(
          `Fila ${component.sourceRow}: segunda herramienta derivada en el bloque; se conserva como herramienta explícita.`,
        );
      } else if (!laborRows.has(refRow)) {
        component.warnings.push(
          `Fila ${component.sourceRow}: la herramienta referencia una fila que no es mano de obra; se conserva como herramienta explícita.`,
        );
      }
    }
    components.push(component);
  }

  return { components, defaultToolPct };
}

/** Parsea la hoja APU completa (§3). */
export function parseApuSheet(grid: ApuCellGrid, lastRow: number): ParsedApuSheet {
  const sheetWarnings: string[] = [];
  const sheetErrors: string[] = [];

  const headerRow = findActivitiesHeaderRow(grid, lastRow);
  if (headerRow === null) {
    return {
      salaryRoles: [],
      activities: [],
      warnings: sheetWarnings,
      errors: ['No se encontró el encabezado de actividades (ID / DESCRIPCION / UND).'],
    };
  }

  const salaryRoles = parseSalaryBlocks(grid, headerRow);
  for (const block of salaryRoles) {
    if (block.role === null) {
      sheetWarnings.push(
        `Bloque salarial "${block.blockLabel}" no reconocido (solo Oficial/Ayudante); no se importa.`,
      );
    }
  }

  const activities: ParsedApuActivity[] = [];
  const occurrenceByCode = new Map<string, number>();
  let open: OpenActivity | null = null;

  const closeActivity = (excelTotal: DecimalString | null, totalMissing: boolean): void => {
    if (!open) return;
    const codeKey = normalizeLabel(open.visibleCode);
    const occurrence = (occurrenceByCode.get(codeKey) ?? 0) + 1;
    occurrenceByCode.set(codeKey, occurrence);

    const { components, defaultToolPct } = resolveDerivedTool(grid, open);
    const errors = [...open.errors];
    if (open.description === '') {
      errors.push(`Fila ${open.sourceRow}: la actividad no tiene descripción.`);
    }
    if (totalMissing) {
      errors.push(
        `Fila ${open.sourceRow}: la actividad "${open.visibleCode}" no tiene fila TOTAL COSTO ACTIVIDAD.`,
      );
    }
    if (components.length === 0) {
      errors.push(`Fila ${open.sourceRow}: la actividad no tiene componentes.`);
    }
    for (const component of components) {
      errors.push(...component.errors);
    }

    activities.push({
      sourceRow: open.sourceRow,
      visibleCode: open.visibleCode,
      occurrenceIndex: occurrence,
      description: open.description,
      rawUnit: open.rawUnit,
      defaultToolPct,
      excelTotal,
      components,
      warnings: open.warnings,
      errors,
    });
    open = null;
  };

  for (let row = headerRow + 1; row <= lastRow; row++) {
    const aText = cellText(getCell(grid, row, 'A'));
    const bText = cellText(getCell(grid, row, 'B'));
    const cText = cellText(getCell(grid, row, 'C'));
    if (aText === '' && bText === '' && cText === '') continue;

    const bNorm = normalizeLabel(bText);

    if (open !== null) {
      if (bNorm.startsWith(TOTAL_ROW_LABEL)) {
        const total = cellNumber(getCell(grid, row, 'G'));
        const current: OpenActivity = open;
        if (total === null) {
          current.warnings.push(
            `Fila ${row}: TOTAL COSTO ACTIVIDAD sin valor en G (sin evidencia de costo Excel).`,
          );
        }
        if (getCell(grid, row, 'H') !== undefined) {
          current.warnings.push(
            `Fila ${row}: celdas adicionales fuera del rango A–G; se ignoran.`,
          );
        }
        closeActivity(numToDec(total), false);
        continue;
      }
      if (bText !== '') {
        open.components.push(parseComponentRow(grid, row));
        continue;
      }
      continue;
    }

    // state = idle: ¿inicio de actividad?
    if (aText !== '' && bText !== '' && cText !== '') {
      open = {
        sourceRow: row,
        visibleCode: aText,
        description: bText,
        rawUnit: cText,
        components: [],
        warnings: [],
        errors: [],
      };
      continue;
    }
    if (bText !== '' && !bNorm.startsWith(TOTAL_ROW_LABEL)) {
      sheetWarnings.push(`Fila ${row}: fila fuera de un bloque de actividad; se ignora.`);
    }
  }

  if (open !== null) {
    closeActivity(null, true);
  }

  if (activities.length === 0) {
    sheetErrors.push('No se detectaron actividades en la hoja APU.');
  }

  return { salaryRoles, activities, warnings: sheetWarnings, errors: sheetErrors };
}
