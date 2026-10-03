import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/server/config';
import { withState } from '../../src/server/store';
import { withDatabaseState } from '../../src/server/db/state';

vi.mock('../../src/server/db/client', () => ({ database: vi.fn(() => ({})) }));
vi.mock('../../src/server/db/state', () => ({ withDatabaseState: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('reports a wrapped database error without exposing its connection string or SQL', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://private-credentials');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const driverError = Object.assign(new Error('private connection details'), { code: '28P01' });
  vi.mocked(withDatabaseState).mockRejectedValueOnce(new Error('private SQL', { cause: driverError }));
  await expect(withState(() => undefined)).rejects.toMatchObject({ status: 503, code: 'SESSION_STORAGE_UNAVAILABLE' });
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'verification_failure', stage: 'SESSION_STORAGE', code: '28P01' })]]);
});

it('preserves application rejections such as invalid signatures and rate limits', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://private-credentials');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new ApiError(401, 'INVALID_SIGNATURE', 'Tanda tangan wallet tidak valid.');
  vi.mocked(withDatabaseState).mockRejectedValueOnce(error);
  await expect(withState(() => undefined)).rejects.toBe(error);
  expect(log).not.toHaveBeenCalled();
});
