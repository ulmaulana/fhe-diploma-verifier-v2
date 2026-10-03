import { handle, json, mutation, session } from '@/server/http';
import { eraseJob, publicJob, readJob } from '@/server/jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => handle(async () => { const current = await session(request); return json(await publicJob(await readJob((await context.params).id, current.id))); });
export const DELETE = (request: Request, context: Context) => handle(async () => { const current = await mutation(request); await eraseJob((await context.params).id, current.id); return json({ deleted: true }); });
