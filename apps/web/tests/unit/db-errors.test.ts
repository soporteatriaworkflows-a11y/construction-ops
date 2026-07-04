import { describe, expect, it } from 'vitest';

import {
  DB_POOL_EXHAUSTED_MESSAGE,
  getFriendlyDataLoadError,
  isDbPoolExhaustedError,
} from '@/lib/db/errors';

describe('db data-load errors', () => {
  it('detects Supavisor session pool exhaustion by code and message', () => {
    const error = {
      code: 'EMAXCONNSESSION',
      message: 'max clients reached in session mode - max clients are limited to pool_size: 15',
    };

    expect(isDbPoolExhaustedError(error)).toBe(true);
  });

  it('detects pool exhaustion nested in an Error cause', () => {
    const error = new Error('query failed', {
      cause: new Error('(EMAXCONNSESSION) max clients reached in session mode'),
    });

    expect(isDbPoolExhaustedError(error)).toBe(true);
  });

  it('returns friendly copy without leaking technical details', () => {
    const friendly = getFriendlyDataLoadError(
      new Error('(EMAXCONNSESSION) max clients reached in session mode - pool_size: 15'),
    );

    expect(friendly).toBe(DB_POOL_EXHAUSTED_MESSAGE);
    expect(friendly).not.toContain('EMAXCONNSESSION');
    expect(friendly).not.toContain('pool_size');
    expect(friendly).not.toContain('max clients');
  });

  it('uses the provided fallback for unrelated errors', () => {
    expect(getFriendlyDataLoadError(new Error('network down'), 'fallback amable')).toBe('fallback amable');
  });
});