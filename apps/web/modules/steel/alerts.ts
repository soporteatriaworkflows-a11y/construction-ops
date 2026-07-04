import { calculateWastePct, classifyWasteSeverity } from './waste';
import { toDecimal } from './decimal';
import type { SteelAlert, SteelCalculatedLine, SteelSpec, SteelWasteThresholds } from './types';

export interface EvaluateSteelAlertsOptions {
  spec?: SteelSpec;
  hasSupplier?: boolean;
  hasApprovedPrice?: boolean;
  thresholds?: SteelWasteThresholds;
  minimumConfidenceScore?: string;
}

export function evaluateSteelLineAlerts(
  line: SteelCalculatedLine,
  options: EvaluateSteelAlertsOptions = {},
): readonly SteelAlert[] {
  const alerts: SteelAlert[] = [];
  const minimumConfidenceScore = options.minimumConfidenceScore ?? '0.8';

  if (line.confidenceScore && toDecimal(line.confidenceScore).lt(toDecimal(minimumConfidenceScore))) {
    alerts.push({
      code: 'A17',
      severity: 'warning',
      entityId: line.id,
      message: 'Interpretacion con confianza baja pendiente de revision.',
    });
  }

  if (line.verificationStatus === 'needs_review') {
    alerts.push({
      code: 'A4',
      severity: 'warning',
      entityId: line.id,
      message: 'Formato o contexto de descripcion requiere revision humana.',
    });
  }

  if (!line.steelSpecId && !options.spec) {
    alerts.push({
      code: 'A18',
      severity: 'warning',
      entityId: line.id,
      message: 'Linea sin vinculacion a especificacion/catalogo de acero.',
    });
  }

  if (options.hasSupplier === false || !line.supplierId) {
    alerts.push({
      code: 'A9',
      severity: 'info',
      entityId: line.id,
      message: 'Acero sin proveedor asignado.',
    });
  }

  if (options.hasApprovedPrice === false || !line.unitPriceSnapshot) {
    alerts.push({
      code: 'A10',
      severity: 'warning',
      entityId: line.id,
      message: 'Acero sin precio aprobado o snapshot de precio.',
    });
  }

  if (line.cutLengthM && line.commercialLengthM && toDecimal(line.cutLengthM).gt(toDecimal(line.commercialLengthM))) {
    alerts.push({
      code: 'A6',
      severity: 'critical',
      entityId: line.id,
      message: 'El corte supera la longitud comercial disponible.',
    });
  }

  if (line.estimatedWasteMl && toDecimal(line.estimatedWasteMl).gt(0)) {
    const wastePct = calculateWastePct(line.totalMl, line.estimatedWasteMl);
    const severity = classifyWasteSeverity(line.steelFamily, wastePct, options.thresholds);
    if (severity !== 'ok') {
      alerts.push({
        code: 'A13',
        severity,
        entityId: line.id,
        message: `Desperdicio estimado excesivo: ${wastePct}%.`,
      });
    }
  }

  if (
    options.spec?.unitWeightKgM &&
    line.unitWeightKgMSnapshot &&
    !toDecimal(options.spec.unitWeightKgM).eq(toDecimal(line.unitWeightKgMSnapshot))
  ) {
    alerts.push({
      code: 'A3',
      severity: 'warning',
      entityId: line.id,
      message: 'El peso unitario snapshot difiere de la especificacion de referencia.',
    });
  }

  return alerts;
}

