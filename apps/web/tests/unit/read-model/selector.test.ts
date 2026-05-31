/**
 * selector.test.ts — El selector `READ_MODEL_SOURCE` elige la implementación
 * correcta, loguea el modo activo y NO hace fallback silencioso db→fixture.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import {
  getReadModel,
  resolveSource,
  FixtureReadModelRepository,
  DrizzleReadModelRepository,
  ReadModelSourceNotConfiguredError,
  type ReadModelLogger,
} from '@/server/read-model';

function captureLogger(): { logger: ReadModelLogger; messages: string[] } {
  const messages: string[] = [];
  return { logger: { info: (m) => messages.push(m) }, messages };
}

describe('read-model selector — resolveSource', () => {
  it('vacío/undefined ⇒ fixture (default)', () => {
    expect(resolveSource(undefined)).toBe('fixture');
    expect(resolveSource('')).toBe('fixture');
    expect(resolveSource('   ')).toBe('fixture');
  });

  it('reconoce fixture y db (case-insensitive)', () => {
    expect(resolveSource('fixture')).toBe('fixture');
    expect(resolveSource('DB')).toBe('db');
  });

  it('valor inválido ⇒ ReadModelSourceNotConfiguredError', () => {
    expect(() => resolveSource('postgres')).toThrow(ReadModelSourceNotConfiguredError);
  });
});

describe('read-model selector — getReadModel', () => {
  it('fixture ⇒ FixtureReadModelRepository y loguea el modo', () => {
    const { logger, messages } = captureLogger();
    const rm = getReadModel({ env: { READ_MODEL_SOURCE: 'fixture' }, logger });
    expect(rm).toBeInstanceOf(FixtureReadModelRepository);
    expect(messages.some((m) => m.includes('fixture'))).toBe(true);
  });

  it('default (sin variable) ⇒ fixture', () => {
    const { logger } = captureLogger();
    const rm = getReadModel({ env: {}, logger });
    expect(rm).toBeInstanceOf(FixtureReadModelRepository);
  });

  it('db SIN DATABASE_URL ⇒ ReadModelSourceNotConfiguredError (sin fallback)', () => {
    const { logger } = captureLogger();
    expect(() => getReadModel({ env: { READ_MODEL_SOURCE: 'db' }, logger })).toThrow(
      ReadModelSourceNotConfiguredError,
    );
  });

  it('db CON DATABASE_URL ⇒ DrizzleReadModelRepository y loguea el modo', () => {
    const { logger, messages } = captureLogger();
    const rm = getReadModel({
      env: {
        READ_MODEL_SOURCE: 'db',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      },
      logger,
    });
    expect(rm).toBeInstanceOf(DrizzleReadModelRepository);
    expect(messages.some((m) => m.includes('db'))).toBe(true);
  });
});
