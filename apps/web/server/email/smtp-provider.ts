/**
 * smtp-provider.ts - Proveedor SMTP corporativo (producción).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §6`.
 *
 * `nodemailer` es una dependencia OPCIONAL cargada por import dinámico: el build
 * NO la requiere (el especificador es una variable, el bundler no la resuelve en
 * estático). Si falta la dependencia o la conexión falla, `send()` devuelve un
 * resultado `delivered:false` y el llamador cae al `LogEmailProvider`
 * (fallback documentado). NUNCA se hardcodean secretos: todo viene de env.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
}

/** Forma mínima del transporte (evita depender de los tipos de nodemailer). */
interface MinimalTransport {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export class SmtpEmailProvider implements EmailProvider {
  readonly id = 'smtp' as const;
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let transport: MinimalTransport;
    try {
      // webpackIgnore: true suprime el warning de Webpack/Turbopack cuando
      // nodemailer no está instalado. La dependencia es OPCIONAL: si no existe
      // el catch devuelve failed sin exponer secretos.
      const moduleName = 'nodemailer';
      const mod = (await import(/* webpackIgnore: true */ moduleName)) as {
        createTransport: (opts: unknown) => MinimalTransport;
      };
      transport = mod.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
      });
    } catch {
      // nodemailer no instalado en este entorno: fallo tipado sin secretos.
      return { status: 'failed', delivered: false, provider: 'smtp', errorCode: 'smtp_dependency_missing', detail: 'nodemailer no disponible; configure la dependencia para SMTP real' };
    }

    try {
      const info = await transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      const messageId = typeof info === 'object' && info && 'messageId' in info ? String((info as { messageId?: unknown }).messageId ?? '') : undefined;
      return { status: 'sent', delivered: true, provider: 'smtp', messageId: messageId || undefined };
    } catch {
      // Error de envío (host/credenciales/red). NUNCA exponer secretos.
      return { status: 'failed', delivered: false, provider: 'smtp', errorCode: 'smtp_send_failed', detail: 'fallo de envio SMTP; revise configuracion de host/credenciales' };
    }
  }
}

/**
 * Lee la configuración SMTP de env. Devuelve `null` si falta alguna variable
 * obligatoria (=> el factory usa LogEmailProvider).
 */
export function readSmtpConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const portRaw = env.SMTP_PORT?.trim();
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  const from = env.SMTP_FROM?.trim();
  if (!host || !portRaw || !user || !password || !from) {
    return null;
  }
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }
  return {
    host,
    port,
    user,
    password,
    from,
    secure: env.SMTP_SECURE?.trim().toLowerCase() === 'true' || port === 465,
  };
}
