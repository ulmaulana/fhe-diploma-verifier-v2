import { ApiError } from '@/server/config';
import { handle, json, safeEqual } from '@/server/http';
import { maintainJobs } from '@/server/maintenance';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handle(async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`)) throw new ApiError(401, 'UNAUTHORIZED', 'Otorisasi pemeliharaan diperlukan.');
  await maintainJobs();
  return json({ ok: true });
});
