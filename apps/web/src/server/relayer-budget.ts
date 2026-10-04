import { ApiError } from './config';
import { TERMINAL, type State } from './types';

const WINDOW_MS = 3600_000;

/** Maximum comparison transactions the relayer pays for per hour, across all instances (S-08). */
export function comparisonBudget() {
  const value = Number(process.env.MAX_COMPARISONS_PER_HOUR ?? '30');
  return Number.isSafeInteger(value) && value >= 0 ? value : 30;
}

/** Reserve one comparison for a job. Call only inside withState: the PostgreSQL row lock (or the local file
 * lock) serializes concurrent reservations, so the check and the increment are one atomic step.
 * A retry of the same job reuses its reservation; a job that already holds an outbox transaction never
 * reserves again. Reservations of jobs that vanished, were deleted or ended without a transaction return
 * to the budget. */
export function reserveComparison(state: State, jobId: string, now = Date.now(), max = comparisonBudget()) {
  let budget = state.relayerBudget;
  if (!budget || budget.windowEndsAt <= now) budget = state.relayerBudget = { windowEndsAt: now + WINDOW_MS, jobs: [] };
  budget.jobs = budget.jobs.filter(id => {
    const job = state.jobs[id];
    return Boolean(job && (job.txHash || (!job.deletedAt && !TERMINAL.includes(job.status))));
  });
  if (budget.jobs.includes(jobId)) return { reused: true, used: budget.jobs.length, max, windowEndsAt: budget.windowEndsAt };
  if (budget.jobs.length >= max) {
    throw new ApiError(429, 'COMPARISON_BUDGET_EXHAUSTED', 'Kuota transaksi pencocokan testnet untuk periode ini sudah habis. Tidak ada transaksi yang dikirim. Rekaman QR tetap dapat diperiksa; coba pemeriksaan dokumen kembali nanti.');
  }
  budget.jobs.push(jobId);
  return { reused: false, used: budget.jobs.length, max, windowEndsAt: budget.windowEndsAt };
}

/** Return a reservation when no transaction was prepared (failure or cancellation before broadcast). */
export function releaseComparison(state: State, jobId: string) {
  const budget = state.relayerBudget;
  if (!budget || state.jobs[jobId]?.txHash) return;
  budget.jobs = budget.jobs.filter(id => id !== jobId);
}
