/**
 * pdf.ts — Generador PDF del presupuesto real con branding ICONIC (4E.1/4E.1B).
 *
 * @react-pdf/renderer, en memoria (Uint8Array), sin temporales. No recalcula
 * finanzas (usa el payload server-derived). NUNCA incluye identificadores
 * internos, filas de origen del Excel, variables, secretos, trazabilidad
 * histórica ni texto demo (contrato §4). El branding (paleta + logo opcional)
 * es puramente visual; no altera el contenido estructural.
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
import { BRAND, BRAND_HEX, loadBrandLogo } from './branding';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingTop: 96,
    paddingBottom: 44,
    paddingHorizontal: 34,
    color: BRAND_HEX.ink,
  },
  // ---- Encabezado de marca (banda azul noche, fixed en cada página) ----
  brandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 76,
    backgroundColor: BRAND_HEX.primary,
    paddingHorizontal: 34,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentLine: { position: 'absolute', top: 76, left: 0, right: 0, height: 3, backgroundColor: BRAND_HEX.accent },
  logoImg: { width: 44, height: 44, objectFit: 'contain', marginRight: 12 },
  monogram: {
    width: 44, height: 44, marginRight: 12, borderRadius: 6,
    border: `1.4 solid ${BRAND_HEX.accent}`, color: BRAND_HEX.white,
    fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 11,
  },
  brandName: { color: BRAND_HEX.white, fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  brandTagline: { color: '#C9D4E0', fontSize: 8, marginTop: 1 },
  docTag: { color: BRAND_HEX.accent, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right', letterSpacing: 0.5 },
  docMeta: { color: '#C9D4E0', fontSize: 7.5, textAlign: 'right', marginTop: 2 },

  // ---- Ficha del proyecto ----
  metaCard: {
    borderLeft: `3 solid ${BRAND_HEX.accent}`,
    backgroundColor: BRAND_HEX.bandLight,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10,
  },
  metaTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.primary, marginBottom: 3 },
  metaLine: { fontSize: 8.5, color: BRAND_HEX.ink, marginBottom: 1 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: BRAND_HEX.primarySoft },

  // ---- Secciones ----
  section: { marginTop: 8, marginBottom: 4 },
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.white,
    backgroundColor: BRAND_HEX.primary, padding: '4 7', marginBottom: 5, letterSpacing: 0.4,
  },

  // ---- Tabla de presupuesto ----
  chapterRow: {
    backgroundColor: BRAND_HEX.bandLight, paddingVertical: 3.5, paddingHorizontal: 3,
    marginTop: 5, flexDirection: 'row', borderLeft: `2 solid ${BRAND_HEX.primarySoft}`,
  },
  chapterName: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: BRAND_HEX.primary },
  thead: { flexDirection: 'row', backgroundColor: BRAND_HEX.primarySoft, color: BRAND_HEX.white, paddingVertical: 3 },
  row: { flexDirection: 'row', borderBottom: `0.3 solid ${BRAND_HEX.border}`, paddingVertical: 2 },
  rowAlt: { backgroundColor: '#FAFBFD' },
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
    backgroundColor: BRAND_HEX.primary, borderLeft: `4 solid ${BRAND_HEX.accent}`,
  },
  totLabel: { flex: 1, color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 0.5 },
  totVal: { width: 130, textAlign: 'right', color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  bold: { fontFamily: 'Helvetica-Bold' },

  // ---- Footer ----
  footer: {
    position: 'absolute', bottom: 16, left: 34, right: 34, fontSize: 7, color: BRAND_HEX.muted,
    borderTop: `0.5 solid ${BRAND_HEX.border}`, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between',
  },
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
  const logo = loadBrandLogo();

  // Banda de marca (fixed en todas las páginas).
  const brandBar = h(
    View,
    { style: styles.brandBar, fixed: true },
    logo
      ? h(Image, { style: styles.logoImg, src: logo.dataUri })
      : h(Text, { style: styles.monogram }, BRAND.monogram),
    h(
      View,
      { style: { flex: 1 } },
      h(Text, { style: styles.brandName }, BRAND.name),
      h(Text, { style: styles.brandTagline }, BRAND.tagline),
    ),
    h(
      View,
      { style: { flex: 1 } },
      h(Text, { style: styles.docTag }, BRAND.documentTitle),
      h(Text, { style: styles.docMeta }, `${payload.version.label} · ${payload.version.status}`),
      h(Text, { style: styles.docMeta }, fecha),
    ),
  );
  const accentLine = h(View, { style: styles.accentLine, fixed: true });

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

  const doc = h(
    Document,
    { title: `Presupuesto ${payload.estimate.name}`, author: BRAND.name, creator: 'Construction Ops', producer: 'Construction Ops' },
    h(
      Page,
      { size: 'A4', style: styles.page },
      brandBar,
      accentLine,
      metaCard,
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
      // Footer con paginación
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, null, `${BRAND.name} · ${BRAND.tagline}`),
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Página ${pageNumber} de ${totalPages}`,
        }),
        h(Text, null, `Generado: ${fecha}`),
      ),
    ),
  );

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
