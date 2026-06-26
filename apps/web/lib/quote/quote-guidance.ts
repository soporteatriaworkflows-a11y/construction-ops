/**
 * quote-guidance.ts — Guía ACCIONABLE por paso del asistente de cotización
 * (UX_QUOTING_COMPANION_ACTIONABLE_GUIDANCE_V1). PURO, sin DOM, sin IO, sin
 * finanzas. Convierte un paso (de `deriveQuoteProgress`) en microcopy clara: qué
 * significa, por qué aparece así, qué hacer, qué botón y qué resultado esperar.
 *
 * Honestidad (FASE 6): el "por qué" usa la descripción YA derivada del paso
 * (basada en datos reales del read-model). NO inventa conteos: el texto estático
 * sólo describe el sentido del paso; los números vienen de `step.description`.
 */
import type { QuoteStep, QuoteStepId, QuoteStepStatus } from './quote-progress';
import { STEP_STATUS_TEXT } from './quote-location';

export type GuidanceSeverity = 'done' | 'attention' | 'info' | 'blocked';

interface StepGuideStatic {
  whatItMeans: string;
  whenReady: string;
  whatToDoNow: string;
  primaryActionLabel: string;
  expectedResult: string;
}

export const STEP_GUIDE: Record<QuoteStepId, StepGuideStatic> = {
  project: {
    whatItMeans: 'Defines el proyecto u obra para el que vas a cotizar.',
    whenReady: 'Listo cuando hay un proyecto seleccionado.',
    whatToDoNow: 'Selecciona un proyecto existente o crea uno nuevo.',
    primaryActionLabel: 'Elegir proyecto',
    expectedResult: 'Con un proyecto activo se habilita el resto del flujo de cotización.',
  },
  budget: {
    whatItMeans: 'Eliges la versión editable del presupuesto que vas a trabajar.',
    whenReady: 'Listo cuando hay una versión editable (borrador o revisión) seleccionada.',
    whatToDoNow: 'Selecciona una versión editable; si está emitida/aprobada, clónala para seguir.',
    primaryActionLabel: 'Abrir presupuesto',
    expectedResult: 'Sobre una versión editable puedes cargar capítulos, ítems, cantidades y precios.',
  },
  chapters: {
    whatItMeans: 'Es la estructura del presupuesto: capítulos con sus ítems (partidas).',
    whenReady: 'Listo cuando el presupuesto tiene capítulos e ítems, sin capítulos vacíos.',
    whatToDoNow: 'Revisa la estructura; agrega capítulos o ítems si falta alguno. Si ya importaste todo, el siguiente paso suele ser asociar APU o revisar cantidades.',
    primaryActionLabel: 'Revisar capítulos',
    expectedResult: 'Con la estructura completa, el asistente puede evaluar cantidades, precios y APU.',
  },
  apu: {
    whatItMeans: 'Vas a conectar actividades técnicas reutilizables (APU) con las partidas del presupuesto, para calcular materiales, mano de obra, desperdicio y rendimiento.',
    whenReady: 'Listo cuando las partidas que lo requieren tienen APU vinculado y sin pendientes críticos.',
    whatToDoNow: 'Abre el workspace y usa el filtro “Sin APU” para ver las partidas pendientes. Luego usa “Agregar actividad desde APU” o asocia el APU que corresponda.',
    primaryActionLabel: 'Ver ítems sin APU',
    expectedResult: 'Cuando los ítems tengan APU vinculado, el semáforo podrá validar mejor componentes, precios y rendimientos.',
  },
  quantities: {
    whatItMeans: 'Defines cuánto de cada partida hay que ejecutar (cantidades de obra).',
    whenReady: 'Listo cuando ningún ítem tiene cantidad vacía o en cero.',
    whatToDoNow: 'Ingresa o importa las cantidades faltantes.',
    primaryActionLabel: 'Abrir cantidades',
    expectedResult: 'Con cantidades completas, los subtotales y el total reflejan el alcance real.',
  },
  pricing: {
    whatItMeans: 'Confirmas el precio unitario de cada partida o recurso.',
    whenReady: 'Listo cuando ningún ítem queda sin precio unitario.',
    whatToDoNow: 'Revisa y aprueba los precios pendientes o por revisar.',
    primaryActionLabel: 'Revisar precios pendientes',
    expectedResult: 'Con los precios completos, el total de la cotización queda confiable.',
  },
  readiness: {
    whatItMeans: 'Resume si la cotización está lista para exportar o si tiene críticos/advertencias.',
    whenReady: 'Listo cuando no hay pendientes críticos.',
    whatToDoNow: 'Revisa el semáforo completo y resuelve los críticos antes de exportar.',
    primaryActionLabel: 'Ver semáforo completo',
    expectedResult: 'Cuando el semáforo esté en verde, puedes exportar con confianza.',
  },
  export: {
    whatItMeans: 'Generas los documentos de la cotización por rol (gerencia, presupuestador, obra, cliente).',
    whenReady: 'Recomendado cuando el semáforo está listo, o si aceptas exportar con advertencias.',
    whatToDoNow: 'Abre el presupuesto y usa el bloque de exportación por rol.',
    primaryActionLabel: 'Exportar cotización',
    expectedResult: 'Obtienes el Excel/PDF de la cotización con la privacidad correcta por rol.',
  },
};

