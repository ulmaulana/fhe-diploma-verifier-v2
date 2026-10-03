import { submitCredentialProof } from '@/server/credentials';
import { credentialJson } from '@/server/credentials-request';
import { handle, json, mutation } from '@/server/http';
export const runtime = 'nodejs';
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const current = await mutation(request);
  const { id } = await context.params;
  const result = await submitCredentialProof(current, id, await credentialJson(request));
  return json(result, result.verification.recordVerificationStatus === 'PENDING' ? 202 : 200);
});
