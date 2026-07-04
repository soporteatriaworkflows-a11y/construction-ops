import { describe, expect, it } from 'vitest';
import { manualTakeoffHref, openManualTakeoff } from '@/lib/steel/open-takeoff';

describe('openManualTakeoff — navegacion garantizada (F6A hotfix)', () => {
  it('construye el href del workspace del takeoff', () => {
    expect(manualTakeoffHref('mtk-demo-lectura')).toBe('/steel/takeoffs/mtk-demo-lectura');
  });

  it('hace push inmediato y programa la verificacion de fallback', () => {
    const pushed: string[] = [];
    let scheduledMs = -1;
    const href = openManualTakeoff((h) => pushed.push(h), 'mtk-demo-lectura', {
      schedule: (_fn, ms) => {
        scheduledMs = ms;
      },
      getPathname: () => '/steel/takeoffs',
      assign: () => {},
    });

    expect(href).toBe('/steel/takeoffs/mtk-demo-lectura');
    expect(pushed).toEqual(['/steel/takeoffs/mtk-demo-lectura']);
    expect(scheduledMs).toBe(2500);
  });

  it('fuerza location.assign cuando la URL no cambio tras el margen', () => {
    const assigned: string[] = [];
    openManualTakeoff(() => {}, 'mtk-demo-lectura', {
      schedule: (fn) => fn(),
      getPathname: () => '/steel/takeoffs',
      assign: (h) => assigned.push(h),
    });
    expect(assigned).toEqual(['/steel/takeoffs/mtk-demo-lectura']);
  });

  it('NO fuerza assign cuando la navegacion SPA si ocurrio', () => {
    const assigned: string[] = [];
    openManualTakeoff(() => {}, 'mtk-demo-lectura', {
      schedule: (fn) => fn(),
      getPathname: () => '/steel/takeoffs/mtk-demo-lectura',
      assign: (h) => assigned.push(h),
    });
    expect(assigned).toEqual([]);
  });

  it('es seguro fuera del navegador (SSR/Node): no lanza sin window', () => {
    expect(() => openManualTakeoff(() => {}, 'mtk-demo-lectura')).not.toThrow();
  });
});
