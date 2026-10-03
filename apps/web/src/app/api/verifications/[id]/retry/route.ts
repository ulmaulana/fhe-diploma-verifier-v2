import { handle, json, mutation, limit } from '@/server/http';
import { accessible, owns, publicJob } from '@/server/jobs';
import { withState } from '@/server/store';
import { ApiError } from '@/server/config';
import { dispatchVerification } from '@/server/dispatch';
export const runtime = 'nodejs';
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const current = await mutation(request); const id = (await context.params).id;
  const job = await withState(state => {
    const item = owns(state, id, current.id);
    if (item.synthetic) throw new ApiError(409, 'SYNTHETIC_JOB', 'Pilih kembali skenario demonstrasi.');
    if (!accessible(item)) throw new ApiError(410, 'DOCUMENT_EXPIRED', 'Unggah ulang dokumen karena berkas sudah dihapus.');
    if (item.status !== 'FAILED') return item;
    limit(state, `retry:${current.id}`, 5, 3600_000);
    item.status = 'RECEIVED'; item.attempts = 0; delete item.decision; delete item.reason; delete item.nextAttemptAt; delete item.leaseToken; delete item.leaseUntil;
    delete item.recordVerificationStatus; delete item.checkedAt; delete item.checkedBlock;
    delete item.workflowToken; delete item.workflowRunId; delete item.dispatchLeaseUntil;
    delete item.netlifyRunUntil; delete item.netlifyAttempts;
    return item;
  });
  await dispatchVerification(job.id);
  return json(await publicJob(job), 202);
});
