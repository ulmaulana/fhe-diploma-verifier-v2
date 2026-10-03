import { randomBytes } from 'node:crypto';
import { start } from 'workflow/api';
import { verificationWorkflow } from '../workflows/verification';
import { ApiError, isNetlify } from './config';
import { dispatchNetlifyVerification } from './netlify-queue';
import { diagnostic } from './diagnostics';
import { accessible } from './jobs';
import { withState } from './store';
import { TERMINAL } from './types';

/** Persist dispatch intent first. A lost start response may enqueue twice; job fencing and
 * persisted signed transactions make those duplicate deliveries safe. Cron recovers gaps. */
export async function dispatchVerification(id: string) {
  if (isNetlify()) return dispatchNetlifyVerification(id);
  const generation = await withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || job.synthetic || TERMINAL.includes(job.status) || job.workflowRunId || Date.parse(job.dispatchLeaseUntil || '') > Date.now()) return null;
    job.workflowToken ??= randomBytes(32).toString('hex');
    job.leaseToken = job.workflowToken; job.leaseUntil = job.expiresAt;
    job.dispatchLeaseUntil = new Date(Date.now() + 60_000).toISOString();
    return job.workflowToken;
  });
  if (!generation) return;
  try {
    const run = await start(verificationWorkflow, [id, generation]);
    await withState(state => {
      const job = state.jobs[id];
      if (job?.workflowToken === generation) { job.workflowRunId ??= run.runId; delete job.dispatchLeaseUntil; }
    });
  } catch (error) {
    diagnostic('DISPATCH', error);
    await withState(state => {
      const job = state.jobs[id];
      if (job?.workflowToken === generation) delete job.dispatchLeaseUntil;
    });
    throw new ApiError(503, 'DISPATCH_UNAVAILABLE', 'Dokumen tersimpan, tetapi antrean belum tersedia. Silakan coba kembali.');
  }
}
