/**
 * instance-branding.test.ts — Configuración centralizada de branding por
 * instancia + login ICONIC OPS (Oleada ICONIC OPS LOGIN + INSTANCE-READY
 * BRANDING). Lógica pura + guardas a nivel de fuente. Sin red ni DB.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ICONIC_OPS_DEFAULTS,
  resolveInstanceBranding,
  getInstanceBranding,
} from '@/lib/branding/instance';
import { getActiveWorkspace, ICONIC_THEME } from '@/lib/branding/workspace';

const authLayoutSrc = readFileSync(
  join(__dirname, '..', '..', '..', 'app', '(auth)', 'layout.tsx'),
  'utf8',
);
const instanceSrc = readFileSync(
  join(__dirname, '..', '..', '..', 'lib', 'branding', 'instance.ts'),
  'utf8',
);

describe('Defaults públicos ICONIC OPS', () => {
  it('producto, workspace, descriptor y assets correctos', () => {
    const b = resolveInstanceBranding();
    expect(b.productName).toBe('ICONIC OPS');
    expect(b.workspaceName).toBe('Grupo ICONIC');
    expect(b.descriptor).toBe('Gestión de presupuestos de obra');
    expect(b.logoFull).toBe('/branding/iconic/grupo-iconic-logo-full.png');
    expect(b.logoSymbol).toBe('/branding/iconic/grupo-iconic-logo-symbol.png');
    expect(b.initials).toBe('GI');
  });

  it('Powered by ATRIA BUDGET OPS visible por defecto', () => {
    const b = resolveInstanceBranding();
    expect(b.poweredByLabel).toBe('ATRIA BUDGET OPS');
    expect(b.showPoweredBy).toBe(true);
  });

  it('getInstanceBranding sin overrides de entorno devuelve los defaults', () => {
    expect(getInstanceBranding()).toEqual(ICONIC_OPS_DEFAULTS);
  });
});

describe('Overrides NEXT_PUBLIC seguros (resolución pura)', () => {
  it('aplica overrides de texto válidos', () => {
    const b = resolveInstanceBranding({
      productName: 'OBRAS PRO',
      workspaceName: 'Constructora Andina',
      descriptor: 'Control de obra y presupuesto',
    });
    expect(b.productName).toBe('OBRAS PRO');
    expect(b.workspaceName).toBe('Constructora Andina');
    expect(b.descriptor).toBe('Control de obra y presupuesto');
  });

  it('sanitiza texto: sin <script>, sin control chars, largo acotado', () => {
    const b = resolveInstanceBranding({
      productName: '  <script>alert(1)</script>OPS  ',
      workspaceName: 'A'.repeat(500),
      descriptor: 'línea\u0007con\u001Fcontrol',
    });
    expect(b.productName).not.toContain('<');
    expect(b.productName).not.toContain('>');
    expect(b.workspaceName.length).toBeLessThanOrEqual(80);
    expect(b.descriptor).toBe('líneaconcontrol');
  });

  it('override vacío o solo espacios conserva el default', () => {
    const b = resolveInstanceBranding({ productName: '   ', workspaceName: '' });
    expect(b.productName).toBe('ICONIC OPS');
    expect(b.workspaceName).toBe('Grupo ICONIC');
  });

  it('logos: acepta ruta same-origin y https; el resto cae al default', () => {
    expect(resolveInstanceBranding({ logoFull: '/branding/acme/logo.png' }).logoFull).toBe(
      '/branding/acme/logo.png',
    );
    expect(resolveInstanceBranding({ logoFull: 'https://cdn.acme.co/logo.png' }).logoFull).toBe(
      'https://cdn.acme.co/logo.png',
    );
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,xxxx',
      '//evil.example.com/logo.png',
      'http://insecure.example.com/logo.png',
      '/path with spaces.png',
      '/quote".png',
      'relative/logo.png',
    ]) {
      expect(resolveInstanceBranding({ logoFull: bad }).logoFull).toBe(
        ICONIC_OPS_DEFAULTS.logoFull,
      );
    }
  });

  it('iniciales: mayúsculas y máximo 3 caracteres', () => {
    expect(resolveInstanceBranding({ initials: 'abcd' }).initials).toBe('ABC');
  });

  it('showPoweredBy: 0/false/off/hidden ocultan; otros valores muestran', () => {
    for (const off of ['0', 'false', 'OFF', 'hidden']) {
      expect(resolveInstanceBranding({ showPoweredBy: off }).showPoweredBy).toBe(false);
    }
    for (const on of ['1', 'true', 'yes']) {
      expect(resolveInstanceBranding({ showPoweredBy: on }).showPoweredBy).toBe(true);
    }
    expect(resolveInstanceBranding({}).showPoweredBy).toBe(true);
  });

  it('poweredByLabel NO es sobreescribible (identidad de plataforma)', () => {
    const b = resolveInstanceBranding({ productName: 'X' });
    expect(b.poweredByLabel).toBe('ATRIA BUDGET OPS');
    // La forma de overrides no expone el campo:
    expect(instanceSrc).not.toMatch(/poweredByLabel\?\s*:/);
  });
});

describe('getActiveWorkspace deriva de la instancia (fuente única)', () => {
  it('naming/assets de la instancia + tokens ICONIC intactos', () => {
    const ws = getActiveWorkspace();
    expect(ws.productName).toBe('ICONIC OPS');
    expect(ws.workspaceName).toBe('Grupo ICONIC');
    expect(ws.logoFull).toBe(ICONIC_OPS_DEFAULTS.logoFull);
    expect(ws.theme).toEqual(ICONIC_THEME);
    expect(ws.theme.primary).toBe('#005DD6');
    expect(ws.theme.cyan).toBe('#00B8FF');
  });
});

describe('Login shell — guardas a nivel de fuente', () => {
  it('usa la configuración de instancia (no naming hardcodeado)', () => {
    expect(authLayoutSrc).toMatch(/getInstanceBranding/);
    expect(authLayoutSrc).toMatch(/getActiveWorkspace/);
  });

  it('referencia discreta Powered by (condicional a showPoweredBy)', () => {
    expect(authLayoutSrc).toMatch(/showPoweredBy/);
    expect(authLayoutSrc).toMatch(/Powered by/);
    expect(authLayoutSrc).toMatch(/poweredByLabel/);
  });

  it('responsive: franja de marca móvil + bloque lateral solo en lg', () => {
    expect(authLayoutSrc).toMatch(/lg:hidden/);
    expect(authLayoutSrc).toMatch(/hidden w-1\/2 [\s\S]{0,40}lg:block/);
    expect(authLayoutSrc).toMatch(/min-h-dvh/);
  });

  it('accesibilidad: decoraciones aria-hidden y landmark main', () => {
    expect(authLayoutSrc).toMatch(/aria-hidden="true"/);
    expect(authLayoutSrc).toMatch(/<main/);
  });

  it('sin secretos: el shell no lee variables que no sean de branding', () => {
    expect(authLayoutSrc).not.toMatch(/process\.env/);
    // Solo formas de variables sensibles (mayúsculas); los comentarios en
    // español ("secretos") no cuentan.
    expect(instanceSrc).not.toMatch(/SERVICE_ROLE|_SECRET|SECRET_|PASSWORD|_TOKEN|TOKEN_/);
    // Toda variable leída debe ser NEXT_PUBLIC_INSTANCE_*:
    const envReads = instanceSrc.match(/process\.env\.[A-Z0-9_]+/g) ?? [];
    expect(envReads.length).toBeGreaterThan(0);
    for (const read of envReads) {
      expect(read).toMatch(/^process\.env\.NEXT_PUBLIC_/);
    }
  });
});
