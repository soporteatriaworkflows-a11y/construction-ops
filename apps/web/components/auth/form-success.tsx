/**
 * form-success.tsx — Bloque de confirmación accesible para formularios de auth.
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 */
interface FormSuccessProps {
  id?: string;
  message: string | null;
}

export function FormSuccess({ id, message }: FormSuccessProps) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
    >
      {message}
    </div>
  );
}
