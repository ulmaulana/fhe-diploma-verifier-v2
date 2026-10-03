import { handle, json, mutation, session } from '@/server/http';
import { cleanup, createJob, publicJob } from '@/server/jobs';
import { withState } from '@/server/store';
import { dispatchVerification } from '@/server/dispatch';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => handle(async () => { const current = await mutation(request); const job = await createJob(request, current); await dispatchVerification(job.id); return json(await publicJob(job), 202); });
export const GET = (request: Request) => handle(async () => { const current = await session(request); await cleanup(); const jobs = await withState(state => Object.values(state.jobs).filter(job => job.owner === current.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); return json({ jobs: await Promise.all(jobs.map(publicJob)) }); });
