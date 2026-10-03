/** Run while `pnpm dev` is serving localhost:3000.
 * Exercises the real local Workflow queue and generated Next.js flow/step routes.
 * An absent random job must exit at the ownership gate without any OCR/chain calls.
 * No application records or private document contents are read by this script.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(webRoot);
const origin = process.env.WORKFLOW_SMOKE_ORIGIN || 'http://localhost:3000';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use a local server only');
assert(!process.env.VERCEL, 'This smoke test is local only');
process.env.WORKFLOW_LOCAL_BASE_URL = origin;
// withWorkflow() selects this directory in Next.js; the standalone client must match.
process.env.WORKFLOW_LOCAL_DATA_DIR = '.next/workflow-data';
process.env.WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS = 'false';
const { start } = await import('workflow/api');
const { getWorld } = await import('workflow/runtime');
const { hydrateResourceIO, observabilityRevivers } = await import('workflow/observability');
const health = await fetch(`${origin}/.well-known/workflow/v1/flow?__health`);
assert.equal(health.status, 200, 'Generated workflow route must be healthy');
const manifest = JSON.parse(await readFile('src/app/.well-known/workflow/v1/manifest.json', 'utf8'));
const workflowId = manifest.workflows['src/workflows/verification.ts'].verificationWorkflow.workflowId;
const world = getWorld();
let run;
try {
  run = await start({ workflowId }, [`0x${randomBytes(32).toString('hex')}`, randomBytes(32).toString('hex')]);
  const deadline = Date.now() + 90_000;
  let status;
  do {
    status = await run.status;
    if (['completed', 'failed', 'cancelled'].includes(status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  assert.equal(status, 'completed', 'Missing job workflow must complete without retry');
  const steps = (await world.steps.list({ runId: run.runId, resolveData: 'all' })).data;
  assert.equal(steps.length, 1, 'Only the run ownership step may execute');
  const claim = hydrateResourceIO(steps[0], observabilityRevivers);
  assert.equal(claim.status, 'completed');
  assert.match(claim.stepName, /claimRunStep$/);
  assert.equal(claim.output, false, 'No absent job may claim execution');
  const events = (await world.events.list({ runId: run.runId, resolveData: 'none' })).data;
  const eventTypes = events.map(event => event.eventType);
  assert(eventTypes.includes('step_completed') && eventTypes.includes('run_completed'));
  console.log(JSON.stringify({ status, claimStep: claim.status, claimResult: claim.output, eventTypes }));
} finally {
  if (run && !['completed', 'failed', 'cancelled'].includes(await run.status)) await run.cancel();
  await world.close?.();
}
