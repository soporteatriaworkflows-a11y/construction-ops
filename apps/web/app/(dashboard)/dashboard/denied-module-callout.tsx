'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ACCESS_MODULE_LABELS } from '@/lib/access/module-labels';
import type { AccessModule } from '@/server/access/module-access';

export function DeniedModuleCallout({ module }: { module: AccessModule }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const label = ACCESS_MODULE_LABELS[module];

  return (
    <div
      className="mb-5 flex items-start gap-3 rounded-xl border border-iconic-soft-blue bg-surface-soft px-4 py-3 text-sm text-content"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Modulo no disponible para tu perfil</p>
        <p className="mt-0.5 text-content-muted">
          {label} esta habilitado para los equipos correspondientes. Si tu trabajo lo requiere,
          pidele el ajuste a tu administrador en ICONIC.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Descartar aviso"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
