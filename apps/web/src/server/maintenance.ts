import { getRun } from 'workflow/api';
import { accessible, cleanup } from './jobs';
import { dispatchVerification } from './dispatch';
import { failHosted } from './workflow-jobs';
import { withState } from './store';
import { TERMINAL } from './types';
import { isNetlify } from './config';
import { maintainNetlifyJobs } from './netlify-queue';

export async function maintainJobs() {
  if (isNetlify()) return maintainNetlifyJobs();
  await cleanup();
  const jobs = await withState(state => Object.values(state.jobs).filter(job => accessible(job) && !job.synthetic && !TERMINAL.includes(job.status)).map(job => ({ ...job })));
  // Bound work to a small prototype batch. Failure leaves the durable dispatch intent intact.
  for (const job of jobs.slice(0, 50)) {
    if (!job.workflowRunId) { await dispatchVerification(job.id); continue; }
    const status = await getRun(job.workflowRunId).status;
    if (['failed', 'cancelled', 'completed'].includes(status) && job.workflowToken) await failHosted(job.id, job.workflowToken);
  }
}
