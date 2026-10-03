import { afterEach, expect, it, vi } from 'vitest';
import { readWithRetry, diagnostic } from '../../src/server/diagnostics';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('preserves safe configuration codes without exposing key contents', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(diagnostic('CONFIGURATION', { code: 'CHAIN_CONFIGURATION_INVALID', message: 'private key contents' })).toBe('CHAIN_CONFIGURATION_INVALID');
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'verification_failure', stage: 'CONFIGURATION', code: 'CHAIN_CONFIGURATION_INVALID' })]]);
});
it('bounds transient RPC retries and succeeds without logging sensitive exceptions', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const read = vi.fn().mockRejectedValueOnce({ code: 'NETWORK_ERROR', message: 'sensitive RPC endpoint' }).mockResolvedValue('record');
  const pending = readWithRetry('RPC', read);
  await vi.runAllTimersAsync();
  expect(await pending).toBe('record'); expect(read).toHaveBeenCalledTimes(2); expect(log).not.toHaveBeenCalled();
});
it('does not retry permanent proof database failures or log connection values', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const read = vi.fn().mockRejectedValue({ code: '42P01', message: 'private connection details' });
  await expect(readWithRetry('PROOF_STORAGE', read)).rejects.toMatchObject({ code: '42P01' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'verification_failure', stage: 'PROOF_STORAGE', code: '42P01' })]]);
  diagnostic('FHE', { code: 'untrusted data', message: 'private diploma values' });
  expect(log.mock.calls[1]).toEqual([JSON.stringify({ event: 'verification_failure', stage: 'FHE', code: 'FHE_UNAVAILABLE' })]);
});
