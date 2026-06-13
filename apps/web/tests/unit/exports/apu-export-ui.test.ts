/**
 * apu-export-ui.test.ts — Lógica PURA del menú «Exportar» (APU_EXPORTS_V1).
 * Casos 24–29. El entorno de test es `node` (sin DOM); se valida la lógica que
 * dirige la habilitación de opciones, conteos y advertencias del componente.
 */
import { describe, it, expect } from 'vitest';
import {
  apuOptionsEnabled,
  showNoApuMessage,
  showArchivedIncluded,
  exportWarnings,
  buildExportQuery,
  type ExportCounts,
} from '@/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/export-menu-logic';

const base: ExportCounts = {
  boqItems: 131, linkedApu: 0, unlinkedItems: 131,
  archivedIncluded: 0, archivedExcluded: 0, incomplete: 0,
};

describe('Menú Exportar — lógica', () => {
  it('24. el menú dispone de las 6 descargas (query por kind+format)', () => {
    const kinds = ['budget', 'apu', 'package'] as const;
    const formats = ['xlsx', 'pdf'] as const;
    const urls = kinds.flatMap((kind) =>
      formats.map((format) =>
        buildExportQuery({ format, kind, estimateId: 'e', projectId: 'p', scopeId: 's' }),
      ),
    );
    expect(urls).toHaveLength(6);
    expect(urls[0]).toContain('kind=budget');
    expect(urls.some((u) => u.includes('kind=apu') && u.includes('format=pdf'))).toBe(true);
    expect(urls.some((u) => u.includes('kind=package') && u.includes('format=xlsx'))).toBe(true);
  });

  it('25. opciones APU deshabilitadas sin APU vinculados', () => {
    expect(apuOptionsEnabled(base)).toBe(false);
    expect(showNoApuMessage(base)).toBe(true);
  });

  it('26. opciones APU habilitadas con APU vinculados', () => {
    const c = { ...base, linkedApu: 3 };
    expect(apuOptionsEnabled(c)).toBe(true);
    expect(showNoApuMessage(c)).toBe(false);
  });

  it('27. conteos visibles (incluye archivados por snapshot histórico)', () => {
    expect(showArchivedIncluded({ ...base, linkedApu: 2, archivedIncluded: 1 })).toBe(true);
    expect(showArchivedIncluded(base)).toBe(false);
  });

  it('28. advertencias visibles (incompletos y archivados excluidos)', () => {
    const c = { ...base, linkedApu: 2, incomplete: 1, archivedExcluded: 2 };
    const w = exportWarnings(c);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('incompleto');
    expect(w[1]).toContain('archivado');
    // Sin APU vinculados ⇒ sin advertencias (no se exporta anexo).
    expect(exportWarnings({ ...base, incomplete: 5 })).toHaveLength(0);
  });

  it('29. counts nulos ⇒ menú sin conteos ni mensajes (sin estado roto)', () => {
    expect(apuOptionsEnabled(null)).toBe(false);
    expect(showNoApuMessage(null)).toBe(false);
    expect(exportWarnings(null)).toEqual([]);
    expect(showArchivedIncluded(undefined)).toBe(false);
  });
});
