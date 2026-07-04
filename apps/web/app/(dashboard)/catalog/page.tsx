/**
 * Pagina de catalogo de recursos — Oleada 3A + Bootstrap CTAs.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canonico (@/server/read-model) en lugar de mocks estaticos.
 * NO importa @/lib/utils/mocks. NO expone campos (precios internos, SKU, etc.).
 * budgetReferencePrice es cliente-safe y se muestra solo si esta disponible.
 */
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OperationsHeader } from '@/components/shared/operations-header';
import { KpiCard, KpiBand } from '@/components/shared/kpi-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { CatalogExplorer } from './catalog-explorer';
import { isOldPrice } from '@/lib/catalog/price-age';
import { getFriendlyDataLoadError } from '@/lib/db/errors';
import type { CatalogResourceView } from '@/lib/contracts/read-model';

// Render request-time: viewer real por modo (db=autenticado, fixture=demo).
export const dynamic = 'force-dynamic';

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const oneStr = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
  const initStatus = oneStr(sp.status) || 'all';
  const initProvider = oneStr(sp.provider) || 'all';
  const initAge = oneStr(sp.age) || 'all';
  const rm = getReadModel();
  let resources: CatalogResourceView[] = [];
  let viewerRole: string = 'consulta';
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    viewerRole = viewer.role;
    resources = await rm.listCatalogResources(viewer);
  } catch (e) {
    error = getFriendlyDataLoadError(e, 'No pudimos cargar el catálogo en este momento. Intenta actualizar en unos segundos.');
  }

  const authMode = resolveAuthMode();
  const CREATE_ROLES = ['management', 'internal'] as const;
  const canCreate =
    isCreationModeEnabled() && (CREATE_ROLES as readonly string[]).includes(viewerRole);
  const isDemoMode = authMode === 'demo';

  const disabledNotice = !canCreate
    ? isDemoMode
      ? 'Modo demostración: puedes explorar el catálogo. Para crear recursos, inicia sesión con datos reales.'
      : 'No tienes permisos para crear registros. Solicita acceso a un administrador.'
    : null;

  if (error) {
    return (
      <div>
        <PageHeader title="Catálogo de Recursos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      </div>
    );
  }

  // CTA primario: importación masiva (flujo principal). La ruta /catalog/import
  // siempre es navegable: explica el modo demo/read-only sin botones rotos.
  const headerActions = (
    <>
      <Button asChild size="sm">
        <Link href="/catalog/import">Importar catálogo</Link>
      </Button>
      {canCreate ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/catalog/resources/new">Nuevo recurso</Link>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled
          title={
            isDemoMode
              ? 'Disponible con datos reales — inicia sesión para crear recursos'
              : 'Sin permisos de creación — solicita acceso a un administrador'
          }
          aria-disabled="true"
        >
          Nuevo recurso
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/providers">Gestionar proveedores</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/monitoring">Monitoreo</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/prices/review">Revisión de precios</Link>
      </Button>
    </>
  );

  const emptyStateAction = (
    <div className="flex flex-col items-center gap-1.5">
      <Button asChild>
        <Link href="/catalog/import">Importar catálogo</Link>
      </Button>
      {disabledNotice && (
        <p className="text-xs text-amber-700" role="note">
          {disabledNotice}
        </p>
      )}
    </div>
  );

  const emptyStateSecondary = canCreate ? (
    <Button variant="outline" asChild>
      <Link href="/catalog/resources/new">Crear recurso manualmente</Link>
    </Button>
  ) : (
    <Button
      variant="outline"
      disabled
      aria-disabled="true"
      title={
        isDemoMode
          ? 'Disponible con datos reales — inicia sesión para crear recursos'
          : 'Sin permisos de creación — solicita acceso a un administrador'
      }
    >
      Crear recurso manualmente
    </Button>
  );

  const catApproved = resources.filter((r) => r.priceStatus === 'approved').length;
  const catPending = resources.filter((r) => r.priceStatus === 'pending').length;
  const catNoSupplier = resources.filter((r) => !r.supplierName).length;
  const catNoPrice = resources.filter((r) => !r.priceStatus || r.priceStatus === 'none').length;
  // Antigüedad (heurística UI ≥90d; NO "vencido" autoritativo) sobre priceDate existente.
  const catOld = resources.filter((r) => isOldPrice(r.priceDate)).length;

  return (
    <div>
      <OperationsHeader
        eyebrow="Catálogo"
        title="Control de precios"
        subtitle="Materiales, mano de obra y equipos disponibles para APU y BOQ"
        stat={{ label: 'Recursos', value: String(resources.length) }}
        actions={headerActions}
      />

      {resources.length > 0 && (
        <KpiBand className="mb-4">
          <KpiCard label="Aprobados" value={catApproved} tone={catApproved > 0 ? 'ok' : 'default'} href="/catalog?status=approved" hint="Precio confiable" />
          <KpiCard label="Pendientes" value={catPending} tone={catPending > 0 ? 'warn' : 'default'} href="/catalog?status=pending" hint="Por revisar" />
          <KpiCard label="Sin precio" value={catNoPrice} tone={catNoPrice > 0 ? 'warn' : 'ok'} href="/catalog?status=none" hint="Falta precio" />
          <KpiCard label="Sin proveedor" value={catNoSupplier} tone={catNoSupplier > 0 ? 'warn' : 'default'} href="/catalog?provider=missing" hint="Sin fuente" />
          <KpiCard label="Precios antiguos" value={catOld} tone={catOld > 0 ? 'warn' : 'ok'} href="/catalog?age=old" hint={`+90 días`} />
          <KpiCard label="Revisar precios" value="Abrir" href="/catalog/prices/review" hint="Aprobación en bloque" />
        </KpiBand>
      )}

      {disabledNotice && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
          role="note"
          aria-label={isDemoMode ? 'Modo demostración activo' : 'Acceso de solo lectura'}
        >
          {disabledNotice}
        </div>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Catálogo vacío"
          description="Carga recursos desde Excel o CSV. La creación manual queda disponible para casos puntuales."
          action={emptyStateAction}
          secondaryAction={emptyStateSecondary}
        />
      ) : (
        <CatalogExplorer resources={resources} initialStatus={initStatus} initialProvider={initProvider} initialAge={initAge} />
      )}

      {/* Nota de privacidad — campos internos no mostrados */}
      {/* negotiated_discount_pct, observedPrice, supplierSku, productUrl,
          locationReference y ahorros son campos 🔒 y NO se muestran aquí. */}

      {/* Deuda: CATALOG_BULK_ONBOARDING_V1 — importación masiva de recursos diferida */}
    </div>
  );
}
