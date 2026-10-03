export interface Session { csrfToken: string; mode: 'demo' | 'testnet'; expiresAt: string; configured: boolean; uploadMode?: 'blob' | 'netlify' | 'multipart' }
let cachedSession: Promise<Session> | undefined;
async function responseData(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || fallback);
  if (!data || typeof data !== 'object') throw new Error(fallback);
  return data;
}
export function getSession(refresh = false): Promise<Session> {
  if (!cachedSession || refresh) cachedSession = fetch('/api/session', {cache:'no-store'}).then(r => responseData(r, 'Sesi tidak dapat dibuat. Muat ulang halaman.')).catch(e => {cachedSession = undefined; throw e;});
  return cachedSession;
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', (await getSession()).csrfToken);
  const response = await fetch(url, {...options,headers,cache:'no-store'});
  const data = await responseData(response, 'Permintaan gagal. Silakan coba lagi.');
  return data as T;
}
export function shortId(id: string) { return id.length > 22 ? `${id.slice(0,10)}…${id.slice(-8)}` : id; }
export function formatTime(value: string) { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
