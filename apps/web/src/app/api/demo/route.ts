import { handle, json, mutation } from '@/server/http';
import { createDemo } from '@/server/demo';
import { publicJob } from '@/server/jobs';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(async () => { const current = await mutation(request); const body = await request.json(); return json(await publicJob(await createDemo(current, body.scenario)), 201); });
