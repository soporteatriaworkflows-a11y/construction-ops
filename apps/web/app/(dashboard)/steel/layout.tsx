/**
 * layout.tsx — Preview UIX de Steel Ops (Acero y Estructura Metálica).
 *
 * Gate único para todo el subárbol `/steel/*`: si `isSteelUixPreviewEnabled()`
 * es falso, la ruta completa se comporta como si no existiera (`notFound()`).
 * No es el flag final del blueprint — ver
 * `docs/STEEL_OPS_UIX_FLAG_CONTRACT.md`. No enlazado en el sidebar compartido.
 */
import { notFound } from 'next/navigation';
import { isSteelUixPreviewEnabled } from '@/lib/steel/preview-gate';
import { SteelSubNav } from './_components/steel-sub-nav';

export const dynamic = 'force-dynamic';

export default async function SteelPreviewLayout({ children }: { children: React.ReactNode }) {
  const enabled = await isSteelUixPreviewEnabled();
  if (!enabled) {
    notFound();
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" role="note">
        Vista previa interna — Acero y Estructura Metálica. Datos de ejemplo (mock), sin conexión a
        base de datos ni Supabase. Solo visible con <code>STEEL_OPS_UIX_PREVIEW=true</code> para
        roles admin/gerencia/presupuestos.
      </div>
      <SteelSubNav />
      {children}
    </div>
  );
}
