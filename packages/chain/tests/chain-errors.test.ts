import { describe, expect, it } from 'vitest';
import { makeError } from 'ethers';
import { describeChainError } from '../src/browser';
import { contractInterface } from '../src/shared';

describe('wallet and contract outcomes shown in the portal (7.3.4)', () => {
  it('reports a wallet cancellation as no transaction sent', () => {
    expect(describeChainError(makeError('user rejected action', 'ACTION_REJECTED', { action: 'sendTransaction', reason: 'rejected' })))
      .toBe('Permintaan dibatalkan di wallet. Tidak ada transaksi yang dikirim.');
  });

  it('decodes contract custom errors, including nested wallet error payloads', () => {
    const noop = contractInterface.encodeErrorResult('SignerAlreadyActive', []);
    expect(describeChainError(Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION', data: noop })))
      .toBe('Wallet sudah aktif sebagai penandatangan institusi ini; tidak ada perubahan. Tidak ada perubahan pada blockchain.');
    const conflict = contractInterface.encodeErrorResult('RoleConflict', ['0x' + '00'.repeat(32), '0x' + '11'.repeat(20)]);
    expect(describeChainError({ code: -32603, error: { data: { data: conflict } } })).toMatch(/peran admin atau layanan/);
    const admin = contractInterface.encodeErrorResult('AccessControlUnauthorizedAccount', ['0x' + '11'.repeat(20), '0x' + '00'.repeat(32)]);
    expect(describeChainError({ info: { error: { data: admin } } })).toMatch(/bukan administrator/);
  });

  it('reports a mined failure and keeps unknown errors verbatim', () => {
    expect(describeChainError(Object.assign(new Error('reverted'), { code: 'CALL_EXCEPTION', receipt: { status: 0 } }))).toMatch(/status 0/);
    expect(describeChainError(new Error('timeout'))).toBe('timeout');
  });
});
