import { handle, session } from '@/server/http';
import { downloadDocument } from '@/server/documents';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => downloadDocument(await session(request), (await context.params).id)); }
