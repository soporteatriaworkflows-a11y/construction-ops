'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { archiveApuAction } from '../new/actions';

interface ArchiveApuButtonProps {
  apuTemplateId: string;
}

export function ArchiveApuButton({ apuTemplateId }: ArchiveApuButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!showConfirm) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setShowConfirm(true)}
      >
        Archivar APU
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">¿Archivar este APU?</p>
      <p className="text-xs text-red-700">
        El APU quedará inactivo y no podrá agregarse a presupuestos. Esta acción
        no se puede deshacer desde aquí; usa &quot;Duplicar para corregir&quot; si
        necesitas una versión editada.
      </p>
      <div className="space-y-1">
        <label className="text-xs font-medium text-red-800">
          Razón (obligatoria)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: APU creado con valores incorrectos"
          className="w-full rounded-md border border-red-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
          maxLength={200}
          disabled={isPending}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white"
          disabled={isPending || reason.trim() === ''}
          onClick={() => {
            startTransition(async () => {
              const result = await archiveApuAction(apuTemplateId, reason);
              if (result.success) {
                router.refresh();
              } else {
                setError(result.error ?? 'Error desconocido');
              }
            });
          }}
        >
          {isPending ? 'Archivando…' : 'Confirmar archivo'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowConfirm(false);
            setError(null);
          }}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
