import { describe, expect, it } from 'vitest';

import { resolvePostgresPoolMax } from '@/lib/db';

describe('postgres pool configuration', () => {
  it('defaults to one connection per serverless instance', () => {
    expect(resolvePostgresPoolMax({})).toBe(1);
  });

  it('allows an explicit POSTGRES_POOL_MAX override', () => {
    expect(resolvePostgresPoolMax({ POSTGRES_POOL_MAX: '2' })).toBe(2);
  });

  it('falls back to DB_POOL_MAX when POSTGRES_POOL_MAX is absent', () => {
    expect(resolvePostgresPoolMax({ DB_POOL_MAX: '3' })).toBe(3);
  });

  it('sanitizes invalid and excessive values', () => {
    expect(resolvePostgresPoolMax({ POSTGRES_POOL_MAX: '0' })).toBe(1);
    expect(resolvePostgresPoolMax({ POSTGRES_POOL_MAX: 'abc' })).toBe(1);
    expect(resolvePostgresPoolMax({ POSTGRES_POOL_MAX: '99' })).toBe(10);
  });
});