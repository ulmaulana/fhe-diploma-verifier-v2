import { createCredentialDraft } from '@/server/credentials';
import { credentialJson } from '@/server/credentials-request';
import { handle, json, mutation } from '@/server/http';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(async () => {
  const current = await mutation(request);
  return json(await createCredentialDraft(current, await credentialJson(request)), 201);
});
