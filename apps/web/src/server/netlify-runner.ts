import { timingSafeEqual } from 'node:crypto';
import { accessible } from './jobs';
import { NETLIFY_RUN_LEASE_MS, NETLIFY_RUN_PREFIX } from './netlify-queue';
import { withState } from './store';
import { TERMINAL } from './types';
import { concludeHosted, extractHosted, failHosted, recordWorkflowFailure, submitHosted } from './workflow-jobs';
import type { DiagnosticStage } from './diagnostics';

export async function runNetlifyVerification(request: Request) {
  if (request.method !== 'POST') return;
  const text = await request.text();
  if (text.length > 256) return;
  let payload: { id?: unknown; generation?: unknown };
  try { payload = JSON.parse(text); } catch { return; }
  if (!payload || typeof payload !== 'object') return;
  const { id, generation } = payload;
  if (typeof id !== 'string' || !/^0x[0-9a-f]{64}$/.test(id)
    || typeof generation !== 'string' || !/^[0-9a-f]{64}$/.test(generation)) return;
  const claimed = await withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || job.synthetic || TERMINAL.includes(job.status)
      || !job.workflowToken || job.workflowToken.length !== generation.length
      || !timingSafeEqual(Buffer.from(job.workflowToken), Buffer.from(generation))
      || Date.parse(job.netlifyRunUntil || '') > Date.now()) return false;
    if (job.workflowRunId && !job.workflowRunId.startsWith(NETLIFY_RUN_PREFIX)) return false;
    job.workflowRunId = `${NETLIFY_RUN_PREFIX}${generation}`;
    job.netlifyRunUntil = new Date(Date.now() + NETLIFY_RUN_LEASE_MS).toISOString();
    job.netlifyAttempts = (job.netlifyAttempts || 0) + 1;
    job.leaseToken = generation; job.leaseUntil = job.expiresAt;
    delete job.dispatchLeaseUntil;
    return job.netlifyAttempts;
  });
  if (!claimed) return;
  const deadline = Date.now() + 12 * 60_000;
  let stage: DiagnosticStage = 'OCR';
  try {
    if (claimed > 3) { await failHosted(id, generation); return; }
    if (!await extractHosted(id, generation)) return;
    stage = 'FHE';
    if (!await submitHosted(id, generation)) return;
    // Bounded polling leaves room for OCR and transaction submission within 15 min.
    for (let poll = 0; poll < 30 && Date.now() < deadline; poll++) {
      if (await concludeHosted(id, generation)) return;
      await new Promise(resolve => setTimeout(resolve, 10_000));
    }
    await failHosted(id, generation);
  } catch (error) {
    await recordWorkflowFailure(id, generation, stage, error);
    if (claimed >= 3) await failHosted(id, generation);
    // Netlify retries failed background invocations. OCR and signed transactions
    // already persisted by the pipeline are reused, not recreated.
    throw new Error('NETLIFY_VERIFICATION_RETRY');
  } finally {
    await withState(state => {
      const job = state.jobs[id];
      if (job?.workflowToken === generation) delete job.netlifyRunUntil;
    });
  }
}
