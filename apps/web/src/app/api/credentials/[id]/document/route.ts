import { handle, json, session, mutation } from '@/server/http';
import { createDocument, documentStatus } from '@/server/documents';
import { credentialJson } from '@/server/credentials-request';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(async () => json(await documentStatus(await session(request), (await context.params).id))); }
export async function POST(request: Request, context: Context) { return handle(async () => { const current = await mutation(request); return json(await createDocument(request, current, (await context.params).id, await credentialJson(request)), 202); }); }
