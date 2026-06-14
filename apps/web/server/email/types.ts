/**
 * types.ts — Contratos del email transaccional (OPERATIONAL_ACCESS_AND_SMTP_V1).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §5-6,§10`.
 *
 * Un `EmailProvider` envía un `EmailMessage` ya renderizado. En dev/test el
 * proveedor por defecto (`LogEmailProvider`) NO envía nada real: captura
 * metadatos NO sensibles. NUNCA se registran tokens ni contraseñas.
 */

/** Mensaje de correo ya renderizado, listo para enviar. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Etiqueta del tipo de plantilla (para auditoría/diagnóstico, sin PII sensible). */
  kind: EmailKind;
}

export type EmailKind =
  | 'invitation'
  | 'invitation_resent'
  | 'password_reset'
  | 'access_revoked';

/** Resultado del envío. `provider` identifica qué transporte se usó. */
export interface EmailSendResult {
  delivered: boolean;
  provider: 'log' | 'smtp';
  /** true cuando se cayó a Log por ausencia/fallo de SMTP (fallback controlado). */
  fallback?: boolean;
  /** Mensaje legible para diagnóstico; NUNCA incluye secretos. */
  detail?: string;
}

/** Abstracción de envío. Implementaciones: LogEmailProvider, SmtpEmailProvider. */
export interface EmailProvider {
  readonly id: 'log' | 'smtp';
  send(message: EmailMessage): Promise<EmailSendResult>;
}
