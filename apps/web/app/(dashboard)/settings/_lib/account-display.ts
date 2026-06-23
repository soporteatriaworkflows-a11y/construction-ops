/**
 * account-display.ts — Helpers de presentación de cuenta SERVER-SAFE
 * (HOTFIX_SETTINGS_ROUTE_ERROR_V1).
 *
 * `initialsFromEmail` vivía solo en `account-menu.tsx` (`'use client'`). En
 * Next 16 INVOCAR una función exportada por un módulo cliente desde un Server
 * Component lanza ("Attempted to call … from the server but … is on the
 * client"), lo que tumbaba `/settings` y `/settings/account` con 500. Esta copia
 * pura (sin `'use client'`) es segura de llamar en el servidor. Lógica idéntica;
 * misma cobertura de tests.
 */

/** Iniciales (máx 2) a partir del email; respaldo "U". PURA, server-safe. */
export function initialsFromEmail(email: string | null | undefined): string {
  if (!email) return 'U';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : local.slice(0, 2)) || 'U';
  return letters.toUpperCase();
}
