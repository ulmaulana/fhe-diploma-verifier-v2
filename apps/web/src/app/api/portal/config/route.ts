import { handle, json, session } from '@/server/http';
import { config } from '@/server/config';
import { portalDocuments } from '@/server/documents';
import { portalState } from '@verifikasi/chain/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request:Request) => handle(async()=>{
  const current=await session(request);
  const offset=Number(new URL(request.url).searchParams.get('offset')||0);
  const portal=current.wallet&&config().mode==='testnet'?await portalState(current.wallet,Number.isSafeInteger(offset)&&offset>=0?offset:0):null;
  // Row PDF statuses ship with the rows so the list renders at once instead of row by row.
  return json({mode:config().mode,chainId:Number(process.env.CHAIN_ID||11155111),contractAddress:process.env.CREDENTIAL_CONTRACT_ADDRESS||null,
    portal:portal&&{...portal,documents:await portalDocuments(portal)}});
});
