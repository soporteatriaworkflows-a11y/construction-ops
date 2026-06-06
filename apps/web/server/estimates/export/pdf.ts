/**
 * pdf.ts — Generador PDF del presupuesto real (4E.1). @react-pdf/renderer.
 *
 * Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §4`. En memoria (Uint8Array), sin
 * temporales. No recalcula finanzas (usa el payload server-derived). NUNCA
 * incluye identificadores internos, filas de origen del Excel, variables,
 * secretos, trazabilidad histórica ni texto demo (ver contrato §4).
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import React from 'react';
import Decimal from 'decimal.js';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, paddingTop: 36, paddingBottom: 40, paddingHorizontal: 32, color: '#222222' },
  header: { marginBottom: 12, borderBottom: '1 solid #2E5FA3', paddingBottom: 6 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#2E5FA3', marginBottom: 3 },
  subtitle: { fontSize: 9, color: '#555555', marginBottom: 1 },
  section: { marginTop: 10, marginBottom: 4 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', backgroundColor: '#E8EEF8', padding: '3 5', marginBottom: 4, color: '#2E5FA3' },
  chapterRow: { backgroundColor: '#EEF4EA', paddingVertical: 3, paddingHorizontal: 3, marginTop: 4, flexDirection: 'row' },
  chapterName: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  thead: { flexDirection: 'row', backgroundColor: '#2E5FA3', color: '#FFFFFF', paddingVertical: 3 },
  row: { flexDirection: 'row', borderBottom: '0.3 solid #E5E5E5', paddingVertical: 2 },
  cCode: { width: 44, paddingHorizontal: 3 },
  cDesc: { flex: 1, paddingHorizontal: 3 },
  cUnit: { width: 34, paddingHorizontal: 3 },
  cQty: { width: 54, paddingHorizontal: 3, textAlign: 'right' },
  cUnit2: { width: 64, paddingHorizontal: 3, textAlign: 'right' },
  cSub: { width: 72, paddingHorizontal: 3, textAlign: 'right' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  finRow: { flexDirection: 'row', borderBottom: '0.4 solid #DDDDDD', paddingVertical: 3 },
  finLabel: { flex: 1, paddingHorizontal: 4 },
  finVal: { width: 110, paddingHorizontal: 4, textAlign: 'right' },
  totRow: { flexDirection: 'row', borderTop: '1 solid #2E5FA3', backgroundColor: '#D9E1F2', paddingVertical: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 18, left: 32, right: 32, fontSize: 7, color: '#888888', textAlign: 'center', borderTop: '0.5 solid #CCCCCC', paddingTop: 4 },
});

function cop(value: string): string {
  let num = 0;
  try { num = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(); } catch { num = 0; }
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}
function qty(value: string): string {
  let num = 0;
  try { num = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(); } catch { num = 0; }
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
function pct(human: string): string {
  let num = 0;
  try { num = new Decimal(human).toNumber(); } catch { num = 0; }
  return `${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(num)}%`;
}

const h = React.createElement;

export async function generateEstimatePdf(payload: EstimateExportPayload): Promise<Uint8Array> {
  const fecha = new Date(payload.generatedAt).toLocaleDateString('es-CO');
  const f = payload.financial;

  const itemHeader = h(
    View,
    { style: styles.thead },
    h(Text, { style: [styles.cCode, styles.th] }, 'Código'),
    h(Text, { style: [styles.cDesc, styles.th] }, 'Actividad'),
    h(Text, { style: [styles.cUnit, styles.th] }, 'Und'),
    h(Text, { style: [styles.cQty, styles.th] }, 'Cantidad'),
    h(Text, { style: [styles.cUnit2, styles.th] }, 'V. unitario'),
    h(Text, { style: [styles.cSub, styles.th] }, 'Subtotal'),
  );

  const chapterBlocks = payload.chapters.map((ch, ci) =>
    h(
      View,
      { key: `ch-${ci}`, wrap: true },
      h(
        View,
        { style: styles.chapterRow },
        h(Text, { style: [styles.cCode, styles.chapterName] }, ch.code),
        h(Text, { style: [styles.cDesc, styles.chapterName] }, ch.name.toUpperCase()),
        h(Text, { style: [styles.cSub, styles.chapterName] }, cop(ch.subtotal)),
      ),
      ...ch.items.map((it, ii) =>
        h(
          View,
          { key: `it-${ci}-${ii}`, style: styles.row },
          h(Text, { style: styles.cCode }, it.code),
          h(Text, { style: styles.cDesc }, it.description),
          h(Text, { style: styles.cUnit }, it.unit),
          h(Text, { style: styles.cQty }, qty(it.quantity)),
          h(Text, { style: styles.cUnit2 }, cop(it.unitPrice)),
          h(Text, { style: styles.cSub }, cop(it.subtotal)),
        ),
      ),
    ),
  );

  const finLine = (label: string, value: string, pctHuman?: string) =>
    h(
      View,
      { style: styles.finRow, key: label },
      h(Text, { style: styles.finLabel }, pctHuman ? `${label} (${pct(pctHuman)})` : label),
      h(Text, { style: styles.finVal }, cop(value)),
    );

  const doc = h(
    Document,
    { title: `Presupuesto ${payload.estimate.name}`, author: 'Construction Ops' },
    h(
      Page,
      { size: 'A4', style: styles.page },
      // Encabezado
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.title }, 'PRESUPUESTO DE OBRA'),
        h(Text, { style: styles.subtitle }, `${payload.organizationName}`),
        h(Text, { style: styles.subtitle }, `${payload.project.name}${payload.project.city ? ' · ' + payload.project.city : ''}`),
        h(Text, { style: styles.subtitle }, `Alcance: ${payload.scope.name ?? '—'} · ${payload.estimate.name}`),
        h(Text, { style: styles.subtitle }, `Versión ${payload.version.label} · Estado: ${payload.version.status} · Fecha: ${fecha}`),
      ),
      // Capítulos + actividades
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'PRESUPUESTO POR CAPÍTULOS'),
        itemHeader,
        ...chapterBlocks,
      ),
      // Resumen financiero
      h(
        View,
        { style: styles.section, wrap: false },
        h(Text, { style: styles.sectionTitle }, 'RESUMEN FINANCIERO'),
        finLine('Costos directos', f.directTotal),
        finLine('Administración', f.administrationAmount, payload.aiu.administrationRate),
        finLine('Imprevistos', f.contingencyAmount, payload.aiu.contingencyRate),
        finLine('Utilidad', f.utilityAmount, payload.aiu.utilityRate),
        finLine('IVA sobre utilidad', f.utilityVatAmount, payload.aiu.utilityVatRate),
        finLine('Costos indirectos', f.indirectTotal),
        h(
          View,
          { style: styles.totRow },
          h(Text, { style: [styles.finLabel, styles.bold] }, 'TOTAL GENERAL'),
          h(Text, { style: [styles.finVal, styles.bold] }, cop(f.grandTotal)),
        ),
      ),
      // Footer con paginación
      h(Text, {
        style: styles.footer,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Página ${pageNumber} de ${totalPages} · Generado: ${fecha} · Construction Ops`,
      }),
    ),
  );

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
