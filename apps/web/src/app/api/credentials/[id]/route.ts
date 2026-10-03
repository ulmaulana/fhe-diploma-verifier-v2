import { inspectCredential } from '@/server/credentials';
import { handle, json } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (_request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const { id } = await context.params;
  const { verification, signedCredential } = await inspectCredential(id);
  return json({ ...verification, signedCredential });
});
