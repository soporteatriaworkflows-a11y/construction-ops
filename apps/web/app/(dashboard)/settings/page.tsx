/**
 * /settings — Índice de configuración. Por ahora redirige a Accesos.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SettingsIndexPage() {
  redirect('/settings/access');
}
