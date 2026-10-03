import { handle, session } from '@/server/http';
import { readJob } from '@/server/jobs';
import { report } from '@/server/reports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => { const current = await session(request); const id = (await context.params).id; const pdf = await report(await readJob(id, current.id)); return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="verifikasi-${id}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); });
