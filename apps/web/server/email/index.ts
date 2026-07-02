/**
 * index.ts - Punto de entrada del email transaccional + factory.
 *
 * V5.6.3A: distingue entrega real (`sent`) de captura local (`logged`) y fallo
 * real (`failed`). No convierte LogEmailProvider en exito silencioso.
 */
import type { EmailDeliveryHealth, EmailMessage, EmailProvider, EmailSendResult } from './types';
import { LogEmailProvider } from './log-provider';
import { SmtpEmailProvider, readSmtpConfigFromEnv } from './smtp-provider';

export * from './types';
export * from './templates';
export { LogEmailProvider } from './log-provider';
export { SmtpEmailProvider, readSmtpConfigFromEnv } from './smtp-provider';

let defaultLog: LogEmailProvider | null = null;
export function getDefaultLogProvider(): LogEmailProvider {
  if (!defaultLog) defaultLog = new LogEmailProvider();
  return defaultLog;
}

export function resolveEmailProvider(
  env: NodeJS.ProcessEnv = process.env,
): EmailProvider {
  const explicit = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'log') return getDefaultLogProvider();

  const smtp = readSmtpConfigFromEnv(env);
  if (explicit === 'smtp' || smtp) {
    if (smtp) return new SmtpEmailProvider(smtp);
    return getDefaultLogProvider();
  }
  return getDefaultLogProvider();
}

export function getEmailDeliveryHealth(env: NodeJS.ProcessEnv = process.env): EmailDeliveryHealth {
  const provider = resolveEmailProvider(env);
  if (provider.id === 'smtp') {
    return { providerName: 'smtp', isRealSender: true, deliveryMode: 'sent-capable' };
  }
  return { providerName: provider.id, isRealSender: false, deliveryMode: 'logged' };
}

export async function sendTransactionalEmail(
  message: EmailMessage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmailSendResult> {
  const provider = resolveEmailProvider(env);
  const result = await provider.send(message);
  if (provider.id === 'log') {
    return { ...result, status: 'logged', delivered: false, provider: 'log' };
  }
  return result;
}
