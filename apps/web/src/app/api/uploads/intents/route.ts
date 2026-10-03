import { handle, json, mutation } from '@/server/http';
import { createUploadIntent } from '@/server/upload-intents';
import { smallJson } from '@/server/uploads';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(async () => {
  const current = await mutation(request);
  const intent = await createUploadIntent(request, current, await smallJson(request));
  return json({ id: intent.id, pathname: intent.pathname, expiresAt: intent.expiresAt, finalized: Boolean(intent.jobId) }, 201);
});
