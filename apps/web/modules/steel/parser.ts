import type { DecimalString } from '@/lib/utils/types';

import { addDecimalStrings, divideDecimalStrings, toDecimal, toDecimalString } from './decimal';
import type { SteelParsedDescription, SteelParseOptions, SteelShape } from './types';

const ENCODED_REBAR_PATTERN = /^\s*(?:(\d+)\s*[xX]\s*)?(\d+)\s*(E)?\s*#\s*(\d{2,5})(?:\s*@\s*(\d+(?:[.,]\d+)?)\s*CM)?\s*$/i;
const EXPLICIT_LENGTH_PATTERN = /#\s*(\d{1,2}).*?\bL\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*(CM|M))?/i;
const SEGMENT_PATTERN = /^\s*(\d+(?:[.,]\d+)?)(?:\s*\+\s*\d+(?:[.,]\d+)?)+\s*$/;

export function parseSteelDescription(
  originalDescription: string,
  options: SteelParseOptions = {},
): SteelParsedDescription {
  const description = originalDescription.trim();

  if (!description) {
    return unknownParse(originalDescription, 'Descripcion vacia.');
  }

  if (SEGMENT_PATTERN.test(description)) {
    return parseSegmentedLength(originalDescription, description);
  }

  const explicit = description.match(EXPLICIT_LENGTH_PATTERN);
  if (explicit) {
    const barToken = explicit[1];
    const lengthToken = explicit[2];
    if (!barToken || !lengthToken) {
      return unknownParse(originalDescription, 'Longitud explicita incompleta.');
    }
    const barNumber = Number(barToken);
    const rawLength = normalizeDecimal(lengthToken);
    const unit = explicit[3]?.toUpperCase() ?? options.defaultUnit ?? 'm';
    const cutLengthM = unit === 'CM' || unit === 'cm' ? cmToM(rawLength) : rawLength;

    return {
      originalDescription,
      steelFamily: 'rebar',
      steelShape: 'straight',
      barNumber,
      quantityPerUnit: '1',
      repetitions: '1',
      cutLengthM,
      lengthSource: unit === 'CM' || unit === 'cm' ? 'explicit_cm' : 'explicit_m',
      confidenceScore: '0.9',
      needsReview: false,
      explanation: `Lei varilla #${barNumber} con longitud explicita ${cutLengthM} m.`,
    };
  }

  const encoded = description.match(ENCODED_REBAR_PATTERN);
  if (encoded) {
    return parseEncodedRebar(originalDescription, encoded);
  }

  return unknownParse(originalDescription, 'No se reconocio un patron de despiece soportado en F1.');
}

function parseEncodedRebar(
  originalDescription: string,
  match: RegExpMatchArray,
): SteelParsedDescription {
  const groups = match[1] ? normalizeInteger(match[1]) : '1';
  const quantityToken = match[2];
  const encoded = match[4];
  if (!quantityToken || !encoded) {
    return unknownParse(originalDescription, 'Notacion compacta incompleta.');
  }
  const quantity = normalizeInteger(quantityToken);
  const isStirrup = Boolean(match[3]);
  const spacingCm = match[5] ? normalizeDecimal(match[5]) : undefined;
  const { barNumber, lengthCm } = splitEncodedBarAndLength(encoded);
  const cutLengthM = cmToM(lengthCm);
  const repetitions = groups;
  const quantityPerUnit = quantity;
  const totalPieces = toDecimalString(toDecimal(quantityPerUnit).times(toDecimal(repetitions)));
  const steelShape: SteelShape = isStirrup ? 'stirrup' : 'straight';
  const hasAmbiguousCompactLength = encoded.length >= 4;

  return {
    originalDescription,
    steelFamily: 'rebar',
    steelShape,
    barNumber,
    quantityPerUnit,
    repetitions,
    cutLengthM,
    lengthSource: 'encoded_cm',
    spacingCm,
    confidenceScore: spacingCm ? '0.78' : hasAmbiguousCompactLength ? '0.82' : '0.7',
    needsReview: Boolean(spacingCm),
    explanation: [
      `Lei ${totalPieces} ${isStirrup ? 'estribos' : 'barras'} #${barNumber} de ${lengthCm} cm (${cutLengthM} m).`,
      groups !== '1' ? `Cantidad derivada de ${groups} grupos x ${quantity}.` : undefined,
      hasAmbiguousCompactLength
        ? 'Convencion F1: en notacion compacta despues de #, el primer digito es el numero de varilla y el resto es longitud en cm salvo #10-#18 explicito.'
        : undefined,
      spacingCm ? `Separacion detectada @ ${spacingCm} cm; requiere revisar luz/cantidad.` : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function parseSegmentedLength(originalDescription: string, description: string): SteelParsedDescription {
  const segmentsM = description.split('+').map((segment) => cmToM(normalizeDecimal(segment.trim())));
  const cutLengthM = addDecimalStrings(segmentsM);

  return {
    originalDescription,
    steelFamily: 'rebar',
    steelShape: 'stirrup',
    quantityPerUnit: '1',
    repetitions: '1',
    cutLengthM,
    lengthSource: 'segmented_length',
    bendSegmentsM: segmentsM,
    confidenceScore: '0.86',
    needsReview: false,
    explanation: `Sume segmentos de doblez/tramo (${segmentsM.join(' + ')} m) para longitud total ${cutLengthM} m.`,
  };
}

function splitEncodedBarAndLength(encoded: string): { barNumber: number; lengthCm: DecimalString } {
  const firstTwo = Number(encoded.slice(0, 2));
  if (firstTwo >= 10 && firstTwo <= 18 && encoded.length > 3) {
    return { barNumber: firstTwo, lengthCm: trimLeadingZeros(encoded.slice(2)) };
  }
  return { barNumber: Number(encoded.slice(0, 1)), lengthCm: trimLeadingZeros(encoded.slice(1)) };
}

function cmToM(value: DecimalString): DecimalString {
  return divideDecimalStrings(value, '100');
}

function normalizeDecimal(value: string): DecimalString {
  return value.replace(',', '.');
}

function normalizeInteger(value: string): DecimalString {
  return String(Number(value));
}

function trimLeadingZeros(value: string): DecimalString {
  const trimmed = value.replace(/^0+(?=\d)/, '');
  return trimmed || '0';
}

function unknownParse(originalDescription: string, explanation: string): SteelParsedDescription {
  return {
    originalDescription,
    steelFamily: 'other',
    steelShape: 'other',
    quantityPerUnit: '0',
    repetitions: '0',
    lengthSource: 'unknown',
    confidenceScore: '0',
    needsReview: true,
    explanation,
  };
}
