/**
 * auth-helpers.ts — Funciones de ayuda para la UI de auth.
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 *
 * Reglas:
 *  - Traducir mensajes de Supabase a español legible, sin stack técnico.
 *  - Para forgot-password: mensaje SIEMPRE neutral (no revelar si el correo existe).
 *  - Validaciones mínimas client-side (validación real en backend).
 */

/**
 * Traduce el mensaje de error de Supabase a un mensaje legible en español.
 * No expone detalles técnicos ni stacks.
 */
export function toReadableAuthError(err: unknown): string {
  if (!err) return 'Ocurrió un error inesperado. Intenta de nuevo.';

  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err).toLowerCase();

  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('email not confirmed')
  ) {
    return 'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Demasiados intentos. Espera unos minutos antes de intentar de nuevo.';
  }
  if (msg.includes('email') && msg.includes('invalid')) {
    return 'El correo electrónico no es válido.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
  }
  if (msg.includes('user not found') || msg.includes('no user')) {
    // Mensaje neutral para no revelar si el correo existe
    return 'Si el correo está registrado, recibirás un enlace en breve.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Error de red. Verifica tu conexión e intenta de nuevo.';
  }
  if (msg.includes('token') && msg.includes('expired')) {
    return 'El enlace ha expirado. Solicita uno nuevo.';
  }
  if (msg.includes('token') && (msg.includes('invalid') || msg.includes('bad'))) {
    return 'El enlace no es válido. Solicita uno nuevo.';
  }
  if (msg.includes('auth session missing') || msg.includes('no session')) {
    return 'La sesión no está activa. Por favor inicia sesión de nuevo.';
  }
  if (msg.includes('same password') || msg.includes('should be different')) {
    return 'La nueva contraseña debe ser diferente a la anterior.';
  }

  // Fallback genérico — sin detalles técnicos
  return 'Ocurrió un error. Intenta de nuevo o contacta a soporte si el problema persiste.';
}

/** Mensaje neutral para forgot-password (no revela si el correo existe). */
export const FORGOT_PASSWORD_NEUTRAL_MSG =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos. Revisa también tu carpeta de spam.';

/** Valida formato básico de email (validación real en backend). */
export function isValidEmailFormat(email: string): boolean {
  return email.includes('@') && email.trim().length > 3;
}

/** Valida longitud mínima de contraseña. */
export function isValidPasswordLength(password: string): boolean {
  return password.length >= 8;
}
