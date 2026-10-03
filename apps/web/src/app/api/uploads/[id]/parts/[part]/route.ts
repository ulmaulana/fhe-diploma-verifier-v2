import { handle, json, mutation } from '@/server/http';
import { uploadNetlifyPart } from '@/server/netlify-uploads';
export const runtime = 'nodejs';
export const PUT = (request: Request, context: { params: Promise<{ id: string; part: string }> }) => handle(async () => {
  const current = await mutation(request);
  const { id, part } = await context.params;
  return json(await uploadNetlifyPart(request, current, id, part));
});
