/**
 * index.ts — Punto de entrada del email transaccional + factory.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §6,§10`.
 *
 * Selección de proveedor (deny-by-real-send-default):
 *   - `EMAIL_PROVIDER=log`           ⇒ LogEmailProvider (no envía real).
 *   - SMTP_* completas (o `EMAIL_PROVIDER=smtp`) ⇒ SmtpEmailProvider con
 *     fallback a Log si el envío no se concreta (dependencia/credenciales).
 *   - Sin configuración ⇒ LogEmailProvider (default dev/test).
 *
 * `sendTransactionalEmail` es el único punto que el dominio usa para enviar.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';
import { LogEmailProvider } from './log-provider';
import { SmtpEmailProvider, readSmtpConfigFromEnv } from './smtp-provider';

export * from './types';
export * from './templates';
export { LogEmailProvider } from './log-provider';
export { SmtpEmailProvider, readSmtpConfigFromEnv } from './smtp-provider';

/** Singleton Log compartido por la app (bandeja inspeccionable en dev). */
let defaultLog: LogEmailProvider | null = null;
export function getDefaultLogProvider(): LogEmailProvider {
  if (!defaultLog) defaultLog = new LogEmailProvider();
  return defaultLog;
}

/**
 * Resuelve el proveedor activo según env. No envía nada; solo decide transporte.
 */
export function resolveEmailProvider(
  env: NodeJS.ProcessEnv = process.env,
): EmailProvider {
  const explicit = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'log') {
    return getDefaultLogProvider();
  }
  const smtp = readSmtpConfigFromEnv(env);
  if (explicit === 'smtp' || smtp) {
    if (smtp) return new SmtpEmailProvider(smtp);
    // Pidieron smtp pero faltan variables → Log (fallback documentado).
  }
  return getDefaultLogProvider();
}

/**
 * Envía un correo transaccional. Si el proveedor primario es SMTP y NO concreta
 * la entrega (dependencia ausente o error), cae al LogEmailProvider para no
 * romper el flujo de negocio (fallback controlado y registrado).
 */
export async function sendTransactionalEmail(
  message: EmailMessage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmailSendResult> {
  const provider = resolveEmailProvider(env);
  const result = await provider.send(message);
  if (!result.delivered && provider.id === 'smtp') {
    const fallback = await getDefaultLogProvider().send(message);
    return { ...fallback, fallback: true, detail: result.detail ?? 'fallback a log' };
  }
  return result;
}
