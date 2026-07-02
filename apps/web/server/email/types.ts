/**
 * types.ts  Contratos del email transaccional (OPERATIONAL_ACCESS_AND_SMTP_V1).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md ?5-6,?10`.
 *
 * Un `EmailProvider` envia un `EmailMessage` ya renderizado. En dev/test el
 * proveedor por defecto (`LogEmailProvider`) NO envia nada real: captura
 * metadatos NO sensibles. NUNCA se registran tokens ni contrase?as.
 */

/** Mensaje de correo ya renderizado, listo para enviar. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Etiqueta del tipo de plantilla (para auditoria/diagnostico, sin PII sensible). */
  kind: EmailKind;
}

export type EmailKind =
  | 'invitation'
  | 'invitation_resent'
  | 'password_reset'
  | 'access_revoked';

export type EmailDeliveryStatus = 'sent' | 'logged' | 'failed';

export type EmailProviderId = 'log' | 'smtp' | 'unknown';

/** Resultado del envio. `provider` identifica que transporte se uso. */
export interface EmailSendResult {
  /** `sent` = envio real; `logged` = capturado por LogEmailProvider; `failed` = intento real fallo. */
  status: EmailDeliveryStatus;
  /** Compatibilidad: true solo cuando hubo envio real. */
  delivered: boolean;
  provider: EmailProviderId;
  /** true cuando se uso un fallback controlado. */
  fallback?: boolean;
  messageId?: string;
  errorCode?: string;
  /** Mensaje legible para diagnostico; NUNCA incluye secretos. */
  detail?: string;
}

/** Abstracci?n de envio. Implementaciones: LogEmailProvider, SmtpEmailProvider. */
export interface EmailProvider {
  readonly id: EmailProviderId;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailDeliveryHealth {
  providerName: EmailProviderId;
  isRealSender: boolean;
  deliveryMode: 'sent-capable' | 'logged' | 'failed-capable';
}
