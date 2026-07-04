/**
 * loading.tsx — Feedback inmediato al navegar a un takeoff.
 *
 * En dev la ruta se compila bajo demanda en el primer acceso: sin este
 * archivo, la navegación SPA no muestra nada durante varios segundos y el
 * click parece "no hacer nada".
 */
export default function SteelTakeoffLoading() {
  return (
    <p className="text-sm text-iconic-graphite/50" role="status">
      Abriendo takeoff…
    </p>
  );
}
