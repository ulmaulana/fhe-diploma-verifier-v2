import { isAddress, verifyMessage } from 'ethers';
import { getIssuer } from '@verifikasi/chain/server';
import { handle, json, mutation, session } from '@/server/http';
import { withState } from '@/server/store';
import { ApiError, config } from '@/server/config';
export const runtime = 'nodejs';
export const GET = (request: Request) => handle(async () => {
  const current = await session(request);
  return json({ wallet: current.wallet || null, mode: config().mode });
});
export const DELETE = (request: Request) => handle(async () => {
  const current = await mutation(request);
  await withState(state => {
    const item = state.sessions[current.id]!;
    delete item.wallet; delete item.challenge; delete item.challengeExpiresAt;
  });
  return json({ wallet: null, mode: config().mode });
});
export const POST = (request: Request) => handle(async () => {
  const current = await mutation(request); const { address, signature } = await request.json();
  if (typeof address !== 'string' || !isAddress(address) || typeof signature !== 'string') throw new ApiError(400, 'INVALID_SIGNATURE', 'Tanda tangan wallet tidak valid.');
  const wallet = await withState(state => {
    const item = state.sessions[current.id]!;
    if (!item.challenge || !item.challengeExpiresAt || Date.parse(item.challengeExpiresAt) <= Date.now()) throw new ApiError(401, 'CHALLENGE_EXPIRED', 'Permintaan tanda tangan telah berakhir.');
    let signer: string; try { signer = verifyMessage(item.challenge, signature); } catch { throw new ApiError(401, 'INVALID_SIGNATURE', 'Tanda tangan wallet tidak valid.'); }
    if (signer.toLowerCase() !== address.toLowerCase() || !item.challenge.includes(`Wallet: ${signer}\n`)) throw new ApiError(401, 'INVALID_SIGNATURE', 'Tanda tangan tidak sesuai wallet yang dipilih.');
    item.wallet = signer; delete item.challenge; delete item.challengeExpiresAt;
    return signer;
  });
  const issuer = config().mode === 'testnet' ? await getIssuer(wallet) : null;
  return json({ wallet, issuer, mode: config().mode });
});
