import { RetryableError } from 'workflow';

export async function claimRunStep(id: string, generation: string, runId: string) {
  'use step';
  try { return await (await import('../server/workflow-jobs')).claimWorkflowRun(id, generation, runId); }
  catch { throw new RetryableError('JOB_STATE_UNAVAILABLE', { retryAfter: '20s' }); }
}

export async function extractStep(id: string, generation: string) {
  'use step';
  try { return await (await import('../server/workflow-jobs')).extractHosted(id, generation); }
  catch (error) { await (await import('../server/workflow-jobs')).recordWorkflowFailure(id, generation, 'OCR', error); throw new RetryableError('OCR_STEP_UNAVAILABLE', { retryAfter: '20s' }); }
}
extractStep.maxRetries = 2;

export async function submitStep(id: string, generation: string) {
  'use step';
  try { return await (await import('../server/workflow-jobs')).submitHosted(id, generation); }
  catch (error) { await (await import('../server/workflow-jobs')).recordWorkflowFailure(id, generation, 'FHE', error); throw new RetryableError('SUBMISSION_STEP_UNAVAILABLE', { retryAfter: '30s' }); }
}
submitStep.maxRetries = 4;

export async function concludeStep(id: string, generation: string) {
  'use step';
  try { return await (await import('../server/workflow-jobs')).concludeHosted(id, generation); }
  catch (error) { await (await import('../server/workflow-jobs')).recordWorkflowFailure(id, generation, 'FHE', error); throw new RetryableError('RESULT_STEP_UNAVAILABLE', { retryAfter: '20s' }); }
}
concludeStep.maxRetries = 2;

export async function failStep(id: string, generation: string) {
  'use step';
  try { await (await import('../server/workflow-jobs')).failHosted(id, generation); }
  catch { throw new RetryableError('JOB_STATE_UNAVAILABLE', { retryAfter: '20s' }); }
}

export async function cleanupStep() {
  'use step';
  try { await (await import('../server/jobs')).cleanup(); }
  catch { throw new RetryableError('RETENTION_UNAVAILABLE', { retryAfter: '1m' }); }
}
