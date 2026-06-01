/**
 * pdf-client.ts — Generador PDF presupuesto para cliente (@react-pdf/renderer).
 *
 * Propiedad: agent-exports.
 * Contrato: `docs/EXPORT_PROFILES_CONTRACT.md §3.C`.
 *
 * INCLUYE: encabezado, proyecto, resumen financiero, capítulos, total, términos.
 * EXCLUYE: todos los campos internos (🔒).
 *
 * REGLAS:
 *  - Usa DTOs ya proyectados por el read-model con perfil `client`.
 *  - No recalcula finanzas. Formato COP sin decimales (Q9).
 *  - Diseño sobrio. Sin fuentes privadas.
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
import type { EstimateSummary, ChapterSummary } from '@/lib/contracts/read-model';

// Registrar solo fuentes estándar (sin fuentes privadas)
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
    borderBottom: '1 solid #2E5FA3',
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E5FA3',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#555555',
  },
  section: {
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    backgroundColor: '#E8EEF8',
    padding: '4 6',
    marginBottom: 6,
    color: '#2E5FA3',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #DDDDDD',
    paddingVertical: 3,
  },
  rowTotal: {
    flexDirection: 'row',
    borderTop: '1 solid #2E5FA3',
    paddingVertical: 4,
    backgroundColor: '#D9E1F2',
  },
  cell: {
    flex: 1,
    paddingHorizontal: 4,
  },
  cellRight: {
    flex: 1,
    paddingHorizontal: 4,
    textAlign: 'right',
  },
  cellHeader: {
    flex: 1,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: '#2E5FA3',
  },
  bold: {
    fontWeight: 'bold',
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

function copFormat(value: string): string {
  const num = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function pctLabel(partial: string, total: string): string {
  try {
    const p = new Decimal(partial).div(new Decimal(total)).mul(100);
    return `${p.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)}%`;
  } catch {
    return '';
  }
}

export interface PdfClientInput {
  projectName: string;
  projectLocation?: string | null;
  estimate: EstimateSummary;
  chapters: ChapterSummary[];
  generatedAt: string;
  generatedByLabel?: string;
}

export async function generatePdfClient(input: PdfClientInput): Promise<Uint8Array> {
  const dc = input.estimate.directCost;
  const generatedDate = new Date(input.generatedAt).toLocaleDateString('es-CO');

  const doc = React.createElement(
    Document,
    { title: `Presupuesto ${input.projectName}`, author: 'Construction Ops' },
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, 'PRESUPUESTO DE OBRA'),
        React.createElement(Text, { style: styles.subtitle },
          `${input.projectName}${input.projectLocation ? ' · ' + input.projectLocation : ''}`
        ),
        React.createElement(Text, { style: styles.subtitle },
          `Versión V${input.estimate.versionNumber} · Estado: ${input.estimate.status} · Fecha: ${generatedDate}`
        ),
        input.generatedByLabel
          ? React.createElement(Text, { style: styles.subtitle }, `Elaborado por: ${input.generatedByLabel}`)
          : null,
      ),
      // Resumen financiero
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'RESUMEN FINANCIERO'),
        // Tabla
        React.createElement(
          View,
          null,
          ...[
            ['Costos directos', copFormat(dc)],
            [`Administración (${pctLabel(input.estimate.administration, dc)})`, copFormat(input.estimate.administration)],
            [`Imprevistos (${pctLabel(input.estimate.contingency, dc)})`, copFormat(input.estimate.contingency)],
            [`Utilidad (${pctLabel(input.estimate.utility, dc)})`, copFormat(input.estimate.utility)],
            ['IVA sobre utilidad', copFormat(input.estimate.taxOnUtility)],
          ].map(([label, val]) =>
            React.createElement(
              View,
              { style: styles.row, key: label },
              React.createElement(Text, { style: styles.cell }, label),
              React.createElement(Text, { style: styles.cellRight }, val),
            )
          ),
          React.createElement(
            View,
            { style: styles.rowTotal },
            React.createElement(Text, { style: [styles.cell, styles.bold] }, 'TOTAL'),
            React.createElement(Text, { style: [styles.cellRight, styles.bold] }, copFormat(input.estimate.grandTotal)),
          ),
          input.estimate.totalArea
            ? React.createElement(
                View,
                { style: styles.row, key: 'area' },
                React.createElement(Text, { style: styles.cell }, 'Área construida (m²)'),
                React.createElement(Text, { style: styles.cellRight }, new Decimal(input.estimate.totalArea).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)),
              )
            : null,
          input.estimate.costPerSquareMeter
            ? React.createElement(
                View,
                { style: styles.row, key: 'vpm2' },
                React.createElement(Text, { style: styles.cell }, 'Valor por m²'),
                React.createElement(Text, { style: styles.cellRight }, copFormat(input.estimate.costPerSquareMeter)),
              )
            : null,
        ),
      ),
      // Capítulos
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'CAPÍTULOS'),
        // Encabezado de tabla
        React.createElement(
          View,
          { style: { flexDirection: 'row', marginBottom: 2 } },
          React.createElement(View, { style: { width: 60 } }, React.createElement(Text, { style: { fontWeight: 'bold', fontSize: 8 } }, 'Código')),
          React.createElement(View, { style: { flex: 1 } }, React.createElement(Text, { style: { fontWeight: 'bold', fontSize: 8 } }, 'Capítulo')),
          React.createElement(View, { style: { width: 80, textAlign: 'right' } }, React.createElement(Text, { style: { fontWeight: 'bold', fontSize: 8 } }, 'Subtotal')),
        ),
        ...input.chapters.map(ch =>
          React.createElement(
            View,
            { style: { flexDirection: 'row', borderBottom: '0.3 solid #EEEEEE', paddingVertical: 2 }, key: ch.id },
            React.createElement(View, { style: { width: 60 } }, React.createElement(Text, { style: { fontSize: 8 } }, ch.code)),
            React.createElement(View, { style: { flex: 1 } }, React.createElement(Text, { style: { fontSize: 8 } }, ch.name)),
            React.createElement(View, { style: { width: 80 } }, React.createElement(Text, { style: { fontSize: 8, textAlign: 'right' } }, copFormat(ch.subtotal))),
          )
        ),
      ),
      // Footer
      React.createElement(
        Text,
        {
          style: styles.footer,
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Página ${pageNumber} de ${totalPages} · Generado: ${generatedDate} · Construction Ops`,
          fixed: true,
        },
      ),
    ),
  );

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