/** Razón corta por estado para el mini-stepper (texto, no solo color). Honesta. */
const SHORT_REASON: Partial<Record<QuoteStepId, string>> = {
  chapters: 'faltan capítulos o ítems',
  apu: 'revisar vínculos APU',
  quantities: 'faltan cantidades',
  pricing: 'faltan o por revisar precios',
  readiness: 'hay pendientes',
  export: 'críticos antes de exportar',
};

export function stepReasonText(step: QuoteStep): string {
  if (step.status === 'done') return 'Listo';
  if (step.status === 'locked') return 'Bloqueado';
  const reason = SHORT_REASON[step.id];
  const prefix = step.status === 'attention' ? 'Revisar' : 'Pendiente';
  return reason ? `${prefix}: ${reason}` : prefix;
}

function severityOf(status: QuoteStepStatus): GuidanceSeverity {
  switch (status) {
    case 'done':
      return 'done';
    case 'attention':
      return 'attention';
    case 'locked':
      return 'blocked';
    default:
      return 'info';
  }
}

export interface QuoteGuidance {
  stepId: QuoteStepId;
  title: string;
  severity: GuidanceSeverity;
  statusText: string;
  whatItMeans: string;
  /** Por qué aparece así: descripción dinámica del paso (datos reales). */
  whyThisState: string;
  whatToDoNow: string;
  primaryActionLabel: string;
  primaryHref: string;
  expectedResult: string;
  secondaryHelpText: string;
}

/** Construye la guía accionable de un paso. PURA. No inventa conteos. */
export function buildStepGuidance(step: QuoteStep): QuoteGuidance {
  const g = STEP_GUIDE[step.id];
  const whyHonest =
    step.description && step.description.trim() !== ''
      ? step.description
      : 'No hay suficiente información para validar este paso todavía.';
  return {
    stepId: step.id,
    title: step.label,
    severity: severityOf(step.status),
    statusText: STEP_STATUS_TEXT[step.status],
    whatItMeans: g.whatItMeans,
    whyThisState: whyHonest,
    whatToDoNow: g.whatToDoNow,
    primaryActionLabel: g.primaryActionLabel,
    primaryHref: step.primaryHref,
    expectedResult: g.expectedResult,
    secondaryHelpText: 'Te llevamos a la pantalla donde puedes resolver este paso.',
  };
}

/**
 * Elige el paso a guiar: el siguiente accionable (por id), si no el del lugar
 * actual, si no el primer paso no `done`/`locked`. `null` si no hay ninguno.
 */
export function pickGuidanceStep(
  steps: readonly QuoteStep[],
  nextActionId?: string | null,
  currentStepId?: string | null,
): QuoteStep | null {
  if (nextActionId) {
    const s = steps.find((x) => x.id === nextActionId);
    if (s) return s;
  }
  if (currentStepId) {
    const s = steps.find((x) => x.id === currentStepId);
    if (s) return s;
  }
  return steps.find((x) => x.status !== 'done' && x.status !== 'locked') ?? null;
}
