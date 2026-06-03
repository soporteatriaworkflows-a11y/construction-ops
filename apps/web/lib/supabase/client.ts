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
 *
 * IMPORTANTE (inlining de Next): el navegador NO tiene `process.env` real; Next
 * sustituye en build SOLO las referencias LITERALES `process.env.NEXT_PUBLIC_*`.
 * El acceso indirecto (`env.NEXT_PUBLIC_*` con `env = process.env`) NO se inyecta
 * y resulta `undefined` en el bundle del navegador, lo que hacía que
 * `getPublicSupabaseEnv()` lanzara y `signInWithPassword()` nunca se ejecutara.
 * Por eso aquí pasamos un objeto con las referencias literales inyectables.
 * No usar `getPublicSupabaseEnv()` sin argumentos desde código de navegador.
 */
export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return createBrowserClient(url, publishableKey);
}
