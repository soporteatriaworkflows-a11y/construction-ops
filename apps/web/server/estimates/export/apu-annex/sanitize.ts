/**
 * sanitize.ts — Saneamiento de texto para exportaciones (APU_EXPORTS_V1).
 *
 * - Excel: protección contra formula/CSV injection. Toda celda de TEXTO cuyo
 *   valor empiece por `=`, `+`, `-`, `@`, TAB, CR o LF se prefija con apóstrofo
 *   para forzar texto literal (las celdas numéricas no son vector de inyección).
 * - PDF/Excel: normalización defensiva (elimina caracteres de control, recorta
 *   longitud) antes de renderizar. Nunca interpreta HTML.
 *
 * Contrato §7, §8.
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@'];
const DEFAULT_MAX = 2000;

/** `true` si el código de carácter es un control C0/C1 (incl. TAB/CR/LF). */
function isControlCode(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** Quita caracteres de control (C0/C1, incl. TAB/CR/LF) y recorta longitud. */
export function cleanText(value: string | null | undefined, max = DEFAULT_MAX): string {
  if (value == null) return '';
  let out = '';
  const str = String(value);
  for (let i = 0; i < str.length; i++) {
    out += isControlCode(str.charCodeAt(i)) ? ' ' : str[i];
  }
  const collapsed = out.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

/**
 * Devuelve un valor de celda Excel SEGURO para texto. Si tras limpiar empieza
 * por un disparador de fórmula, se prefija con apóstrofo (texto literal en
 * Excel/Sheets). Vacío ⇒ cadena vacía.
 */
export function safeCell(value: string | null | undefined, max = DEFAULT_MAX): string {
  const text = cleanText(value, max);
  if (text === '') return '';
  return FORMULA_TRIGGERS.includes(text[0]!) ? `'${text}` : text;
}

/** `true` si el texto LIMPIO dispararía una fórmula (para tests). */
export function isFormulaInjection(value: string | null | undefined): boolean {
  const text = cleanText(value);
  return text !== '' && FORMULA_TRIGGERS.includes(text[0]!);
}
