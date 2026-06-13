/**
 * apu-pdf.ts — Generador PDF del anexo de APU vinculados y del paquete completo
 * (APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1).
 *
 * @react-pdf/renderer, en memoria. Portada + índice + ficha por APU vinculado.
 * Texto SIEMPRE saneado (`cleanText`); nunca incrusta UUID internos, filas de
 * origen del Excel ni secretos. Branding ICONIC. Contrato §3, §5, §8.
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
import type {
  BudgetApuExportSelection,
  LinkedApuView,
} from '@/lib/estimates/apu-export-types';
import type { ApuComponentView } from '@/lib/contracts/read-model';
import { BRAND, BRAND_HEX, getLogoDataUri } from '../branding';
import { buildBudgetPage } from '../pdf';
import { cleanText } from './sanitize';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica', fontSize: 8, paddingTop: 96, paddingBottom: 46,
    paddingHorizontal: 34, color: BRAND_HEX.graphite,
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 76,
    backgroundColor: BRAND_HEX.white, paddingHorizontal: 34, paddingTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  logoImg: { height: 52, width: 122, objectFit: 'contain' },
  monogram: {
    width: 46, height: 46, borderRadius: 6, border: `1.4 solid ${BRAND_HEX.primary}`,
    color: BRAND_HEX.primary, fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 12,
  },
  headRight: { alignItems: 'flex-end' },
  docTag: { color: BRAND_HEX.deepNavy, fontSize: 11, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  docMeta: { color: BRAND_HEX.primary, fontSize: 8, marginTop: 2 },
  accentRule: { position: 'absolute', top: 76, left: 0, right: 0, height: 2.4, backgroundColor: BRAND_HEX.accent },

  coverCard: {
    backgroundColor: BRAND_HEX.bandLight, borderLeft: `3 solid ${BRAND_HEX.primary}`,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10,
  },
  coverTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.deepNavy, marginBottom: 4 },
  coverLine: { fontSize: 9, color: BRAND_HEX.graphite, marginBottom: 2 },
  coverLabel: { fontFamily: 'Helvetica-Bold', color: BRAND_HEX.primary },

  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.white,
    backgroundColor: BRAND_HEX.primary, padding: '4 7', marginTop: 8, marginBottom: 5, letterSpacing: 0.4,
  },

  thead: { flexDirection: 'row', backgroundColor: BRAND_HEX.primary, color: BRAND_HEX.white, paddingVertical: 3 },
  row: { flexDirection: 'row', borderBottom: `0.3 solid ${BRAND_HEX.border}`, paddingVertical: 2 },
  rowAlt: { backgroundColor: BRAND_HEX.bandLight },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  // Índice
  iCode: { width: 60, paddingHorizontal: 3 },
  iName: { flex: 1, paddingHorizontal: 3 },
  iUnit: { width: 34, paddingHorizontal: 3 },
  iCost: { width: 66, paddingHorizontal: 3, textAlign: 'right' },
  iChap: { width: 90, paddingHorizontal: 3 },
  iStat: { width: 50, paddingHorizontal: 3 },

  // Ficha APU
  apuCard: { marginTop: 8, marginBottom: 4, border: `0.6 solid ${BRAND_HEX.border}`, borderRadius: 3 },
  apuHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: BRAND_HEX.deepNavy, paddingVertical: 4, paddingHorizontal: 7,
  },
  apuCode: { color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  apuCost: { color: BRAND_HEX.white, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  apuMeta: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 3, paddingHorizontal: 7, gap: 10 },
  apuMetaItem: { fontSize: 7.5, color: BRAND_HEX.graphite },
  apuMetaLabel: { fontFamily: 'Helvetica-Bold', color: BRAND_HEX.primary },
  warn: { fontSize: 7.5, color: BRAND_HEX.deepNavy, fontFamily: 'Helvetica-Bold', paddingHorizontal: 7, paddingBottom: 2 },
  note: { fontSize: 6.8, color: BRAND_HEX.muted, paddingHorizontal: 7, paddingVertical: 2 },

  // Componentes
  cType: { width: 66, paddingHorizontal: 3 },
  cRes: { flex: 1, paddingHorizontal: 3 },
  cQty: { width: 58, paddingHorizontal: 3, textAlign: 'right' },
  cWaste: { width: 44, paddingHorizontal: 3, textAlign: 'right' },
  cPrice: { width: 60, paddingHorizontal: 3, textAlign: 'right' },
  cSub: { width: 64, paddingHorizontal: 3, textAlign: 'right' },

  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, paddingHorizontal: 7 },
  sumLabel: { fontSize: 7.5, color: BRAND_HEX.graphite },
  sumVal: { fontSize: 7.5, textAlign: 'right' },
  sumTotRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 7,
    backgroundColor: BRAND_HEX.bandLight, borderTop: `0.6 solid ${BRAND_HEX.border}`,
  },
  sumTotLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: BRAND_HEX.deepNavy },
  sumTotVal: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

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
  try { num = new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber(); } catch { num = 0; }
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(num);
}
function pctFrac(value: string): string {
  let num = 0;
  try { num = new Decimal(value).times(100).toDecimalPlaces(2).toNumber(); } catch { num = 0; }
  return `${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)}%`;
}

const h = React.createElement;

const TYPE_LABEL: Record<string, string> = {
  material: 'Material', labor: 'Mano de obra', equipment: 'Equipo',
  tool: 'Herramienta', subcontract: 'Subcontrato', other: 'Otro',
};
function apuStatus(apu: LinkedApuView): string {
  if (apu.archived) return 'Archivado';
  if (apu.incomplete) return 'Incompleto';
  return 'Activo';
}
function componentResource(c: ApuComponentView): string {
  return (
    c.resourceName ?? c.laborRoleName ?? c.resourceCode ?? c.laborRoleCode ??
    TYPE_LABEL[c.componentType] ?? '—'
  );
}

function bandHeader(payload: BudgetApuExportSelection['payload']): React.ReactElement {
  const logoFull = getLogoDataUri('full');
  return h(
    View,
    { style: styles.header, fixed: true },
    logoFull
      ? h(Image, { style: styles.logoImg, src: logoFull })
      : h(Text, { style: styles.monogram }, BRAND.monogram),
    h(
      View,
      { style: styles.headRight },
      h(Text, { style: styles.docTag }, 'ANEXO · APU VINCULADOS'),
      h(Text, { style: styles.docMeta }, `${payload.version.label} · ${payload.version.status}`),
    ),
  );
}

function footer(fecha: string): React.ReactElement {
  const logoSymbol = getLogoDataUri('symbol');
  return h(
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
}

function apuFiche(apu: LinkedApuView, key: string): React.ReactElement {
  const compHeader = h(
    View,
    { style: styles.thead },
    h(Text, { style: [styles.cType, styles.th] }, 'Tipo'),
    h(Text, { style: [styles.cRes, styles.th] }, 'Recurso / Rol'),
    h(Text, { style: [styles.cQty, styles.th] }, 'Cantidad'),
    h(Text, { style: [styles.cWaste, styles.th] }, 'Desp.'),
    h(Text, { style: [styles.cPrice, styles.th] }, 'P. unit.'),
    h(Text, { style: [styles.cSub, styles.th] }, 'Subtotal'),
  );
  const compRows = [...apu.components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c, i) =>
      h(
        View,
        { key: `c-${i}`, style: i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row },
        h(Text, { style: styles.cType }, cleanText(TYPE_LABEL[c.componentType] ?? c.componentType)),
        h(Text, { style: styles.cRes }, cleanText(componentResource(c))),
        h(Text, { style: styles.cQty }, qty(c.quantity)),
        h(Text, { style: styles.cWaste }, pctFrac(c.wastePct)),
        h(Text, { style: styles.cPrice }, cop(c.unitPriceSnapshot)),
        h(Text, { style: styles.cSub }, cop(c.totalComponentCost)),
      ),
    );

  const sumLine = (label: string, value: string) =>
    h(
      View,
      { style: styles.sumRow, key: label },
      h(Text, { style: styles.sumLabel }, label),
      h(Text, { style: styles.sumVal }, cop(value)),
    );

  const boqRows = apu.boqLinks.map((l, i) =>
    h(
      View,
      { key: `b-${i}`, style: i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row },
      h(Text, { style: styles.cType }, cleanText(l.chapterCode)),
      h(Text, { style: styles.iCode }, cleanText(l.itemCode)),
      h(Text, { style: styles.cRes }, cleanText(l.itemDescription)),
    ),
  );

  return h(
    View,
    { key, style: styles.apuCard, wrap: true },
    h(
      View,
      { style: styles.apuHead },
      h(Text, { style: styles.apuCode }, cleanText(`${apu.code} · ${apu.name}`)),
      h(Text, { style: styles.apuCost }, cop(apu.unitCostTotal)),
    ),
    h(
      View,
      { style: styles.apuMeta },
      h(Text, { style: styles.apuMetaItem }, h(Text, { style: styles.apuMetaLabel }, 'Unidad: '), cleanText(apu.unit)),
      h(Text, { style: styles.apuMetaItem }, h(Text, { style: styles.apuMetaLabel }, 'Origen: '), cleanText(apu.origin)),
      h(Text, { style: styles.apuMetaItem }, h(Text, { style: styles.apuMetaLabel }, 'Estado: '), apuStatus(apu)),
      h(Text, { style: styles.apuMetaItem }, h(Text, { style: styles.apuMetaLabel }, 'Componentes: '), String(apu.componentCount)),
    ),
    apu.archived
      ? h(Text, { style: styles.warn }, 'APU archivado: preservado por vínculo histórico a una versión emitida.')
      : null,
    apu.incomplete
      ? h(Text, { style: styles.warn }, 'APU incompleto: costo unitario en cero o componentes sin precio aprobado.')
      : null,
    compHeader,
    ...compRows,
    h(Text, { style: styles.sectionTitle }, 'RESUMEN DE COSTOS'),
    sumLine('Materiales', apu.unitCostMaterials),
    sumLine('Mano de obra', apu.unitCostLabor),
    sumLine('Equipos', apu.unitCostEquipment),
    sumLine('Herramienta menor (incl. derivada)', apu.unitCostTools),
    sumLine('Subcontratos', apu.unitCostSubcontract),
    sumLine('Otros', apu.unitCostOther),
    h(
      View,
      { style: styles.sumTotRow },
      h(Text, { style: styles.sumTotLabel }, 'TOTAL UNITARIO'),
      h(Text, { style: styles.sumTotVal }, cop(apu.unitCostTotal)),
    ),
    h(Text, { style: styles.note }, 'El valor presupuestado del ítem BOQ usa el snapshot del momento del alta; este APU muestra su cálculo actual y puede diferir.'),
    h(Text, { style: styles.sectionTitle }, 'BOQ VINCULADO'),
    ...boqRows,
  );
}

/** Páginas del anexo APU: portada + índice + fichas (para composición). */
export function buildApuPages(selection: BudgetApuExportSelection): React.ReactElement[] {
  const { payload, linkedApus, counts } = selection;
  const fecha = new Date(payload.generatedAt).toLocaleDateString('es-CO');

  // Portada + índice.
  const indexHeader = h(
    View,
    { style: styles.thead },
    h(Text, { style: [styles.iCode, styles.th] }, 'Código'),
    h(Text, { style: [styles.iName, styles.th] }, 'Actividad'),
    h(Text, { style: [styles.iUnit, styles.th] }, 'Und'),
    h(Text, { style: [styles.iCost, styles.th] }, 'C. unitario'),
    h(Text, { style: [styles.iChap, styles.th] }, 'Capítulo'),
    h(Text, { style: [styles.iStat, styles.th] }, 'Estado'),
  );
  const indexRows = linkedApus.map((apu, i) =>
    h(
      View,
      { key: `i-${i}`, style: i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row },
      h(Text, { style: styles.iCode }, cleanText(apu.code)),
      h(Text, { style: styles.iName }, cleanText(apu.name)),
      h(Text, { style: styles.iUnit }, cleanText(apu.unit)),
      h(Text, { style: styles.iCost }, cop(apu.unitCostTotal)),
      h(Text, { style: styles.iChap }, cleanText(apu.primaryChapterName || apu.primaryChapterCode)),
      h(Text, { style: styles.iStat }, apuStatus(apu)),
    ),
  );

  const coverPage = h(
    Page,
    { key: 'cover', size: 'A4', style: styles.page },
    bandHeader(payload),
    h(View, { style: styles.accentRule, fixed: true }),
    h(
      View,
      { style: styles.coverCard },
      h(Text, { style: styles.coverTitle }, cleanText(payload.estimate.name)),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'Organización: '), cleanText(payload.organizationName)),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'Proyecto: '), cleanText(`${payload.project.name}${payload.project.city ? ' · ' + payload.project.city : ''}`)),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'Alcance: '), cleanText(payload.scope.name ?? '—')),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'Versión: '), `${payload.version.label} · ${payload.version.status}`),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'Fecha: '), fecha),
      h(Text, { style: styles.coverLine }, h(Text, { style: styles.coverLabel }, 'APU vinculados: '), `${counts.linkedApu}  ·  Ítems BOQ: ${counts.boqItems}  ·  Sin vínculo: ${counts.unlinkedItems}`),
    ),
    h(Text, { style: styles.sectionTitle }, 'ÍNDICE DE APU VINCULADOS'),
    indexHeader,
    ...(indexRows.length > 0
      ? indexRows
      : [h(Text, { key: 'empty', style: styles.note }, 'Este presupuesto no tiene APU vinculados a sus ítems BOQ.')]),
    footer(fecha),
  );

  // Fichas (flujo con wrap; paginación automática).
  const fichesPage = linkedApus.length > 0
    ? h(
        Page,
        { key: 'fiches', size: 'A4', style: styles.page },
        bandHeader(payload),
        h(View, { style: styles.accentRule, fixed: true }),
        h(Text, { style: styles.sectionTitle }, 'FICHAS DE ANÁLISIS DE PRECIOS UNITARIOS'),
        ...linkedApus.map((apu, i) => apuFiche(apu, `f-${i}`)),
        footer(fecha),
      )
    : null;

  return fichesPage ? [coverPage, fichesPage] : [coverPage];
}

/** Genera el PDF del anexo de APU vinculados (portada + índice + fichas). */
export async function generateLinkedApuPdf(selection: BudgetApuExportSelection): Promise<Uint8Array> {
  const doc = h(
    Document,
    { title: `APU vinculados ${selection.payload.estimate.name}`, author: BRAND.name, creator: 'Construction Ops', producer: 'Construction Ops' },
    ...buildApuPages(selection),
  );
  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}

/** Genera el PDF del PAQUETE COMPLETO: presupuesto + anexos APU. */
export async function generatePackagePdf(selection: BudgetApuExportSelection): Promise<Uint8Array> {
  const doc = h(
    Document,
    { title: `Paquete presupuesto + APU ${selection.payload.estimate.name}`, author: BRAND.name, creator: 'Construction Ops', producer: 'Construction Ops' },
    buildBudgetPage(selection.payload),
    ...buildApuPages(selection),
  );
  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
