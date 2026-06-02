/**
 * client.ts — Cliente Supabase para el NAVEGADOR (browser).
 *
 * Propiedad: orquestador (runtime auth 4A.2). Contrato:
 * `docs/AUTH_RUNTIME_CONTRACT.md §7`.
 *
 * Usa SOLO la clave publishable/anon (PÚBLICA). NUNCA service_role.
 * `@supabase/ssr` gestiona las cookies del navegador automáticamente.
 */
import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from './env';

/**
 * Crea un cliente Supabase para componentes de cliente ('use client').
 * Seguro para el navegador: solo expone la clave publishable.
 */
export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
