/**
 * layout.tsx — Guard server-side del subárbol /catalog (V5.6.2).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_2_ROLE_ACCESS_MATRIX_HARDENING.md`.
 *
 * Endurecimiento app-layer: exige acceso al módulo `catalog` para TODO /catalog
 * (deny-by-default → `obra`/`consulta` redirigen a /dashboard). Las sub-rutas
 * más restrictivas (price-intelligence, monitoring, operational-review) añaden
 * SU PROPIO guard de módulo en su page.tsx. RLS sigue siendo el backstop real.
 */
import type { ReactNode } from 'react';
import { requireModuleAccess } from '@/server/access';

export const dynamic = 'force-dynamic';

export default async function CatalogLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess('catalog');
  return <>{children}</>;
}
