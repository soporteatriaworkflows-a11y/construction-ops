/**
 * log-provider.ts — Proveedor de email para DEV/TEST: NO envía nada real.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §6,§10`.
 *
 * Captura el mensaje completo en una bandeja en memoria (`outbox`) para que los
 * tests verifiquen asunto/cuerpo, y registra en consola SOLO metadatos NO
 * sensibles (`kind`, `to`, `subject`). NUNCA loguea el html/text (que contienen
 * el enlace con token) ni contraseñas.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

export class LogEmailProvider implements EmailProvider {
  readonly id = 'log' as const;
  /** Bandeja en memoria. Los tests la inspeccionan; no persiste entre procesos. */
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.outbox.push(message);
    // Solo metadatos no sensibles. NO se loguea el cuerpo (contiene el token).
    console.info(
      `[email:log] kind=${message.kind} to=${message.to} subject="${message.subject}" (no enviado: proveedor de desarrollo)`,
    );
    return { delivered: true, provider: 'log', detail: 'captured (no real send)' };
  }

  /** Último mensaje capturado (utilidad para tests). */
  last(): EmailMessage | undefined {
    return this.outbox[this.outbox.length - 1];
  }

  /** Vacía la bandeja (utilidad para tests). */
  clear(): void {
    this.outbox.length = 0;
  }
}
