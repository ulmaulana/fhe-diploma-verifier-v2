import { dispatchVerification } from '@/server/dispatch';
import { handle, json, mutation } from '@/server/http';
import { publicJob } from '@/server/jobs';
import { finalizeUpload } from '@/server/uploads';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const current = await mutation(request);
  const job = await finalizeUpload(request, current, (await context.params).id);
  await dispatchVerification(job.id);
  return json(await publicJob(job), 202);
});
