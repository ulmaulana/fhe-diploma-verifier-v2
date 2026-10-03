import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiError, config } from './config';
import { withState } from './store';
import { blobEnabled } from './storage';
import { netlifyBlobsEnabled } from './netlify-storage';
import type { Session, State } from './types';

const COOKIE = 'verifikasi_session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function safeEqual(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export async function handle(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    // Deliberately omit exception values: RPC errors and parser errors can include private inputs.
    return json({ error: 'Layanan sedang terganggu. Silakan coba lagi.', code: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
export function cookieToken(request: Request) { return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1); }
export async function session(request: Request): Promise<Session> {
  const token = cookieToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'SESSION_REQUIRED', 'Muat ulang halaman untuk memulai sesi aman.');
  const found = await withState(state => state.sessions[hashToken(token)]);
  if (!found || Date.parse(found.expiresAt) <= Date.now()) throw new ApiError(401, 'SESSION_EXPIRED', 'Sesi berakhir. Muat ulang halaman.');
  return found;
}
export async function bootstrap(request: Request) {
  let current: Session | undefined;
  try { current = await session(request); } catch { /* An expired cookie creates a fresh anonymous session. */ }
  let token: string | undefined;
  if (!current) {
    token = randomBytes(32).toString('hex');
    current = { id: hashToken(token), csrf: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + config().historyMs).toISOString() };
    await withState(state => { limit(state, `session:${source(request)}`, 60, 3600_000); state.sessions[current!.id] = current!; });
  }
  const cfg = config();
  const response = json({ csrfToken: current.csrf, expiresAt: current.expiresAt, mode: cfg.mode, configured: cfg.mode === 'demo' || Boolean(cfg.databaseUrl && process.env.RPC_URL && process.env.CREDENTIAL_CONTRACT_ADDRESS), uploadMode: netlifyBlobsEnabled() ? 'netlify' : blobEnabled() || process.env.VERCEL ? 'blob' : 'multipart', wallet: current.wallet || null });
  if (token) (response as NextResponse).cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: cfg.origin.startsWith('https://'), path: '/', maxAge: 86400 });
  return response;
}
export async function mutation(request: Request) {
  const current = await session(request);
  if (request.headers.get('origin') !== config().origin || !safeEqual(request.headers.get('x-csrf-token') || '', current.csrf)) throw new ApiError(403, 'CSRF_REJECTED', 'Permintaan tidak berasal dari sesi yang sah.');
  return current;
}
export function source(request: Request) {
  // Only enable forwarded headers behind an explicitly configured trusted reverse proxy.
  const ip = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'local';
  return hashToken(ip);
}
export function limit(state: State, bucket: string, max: number, windowMs: number) {
  const record = state.rates[bucket];
  if (!record || record.resetAt <= Date.now()) { state.rates[bucket] = { count: 1, resetAt: Date.now() + windowMs }; return; }
  if (record.count >= max) throw new ApiError(429, 'RATE_LIMITED', 'Kuota sementara tercapai. Silakan coba lagi nanti.');
  record.count++;
}
