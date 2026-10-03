import { sleep, getWorkflowMetadata } from 'workflow';
import { claimRunStep, extractStep, submitStep, concludeStep, failStep, cleanupStep } from './verification-steps';

export async function verificationWorkflow(id: string, generation: string) {
  'use workflow';
  // Lost enqueue acknowledgements can create a second run. Only one owns this generation.
  if (!await claimRunStep(id, generation, getWorkflowMetadata().workflowRunId)) return;
  try {
    if (await extractStep(id, generation) && await submitStep(id, generation)) {
      let completed = false;
      for (let poll = 0; poll < 30; poll++) {
        if (await concludeStep(id, generation)) { completed = true; break; }
        await sleep('10s');
      }
      if (!completed) await failStep(id, generation);
    }
  } catch {
    await failStep(id, generation);
  }
  // Cron provides recovery when a workflow is cancelled or the platform is unavailable.
  await sleep('1h');
  await cleanupStep();
}
