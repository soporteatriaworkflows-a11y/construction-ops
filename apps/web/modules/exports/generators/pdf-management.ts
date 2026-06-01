/**
 * pdf-management.ts — Generador PDF gerencial (@react-pdf/renderer).
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §3.D`.
 *
 * INCLUYE: resumen financiero, directos, indirectos, AIU desglosado, IVA,
 *          ahorros, margen, capítulos, cronograma, alertas autorizadas.
 * Solo perfil `management`.
 *
 * REGLAS:
 *  - Usa DTOs ya proyectados por el read-model con perfil `management`.
 *  - No recalcula finanzas. Formato COP sin decimales (Q9).
 *  - Diseño sobrio. Sin fuentes privadas.
 *  - No expone proveedores/SKU/URL (internos al perfil `internal`).
 *  - Generado en memoria (Uint8Array); sin temporales en disco.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from '@react-pdf/renderer';
import React from 'react';
import Decimal from 'decimal.js';
import type {
  EstimateSummary,
  ChapterSummary,
  DashboardSummary,
  ScheduleSummary,
} from '@/lib/contracts/read-model';

Font.register({
  family: 'Helvetica',
  fonts: [{ src: 'Helvetica' }, { src: 'Helvetica-Bold', fontWeight: 'bold' }],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: '#222222',
  },
  header: {
    marginBottom: 16,
    borderBottom: '1 solid #8B0000',
    paddingBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#555555',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#F5DFDF',
    padding: '4 6',
    marginBottom: 4,
    marginTop: 10,
    color: '#8B0000',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #EEEEEE',
    paddingVertical: 3,
  },
  rowHighlight: {
    flexDirection: 'row',
    backgroundColor: '#F5DFDF',
    paddingVertical: 4,
  },
  cell: { flex: 1, paddingHorizontal: 4 },
  cellRight: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  bold: { fontWeight: 'bold' },
  confidential: {
    fontSize: 7,
    color: '#CC0000',
    textAlign: 'center',
    marginBottom: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#888888',
    textAlign: 'center',
    borderTop: '0.5 solid #CCCCCC',
    paddingTop: 4,
  },
});

function cop(value: string): string {
  const num = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(num);
}

function pct(partial: string, total: string): string {
  try {
    const p = new Decimal(partial).div(new Decimal(total)).mul(100);
    return `${p.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)}%`;
  } catch {
    return 'N/A';
  }
}

export interface PdfManagementInput {
  projectName: string;
  projectLocation?: string | null;
  estimate: EstimateSummary;
  chapters: ChapterSummary[];
  dashboard?: DashboardSummary;
  schedule?: ScheduleSummary;
  generatedAt: string;
  generatedByLabel?: string;
}

export async function generatePdfManagement(input: PdfManagementInput): Promise<Uint8Array> {
  const dc = input.estimate.directCost;
  const generatedDate = new Date(input.generatedAt).toLocaleDateString('es-CO');

  const doc = React.createElement(
    Document,
    { title: `Resumen Gerencial ${input.projectName}`, author: 'Construction Ops' },
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Confidencial
      React.createElement(Text, { style: styles.confidential }, 'DOCUMENTO CONFIDENCIAL — USO INTERNO — GERENCIA'),
      // Encabezado
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, 'RESUMEN GERENCIAL — PRESUPUESTO DE OBRA'),
        React.createElement(Text, { style: styles.subtitle },
          `${input.projectName}${input.projectLocation ? ' · ' + input.projectLocation : ''}`
        ),
        React.createElement(Text, { style: styles.subtitle },
          `V${input.estimate.versionNumber} · ${input.estimate.status} · Generado: ${generatedDate}`
        ),
        input.generatedByLabel
          ? React.createElement(Text, { style: styles.subtitle }, `Elaborado: ${input.generatedByLabel}`)
          : null,
      ),
      // Resumen financiero
      React.createElement(Text, { style: styles.sectionTitle }, 'RESUMEN FINANCIERO'),
      React.createElement(
        View,
        null,
        ...[
          ['Costos directos', cop(dc)],
          [`Administración (${pct(input.estimate.administration, dc)})`, cop(input.estimate.administration)],
          [`Imprevistos (${pct(input.estimate.contingency, dc)})`, cop(input.estimate.contingency)],
          [`Utilidad (${pct(input.estimate.utility, dc)})`, cop(input.estimate.utility)],
          ['IVA sobre utilidad', cop(input.estimate.taxOnUtility)],
        ].map(([label, val]) =>
          React.createElement(
            View, { style: styles.row, key: label },
            React.createElement(Text, { style: styles.cell }, label),
            React.createElement(Text, { style: styles.cellRight }, val),
          )
        ),
        React.createElement(
          View, { style: styles.rowHighlight },
          React.createElement(Text, { style: [styles.cell, styles.bold] }, 'TOTAL PRESUPUESTO'),
          React.createElement(Text, { style: [styles.cellRight, styles.bold] }, cop(input.estimate.grandTotal)),
        ),
        input.estimate.totalArea
          ? React.createElement(
              View, { style: styles.row, key: 'area' },
              React.createElement(Text, { style: styles.cell }, 'Área construida (m²)'),
              React.createElement(Text, { style: styles.cellRight }, new Decimal(input.estimate.totalArea).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)),
            )
          : null,
        input.estimate.costPerSquareMeter
          ? React.createElement(
              View, { style: styles.row, key: 'vpm2' },
              React.createElement(Text, { style: styles.cell }, 'Valor por m²'),
              React.createElement(Text, { style: styles.cellRight }, cop(input.estimate.costPerSquareMeter)),
            )
          : null,
      ),
      // Indicadores gerenciales (ahorros/margen) - perfil management
      input.dashboard?.projectedSaving
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.sectionTitle }, 'INDICADORES GERENCIALES'),
            React.createElement(
              View, { style: styles.row },
              React.createElement(Text, { style: styles.cell }, 'Ahorro proyectado'),
              React.createElement(Text, { style: styles.cellRight }, cop(input.dashboard.projectedSaving)),
            ),
            input.dashboard.realizedSaving
              ? React.createElement(
                  View, { style: styles.row },
                  React.createElement(Text, { style: styles.cell }, 'Ahorro realizado'),
                  React.createElement(Text, { style: styles.cellRight }, cop(input.dashboard.realizedSaving)),
                )
              : null,
            input.dashboard.pricingCoverage
              ? React.createElement(
                  View, { style: styles.row },
                  React.createElement(Text, { style: styles.cell }, 'Cobertura de precios'),
                  React.createElement(Text, { style: styles.cellRight },
                    `${new Decimal(input.dashboard.pricingCoverage).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1)}%`
                  ),
                )
              : null,
          )
        : null,
      // Capítulos
      React.createElement(Text, { style: styles.sectionTitle }, 'DISTRIBUCIÓN POR CAPÍTULOS'),
      React.createElement(
        View,
        null,
        ...input.chapters.map(ch =>
          React.createElement(
            View, { style: styles.row, key: ch.id },
            React.createElement(Text, { style: { ...styles.cell, flex: 0.3 } }, ch.code),
            React.createElement(Text, { style: styles.cell }, ch.name),
            React.createElement(Text, { style: styles.cellRight }, cop(ch.subtotal)),
            React.createElement(Text, { style: { ...styles.cellRight, flex: 0.5 } }, pct(ch.subtotal, dc)),
          )
        ),
      ),
      // Cronograma resumido
      input.schedule && input.schedule.tasks.length > 0
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.sectionTitle }, 'ESTADO DEL CRONOGRAMA'),
            React.createElement(
              View, { style: styles.row },
              React.createElement(Text, { style: styles.cell }, 'Avance físico general'),
              React.createElement(Text, { style: styles.cellRight },
                `${new Decimal(input.schedule.physicalProgressPct).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1)}%`
              ),
            ),
            React.createElement(
              View, { style: styles.row },
              React.createElement(Text, { style: styles.cell }, 'Hitos'),
              React.createElement(Text, { style: styles.cellRight }, String(input.schedule.milestones.length)),
            ),
            ...(input.schedule.criticalPath
              ? [React.createElement(
                  View, { style: styles.row, key: 'cp' },
                  React.createElement(Text, { style: styles.cell }, 'Duración ruta crítica (días)'),
                  React.createElement(Text, { style: styles.cellRight }, new Decimal(input.schedule.criticalPath.durationDays).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)),
                )]
              : []),
          )
        : null,
      // Footer
      React.createElement(
        Text,
        {
          style: styles.footer,
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Página ${pageNumber} de ${totalPages} · ${generatedDate} · CONFIDENCIAL · Construction Ops`,
          fixed: true,
        },
      ),
    ),
  );

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
