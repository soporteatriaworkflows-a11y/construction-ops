export const DB_POOL_EXHAUSTED_MESSAGE =
  'No pudimos cargar esta sección por saturación temporal de la base de datos. Intenta actualizar en unos segundos.';

const POOL_EXHAUSTION_TOKENS = [
  'EMAXCONNSESSION',
  'max clients reached in session mode',
  'pool_size',
] as const;

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const cause = 'cause' in error ? errorText(error.cause) : '';
    return `${error.name} ${error.message} ${cause}`;
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const fields = ['code', 'name', 'message', 'detail', 'hint', 'cause']
      .map((key) => errorText(record[key]))
      .filter(Boolean);
    return fields.join(' ');
  }
  return String(error);
}

export function isDbPoolExhaustedError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return POOL_EXHAUSTION_TOKENS.some((token) => text.includes(token.toLowerCase()));
}

export function getFriendlyDataLoadError(
  error: unknown,
  fallback = 'No pudimos cargar los datos en este momento. Intenta actualizar en unos segundos.',
): string {
  return isDbPoolExhaustedError(error) ? DB_POOL_EXHAUSTED_MESSAGE : fallback;
}