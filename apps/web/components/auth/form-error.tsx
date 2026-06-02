/**
 * form-error.tsx — Bloque de error accesible para formularios de auth.
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Errores legibles, sin stack técnico. Texto filtrado en el servidor.
 */
interface FormErrorProps {
  id?: string;
  message: string | null;
}

export function FormError({ id, message }: FormErrorProps) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}
