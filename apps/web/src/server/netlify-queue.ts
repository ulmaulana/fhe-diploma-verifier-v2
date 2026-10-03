import { randomBytes } from 'node:crypto';
import { ApiError, config } from './config';
import { diagnostic } from './diagnostics';
import { accessible, cleanup } from './jobs';
import { withState } from './store';
import { TERMINAL } from './types';

// Longer than Netlify's hard 15-minute execution limit: an expired owner cannot
// still be executing when a replacement claims the job.
export const NETLIFY_RUN_LEASE_MS = 16 * 60_000;
export const NETLIFY_RUN_PREFIX = 'netlify:';

export async function dispatchNetlifyVerification(id: string) {
  const generation = await withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || job.synthetic || TERMINAL.includes(job.status)
      || Date.parse(job.netlifyRunUntil || '') > Date.now()
      || Date.parse(job.dispatchLeaseUntil || '') > Date.now()) return null;
    // Do not adopt an active run belonging to another execution backend.
    if (job.workflowRunId && !job.workflowRunId.startsWith(NETLIFY_RUN_PREFIX)) return null;
    job.workflowToken ??= randomBytes(32).toString('hex');
    job.leaseToken = job.workflowToken; job.leaseUntil = job.expiresAt;
    job.dispatchLeaseUntil = new Date(Date.now() + 60_000).toISOString();
    return job.workflowToken;
  });
  if (!generation) return;
  try {
    const endpoint = new URL('/.netlify/functions/verification-background', config().origin);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Invalid background origin');
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      // A per-job random capability. Never exposed in publicJob or client responses.
      body: JSON.stringify({ id, generation }),
    });
    if (response.status !== 202) throw new Error('Background invocation rejected');
    // 202 acknowledges delivery, not execution. Keep the short dispatch lease;
    // the worker claims its execution lease atomically when it actually starts.
  } catch (error) {
    diagnostic('DISPATCH', error);
    await withState(state => {
      const job = state.jobs[id];
      if (job?.workflowToken === generation) delete job.dispatchLeaseUntil;
    });
    throw new ApiError(503, 'DISPATCH_UNAVAILABLE', 'Dokumen tersimpan, tetapi antrean belum tersedia. Silakan coba kembali.');
  }
}

export async function maintainNetlifyJobs() {
  await cleanup();
  const ids = await withState(state => Object.values(state.jobs)
    .filter(job => accessible(job) && !job.synthetic && !TERMINAL.includes(job.status)
      && !(Date.parse(job.netlifyRunUntil || '') > Date.now())
      && !(Date.parse(job.dispatchLeaseUntil || '') > Date.now()))
    .sort((a, b) => Date.parse(a.dispatchLeaseUntil || a.createdAt) - Date.parse(b.dispatchLeaseUntil || b.createdAt))
    .map(job => job.id));
  // One unavailable job must not prevent recovery of the rest of the batch.
  await Promise.allSettled(ids.slice(0, 10).map(dispatchNetlifyVerification));
}
