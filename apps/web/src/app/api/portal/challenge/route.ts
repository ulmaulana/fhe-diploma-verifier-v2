import { randomBytes } from 'node:crypto';
import { isAddress, getAddress } from 'ethers';
import { handle, json, mutation, limit } from '@/server/http';
import { withState } from '@/server/store';
import { ApiError, config } from '@/server/config';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(async () => {
  const current = await mutation(request); const { address } = await request.json();
  if (typeof address !== 'string' || !isAddress(address)) throw new ApiError(400, 'INVALID_WALLET', 'Alamat wallet tidak valid.');
  const nonce = randomBytes(24).toString('hex'); const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const message = `${new URL(config().origin).host} meminta Anda masuk ke portal verifikasi.\n\nWallet: ${getAddress(address)}\nOrigin: ${config().origin}\nNonce: ${nonce}\nBerlaku sampai: ${expiresAt}\n\nTanda tangan ini tidak mengirim transaksi atau memberikan akses referensi.`;
  await withState(state => { limit(state, `wallet:${current.id}`, 20, 3600_000); const item = state.sessions[current.id]!; item.challenge = message; item.challengeExpiresAt = expiresAt; });
  return json({ message, expiresAt });
});
