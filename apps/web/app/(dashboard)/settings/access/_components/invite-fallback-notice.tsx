'use client';

import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccessActionResult } from '../actions';

interface InviteFallbackNoticeProps {
  inviteLink: string;
  deliveryStatus?: AccessActionResult['deliveryStatus'];
  deliveryLabel?: AccessActionResult['deliveryLabel'];
  compact?: boolean;
}

const FALLBACK_MESSAGE =
  'El correo no se envio automaticamente. Comparte este enlace con la persona invitada.';

export function InviteFallbackNotice({
  inviteLink,
  deliveryStatus = 'logged',
  deliveryLabel,
  compact = false,
}: InviteFallbackNoticeProps) {
  const [copied, setCopied] = useState(false);
  const failed = deliveryStatus === 'failed';

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className={
        failed
          ? 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'
          : 'rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">{deliveryLabel ?? 'No enviado, usar enlace'}</p>
            {!compact && <p>{FALLBACK_MESSAGE}</p>}
          </div>
          <code className="block break-all rounded bg-white/75 px-2 py-1 text-xs text-inherit">
            {inviteLink}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
