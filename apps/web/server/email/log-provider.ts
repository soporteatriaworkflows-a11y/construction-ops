/**
 * log-provider.ts - Proveedor de email para DEV/TEST: NO envia nada real.
 *
 * Captura el mensaje completo en una bandeja en memoria (`outbox`) para tests,
 * y registra en consola SOLO metadatos NO sensibles. NUNCA loguea html/text,
 * tokens, enlaces completos ni correos completos.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export class LogEmailProvider implements EmailProvider {
  readonly id = 'log' as const;
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.outbox.push(message);
    console.info(
      `[email:log] kind=${message.kind} to=${maskEmail(message.to)} subject="${message.subject}" (no enviado: proveedor de desarrollo)`,
    );
    return { status: 'logged', delivered: false, provider: 'log', detail: 'captured (no real send)' };
  }

  last(): EmailMessage | undefined {
    return this.outbox[this.outbox.length - 1];
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
