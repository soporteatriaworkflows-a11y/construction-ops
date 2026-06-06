/**
 * pdf.ts — Generador PDF del presupuesto real con branding GRUPO ICONIC (4E.1C).
 *
 * @react-pdf/renderer, en memoria (Uint8Array), sin temporales. No recalcula
 * finanzas (usa el payload server-derived). NUNCA incluye identificadores
 * internos, filas de origen del Excel, variables, secretos, trazabilidad
 * histórica ni texto demo (contrato §4). Branding puramente visual; paleta
 * oficial ICONIC (sin dorado), logo completo en encabezado y símbolo en footer.
 */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import React from 'react';
import Decimal from 'decimal.js';
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import { BRAND, BRAND_HEX, getLogoDataUri } from './branding';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingTop: 104,
    paddingBottom: 46,
    paddingHorizontal: 34,
    color: BRAND_HEX.graphite,
  },
  // ---- Encabezado de marca: fondo blanco (el logo lleva texto azul noche) ----
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 84,
    backgroundColor: BRAND_HEX.white, paddingHorizontal: 34, paddingTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  logoImg: { height: 56, width: 130, objectFit: 'contain' },
  monogram: {
    width: 50, height: 50, borderRadius: 6, border: `1.4 solid ${BRAND_HEX.primary}`,
    color: BRAND_HEX.primary, fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 13,
  },
  headRight: { alignItems: 'flex-end' },
  docTag: { color: BRAND_HEX.deepNavy, fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  docMeta: { color: BRAND_HEX.primary, fontSize: 8, marginTop: 2 },
  docMetaSoft: { color: BRAND_HEX.graphite, fontSize: 7.5, marginTop: 1 },
  // Regla de acento cian bajo el encabezado.
  accentRule: { position: 'absolute', top: 84, left: 0, right: 0, height: 2.4, backgroundColor: BRAND_HEX.accent },
  navyRule: { position: 'absolute', top: 86.4, left: 0, right: 0, height: 0.8, backgroundColor: BRAND_HEX.deepNavy },

  // ---- Ficha del proyecto ----
  metaCard: {
    backgroundColor: BRAND_HEX.bandLight, borderLeft: `3 solid ${BRAND_HEX.primary}`,
    paddingVertical: 8, paddingHorizontal: 11, marginBottom: 10,
  },
  metaTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.deepNavy, marginBottom: 3 },
  metaLine: { fontSize: 8.5, color: BRAND_HEX.graphite, marginBottom: 1 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: BRAND_HEX.primary },

  // ---- Secciones ----
  section: { marginTop: 8, marginBottom: 4 },
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.white,
    backgroundColor: BRAND_HEX.primary, padding: '4 7', marginBottom: 5, letterSpacing: 0.4,
  },

  // ---- Tabla de presupuesto ----
  chapterRow: {
    backgroundColor: BRAND_HEX.bandLight, paddingVertical: 3.5, paddingHorizontal: 3,
    marginTop: 5, flexDirection: 'row', borderLeft: `2 solid ${BRAND_HEX.primary}`,
  },
  chapterName: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: BRAND_HEX.deepNavy },
  thead: { flexDirection: 'row', backgroundColor: BRAND_HEX.primary, color: BRAND_HEX.white, paddingVertical: 3 },
  row: { flexDirection: 'row', borderBottom: `0.3 solid ${BRAND_HEX.border}`, paddingVertical: 2 },
  rowAlt: { backgroundColor: BRAND_HEX.bandLight },
  cCode: { width: 44, paddingHorizontal: 3 },
  cDesc: { flex: 1, paddingHorizontal: 3 },
  cUnit: { width: 34, paddingHorizontal: 3 },
  cQty: { width: 54, paddingHorizontal: 3, textAlign: 'right' },
  cUnit2: { width: 64, paddingHorizontal: 3, textAlign: 'right' },
  cSub: { width: 74, paddingHorizontal: 3, textAlign: 'right' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },

  // ---- Resumen financiero ----
  finRow: { flexDirection: 'row', borderBottom: `0.4 solid ${BRAND_HEX.border}`, paddingVertical: 3.5, paddingHorizontal: 4 },
  finLabel: { flex: 1 },
  finPct: { width: 60, textAlign: 'right', color: BRAND_HEX.muted },
  finVal: { width: 110, textAlign: 'right' },
  subtotalRow: {
    flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4,
    backgroundColor: BRAND_HEX.bandLight, borderTop: `0.6 solid ${BRAND_HEX.border}`,
  },
  totRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, marginTop: 4,
    backgroundColor: BRAND_HEX.deepNavy, borderLeft: `4 solid ${BRAND_HEX.accent}`,
  },
  totLabel: { flex: 1, color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 0.5 },
  totVal: { width: 130, textAlign: 'right', color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  bold: { fontFamily: 'Helvetica-Bold' },

  // ---- Footer con símbolo ----
  footer: {
    position: 'absolute', bottom: 16, left: 34, right: 34, height: 22,
    borderTop: `0.5 solid ${BRAND_HEX.border}`, paddingTop: 4,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center' },
  footerSymbol: { width: 12, height: 12, objectFit: 'contain', marginRight: 5 },
  footerText: { fontSize: 7, color: BRAND_HEX.muted },
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
  const logoFull = getLogoDataUri('full');
  const logoSymbol = getLogoDataUri('symbol');

  // Encabezado (fijo en cada página): logo oficial a la izquierda, doc a la derecha.
  const header = h(
    View,
    { style: styles.header, fixed: true },
    logoFull
      ? h(Image, { style: styles.logoImg, src: logoFull })
      : h(Text, { style: styles.monogram }, BRAND.monogram),
    h(
      View,
      { style: styles.headRight },
      h(Text, { style: styles.docTag }, BRAND.documentTitle),
      h(Text, { style: styles.docMeta }, `${payload.version.label} · ${payload.version.status}`),
      h(Text, { style: styles.docMetaSoft }, fecha),
    ),
  );

  const metaCard = h(
    View,
    { style: styles.metaCard },
    h(Text, { style: styles.metaTitle }, payload.estimate.name),
    h(Text, { style: styles.metaLine }, h(Text, { style: styles.metaLabel }, 'Organización: '), payload.organizationName),
    h(Text, { style: styles.metaLine }, h(Text, { style: styles.metaLabel }, 'Proyecto: '), `${payload.project.name}${payload.project.city ? ' · ' + payload.project.city : ''}`),
    h(Text, { style: styles.metaLine }, h(Text, { style: styles.metaLabel }, 'Alcance: '), payload.scope.name ?? '—'),
    h(Text, { style: styles.metaLine }, h(Text, { style: styles.metaLabel }, 'Capítulos / Ítems: '), `${payload.counts.chapters} / ${payload.counts.items}`),
  );

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
          { key: `it-${ci}-${ii}`, style: ii % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row },
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
      h(Text, { style: styles.finLabel }, label),
      h(Text, { style: styles.finPct }, pctHuman ? pct(pctHuman) : ''),
      h(Text, { style: styles.finVal }, cop(value)),
    );

  const subtotalLine = (label: string, value: string) =>
    h(
      View,
      { style: styles.subtotalRow, key: label },
      h(Text, { style: [styles.finLabel, styles.bold] }, label),
      h(Text, { style: styles.finPct }, ''),
      h(Text, { style: [styles.finVal, styles.bold] }, cop(value)),
    );

  const footer = h(
    View,
    { style: styles.footer, fixed: true },
    h(
      View,
      { style: styles.footerLeft },
      logoSymbol ? h(Image, { style: styles.footerSymbol, src: logoSymbol }) : null,
      h(Text, { style: styles.footerText }, `${BRAND.name} · ${BRAND.tagline}`),
    ),
    h(Text, {
      style: styles.footerText,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Página ${pageNumber} de ${totalPages}`,
    }),
    h(Text, { style: styles.footerText }, `Generado: ${fecha}`),
  );

  const doc = h(
    Document,
    { title: `Presupuesto ${payload.estimate.name}`, author: BRAND.name, creator: 'Construction Ops', producer: 'Construction Ops' },
    h(
      Page,
      { size: 'A4', style: styles.page },
      header,
      h(View, { style: styles.accentRule, fixed: true }),
      h(View, { style: styles.navyRule, fixed: true }),
      metaCard,
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'PRESUPUESTO POR CAPÍTULOS'),
        itemHeader,
        ...chapterBlocks,
      ),
      h(
        View,
        { style: styles.section, wrap: false },
        h(Text, { style: styles.sectionTitle }, 'RESUMEN FINANCIERO'),
        subtotalLine('Costos directos', f.directTotal),
        finLine('Administración', f.administrationAmount, payload.aiu.administrationRate),
        finLine('Imprevistos', f.contingencyAmount, payload.aiu.contingencyRate),
        finLine('Utilidad', f.utilityAmount, payload.aiu.utilityRate),
        finLine('IVA sobre utilidad', f.utilityVatAmount, payload.aiu.utilityVatRate),
        subtotalLine('Costos indirectos (AIU)', f.indirectTotal),
        h(
          View,
          { style: styles.totRow },
          h(Text, { style: styles.totLabel }, 'TOTAL GENERAL'),
          h(Text, { style: styles.totVal }, cop(f.grandTotal)),
        ),
      ),
      footer,
    ),
  );

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
