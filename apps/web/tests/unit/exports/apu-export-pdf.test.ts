/**
 * apu-export-pdf.test.ts — PDF del anexo APU y del paquete (APU_EXPORTS_V1).
 * Casos 19–23 del mandato. Valida bytes PDF y saneamiento de texto.
 */
import { describe, it, expect } from 'vitest';
import {
  generateLinkedApuPdf,
  generatePackagePdf,
  cleanText,
  isFormulaInjection,
} from '@/server/estimates/export/apu-annex';
import { generateEstimatePdf } from '@/server/estimates/export';
import { selection, linkedApu, basePayload } from './apu-export-fixtures';

function isPdf(buf: Uint8Array): boolean {
  // Cabecera "%PDF-"
  return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

describe('APU export — PDF', () => {
  it('19. presupuesto PDF existente intacto (genera %PDF)', async () => {
    const buf = await generateEstimatePdf(basePayload());
    expect(isPdf(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it('20. APU vinculados PDF genera un PDF válido (índice + portada)', async () => {
    const buf = await generateLinkedApuPdf(selection());
    expect(isPdf(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it('21. APU vinculados PDF con varias fichas genera PDF válido', async () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      linkedApu({ apuTemplateId: `a${i}`, code: `APU-${i}` }),
    );
    const buf = await generateLinkedApuPdf(selection({ linkedApus: many }));
    expect(isPdf(buf)).toBe(true);
  });

  it('22. paquete completo PDF incluye BOQ + anexos (PDF válido)', async () => {
    const buf = await generatePackagePdf(selection());
    expect(isPdf(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1500);
  });

  it('23. texto escapado/sanitizado (control chars y fórmulas)', () => {
    expect(cleanText('a\tb\tc')).toBe('a b c');
    expect(cleanText(null)).toBe('');
    expect(isFormulaInjection('=SUM(A1)')).toBe(true);
    expect(isFormulaInjection('Cemento')).toBe(false);
  });

  it('23b. PDF sin APU vinculados sigue generando portada válida', async () => {
    const buf = await generateLinkedApuPdf(
      selection({
        linkedApus: [],
        counts: { boqItems: 2, linkedApu: 0, unlinkedItems: 2, archivedIncluded: 0, archivedExcluded: 0, incomplete: 0 },
      }),
    );
    expect(isPdf(buf)).toBe(true);
  });
});
