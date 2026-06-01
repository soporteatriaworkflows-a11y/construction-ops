/**
 * page.tsx — Raíz `/`. Redirige según el modo de autenticación.
 *
 * Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §6`.
 *  - `demo`: `/` → `/dashboard` (fixture sanitizado).
 *  - `supabase`: el Proxy redirige `/` según sesión (→ `/login` o `/dashboard`).
 *    Este componente redirige a `/dashboard` por defecto (el Proxy ya filtró).
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
