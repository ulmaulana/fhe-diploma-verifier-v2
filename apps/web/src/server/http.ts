import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiError, config, isNetlify } from './config';
import { withState } from './store';
import { chunkedUploadsEnabled, vercelBlobEnabled } from './storage';
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
    const origin = clientSource(request);
    await withState(state => {
      // Every new session counts against a global cap; the per-source cap applies when the source is known.
      limit(state, 'session:global', 2000, 3600_000);
      if (origin.via !== 'unknown') limit(state, `session:${origin.key}`, 60, 3600_000);
      state.sessions[current!.id] = current!;
    });
  }
  const cfg = config();
  const response = json({ csrfToken: current.csrf, expiresAt: current.expiresAt, mode: cfg.mode, configured: cfg.mode === 'demo' || Boolean(cfg.databaseUrl && process.env.RPC_URL && process.env.CREDENTIAL_CONTRACT_ADDRESS), uploadMode: chunkedUploadsEnabled() ? 'chunked' : vercelBlobEnabled() || process.env.VERCEL ? 'blob' : 'multipart', wallet: current.wallet || null });
  if (token) (response as NextResponse).cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: cfg.origin.startsWith('https://'), path: '/', maxAge: 86400 });
  return response;
}
export async function mutation(request: Request) {
  const current = await session(request);
  if (request.headers.get('origin') !== config().origin || !safeEqual(request.headers.get('x-csrf-token') || '', current.csrf)) throw new ApiError(403, 'CSRF_REJECTED', 'Permintaan tidak berasal dari sesi yang sah.');
  return current;
}
const IP_ADDRESS = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]{2,39})$/;
export type SourceIdentity = { key: string; via: 'netlify' | 'vercel' | 'proxy' | 'local' | 'unknown' };
let untrustedSourceLogged = false;

/** Client identity for rate limits, taken only from headers the platform itself sets (S-08).
 * Netlify: x-nf-client-connection-ip. Vercel overwrites X-Forwarded-For and sends x-vercel-forwarded-for.
 * TRUST_PROXY=true: one trusted reverse proxy that appends the client to X-Forwarded-For (rightmost entry).
 * Client-supplied values of these headers are ignored everywhere else. */
export function clientSource(request: Request): SourceIdentity {
  const header = (name: string) => request.headers.get(name)?.trim();
  let ip: string | undefined; let via: SourceIdentity['via'];
  if (isNetlify()) { ip = header('x-nf-client-connection-ip'); via = 'netlify'; }
  else if (process.env.VERCEL === '1') { ip = header('x-vercel-forwarded-for')?.split(',')[0]?.trim(); via = 'vercel'; }
  else if (process.env.TRUST_PROXY === 'true') { ip = header('x-forwarded-for')?.split(',').at(-1)?.trim(); via = 'proxy'; }
  else return { key: hashToken('local'), via: 'local' };
  if (ip && IP_ADDRESS.test(ip)) return { key: hashToken(ip), via };
  if (!untrustedSourceLogged) { untrustedSourceLogged = true; console.error(JSON.stringify({ event: 'untrusted_client_source', via })); }
  return { key: hashToken('unknown'), via: 'unknown' };
}
export function source(request: Request) { return clientSource(request).key; }
export function limit(state: State, bucket: string, max: number, windowMs: number) {
  const record = state.rates[bucket];
  if (!record || record.resetAt <= Date.now()) { state.rates[bucket] = { count: 1, resetAt: Date.now() + windowMs }; return; }
  if (record.count >= max) throw new ApiError(429, 'RATE_LIMITED', 'Kuota sementara tercapai. Silakan coba lagi nanti.');
  record.count++;
}
