import { diagnostic, type DiagnosticStage } from './diagnostics';
import { createHash } from 'node:crypto';
import { config } from './config';
import { verifyRecord } from './credentials';
import { accessible, finish } from './jobs';
import { completeExtraction, checkLease } from './pipeline';
import { withState } from './store';
import { getPrivate, putPrivate } from './storage';
import { readComparison } from '@verifikasi/chain/server';
import { decideVerification, FIELD_KEYS } from '@verifikasi/domain';
import { extractDocument, OCR_CONFIG_HASH } from '@verifikasi/ocr';
import { FIELD_LABELS, resultConfidence, TERMINAL, type Extraction } from './types';

/** Document faults become a stored INCONCLUSIVE result; every other OCR error is retried. */
const PERMANENT_OCR_ERRORS = new Set(['PDF_PASSWORD', 'TOO_MANY_PAGES', 'INVALID_DOCUMENT', 'RESOLUTION_LIMIT']);

// Only opaque job IDs and generation tokens cross workflow step boundaries.
// Documents, OCR and signed transactions stay in private storage and never enter workflow history.
export async function workflowJob(id: string, generation: string) {
  return withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || TERMINAL.includes(job.status) || job.workflowToken !== generation) return null;
    checkLease(job, generation);
    return { ...job };
  });
}

export async function claimWorkflowRun(id: string, generation: string, runId: string) {
  return withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || TERMINAL.includes(job.status) || job.workflowToken !== generation || job.workflowRunId && job.workflowRunId !== runId) return false;
    job.workflowRunId = runId;
    return true;
  });
}

export async function extractHosted(id: string, generation: string): Promise<boolean> {
  const job = await workflowJob(id, generation);
  if (!job) return false;
  // A prepared transaction must keep the exact OCR evidence bound to its signed input.
  if (job.txHash || job.ocrConfigHash === OCR_CONFIG_HASH) return true;
  const needsExtraction = await withState(state => {
    const item = state.jobs[id]; checkLease(item, generation);
    if (item.txHash || item.ocrConfigHash === OCR_CONFIG_HASH) return false;
    item.status = 'EXTRACTING'; item.attempts++;
    return true;
  });
  if (!needsExtraction) return true;
  // OCR reads exactly the bytes the user finalized; re-check them after reading private storage.
  const bytes = await getPrivate(id, 'upload.bin');
  if (bytes.byteLength > config().maxBytes || `0x${createHash('sha256').update(bytes).digest('hex')}` !== job.digest) throw new Error('DIGEST_MISMATCH');
  const extraction = await extractDocument(new Uint8Array(bytes), job.mimeType);
  // Retry technical OCR failures without persisting a permanently failing result.
  if (extraction.errorCode && !PERMANENT_OCR_ERRORS.has(extraction.errorCode)) throw new Error('OCR_UNAVAILABLE');
  await withState(async state => {
    const item = state.jobs[id]; checkLease(item, generation);
    // Another delivery may have prepared the existing input while OCR was running.
    if (item.txHash) return;
    await putPrivate(id, 'ocr.json', Buffer.from(JSON.stringify(extraction)));
    item.ocrConfigHash = extraction.ocrConfigHash; item.ocrConfigVersion = extraction.ocrConfigVersion;
    item.status = 'AWAITING_CHAIN';
  });
  return true;
}

export async function submitHosted(id: string, generation: string): Promise<boolean> {
  const job = await workflowJob(id, generation);
  if (!job) return false;
  if (job.status === 'AWAITING_DECRYPTION' && job.txHash) return true;
  // A resumed Workflow can skip its completed extraction step after a config upgrade.
  if (!job.txHash && job.ocrConfigHash !== OCR_CONFIG_HASH && !await extractHosted(id, generation)) return false;
  const extraction = JSON.parse((await getPrivate(id, 'ocr.json')).toString()) as Extraction;
  await completeExtraction(id, generation, extraction);
  return Boolean(await workflowJob(id, generation));
}

export async function concludeHosted(id: string, generation: string): Promise<boolean> {
  const job = await workflowJob(id, generation);
  if (!job) return true;
  if (!job.txHash || !job.credentialId || !job.commitment) throw new Error('TRANSACTION_NOT_PREPARED');
  const result = await readComparison({ requestId: id, credentialId: job.credentialId, uploadCommitment: job.commitment, transactionHash: job.txHash });
  if (!result) return false;
  const extraction = JSON.parse((await getPrivate(id, 'ocr.json')).toString()) as Extraction;
  const record = await verifyRecord(job.credentialId);
  const decision = decideVerification({ uploadPresent: true, qrValid: true, targetMatches: true, chainReadSucceeded: record.recordVerificationStatus !== 'ERROR', recordFound: record.recordVerificationStatus !== 'NOT_FOUND', revoked: record.recordVerificationStatus === 'REVOKED', issuerAuthorized: record.recordVerificationStatus === 'VERIFIED_RECORD', recordVerificationStatus: record.recordVerificationStatus, ocrEligible: true, fieldMatches: result.matches });
  await finish(id, { status: decision.decision === 'ERROR' ? 'FAILED' : 'COMPLETED', decision: decision.decision, recordVerificationStatus: record.recordVerificationStatus, reason: decision.reason, issuerName: record.issuerName || undefined, issuanceTxHash: record.issuanceTxHash || undefined, txHash: result.transactionHash, chainId: result.chainId, contractAddress: result.contractAddress, checkedBlock: record.checkedBlock ?? undefined, checkedAt: record.checkedAt }, FIELD_KEYS.map(key => ({ key, label: FIELD_LABELS[key], text: extraction.fields[key]?.text?.slice(0, 500) || null, confidence: resultConfidence(extraction.fields[key]?.confidence), status: decision.fields[key] })), generation);

  return true;
}

export async function failHosted(id: string, generation: string) {
  // A previous workflow generation cannot change a deleted, completed or retried job.
  await withState(state => {
    const job = state.jobs[id];
    if (!job || !accessible(job) || TERMINAL.includes(job.status) || job.workflowToken !== generation) return;
    job.status = 'FAILED'; job.decision = 'ERROR';
    const code = job.diagnosticCode || 'FHE/TIMEOUT';
    job.reason = code.endsWith('INSUFFICIENT_FUNDS')
      ? `Saldo relayer testnet tidak cukup untuk transaksi pencocokan (${code}). Tidak ada transaksi yang dikirim; coba kembali setelah saldo diisi.`
      : code.startsWith('CONFIGURATION/')
        ? `Konfigurasi kunci atau peran layanan tidak valid (${code}). Tidak ada transaksi pencocokan yang dikirim.`
        : `Layanan belum menyelesaikan pemeriksaan (${code}). Silakan coba kembali untuk melanjutkan pekerjaan.`;
    job.artifactsExpireAt = new Date(Math.min(Date.parse(job.expiresAt), Date.now() + config().artifactMs)).toISOString();
    delete job.leaseToken; delete job.leaseUntil;
  });
}

export async function recordWorkflowFailure(id: string, generation: string, stage: DiagnosticStage, error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'CHAIN_CONFIGURATION_INVALID') stage = 'CONFIGURATION';
  const code = diagnostic(stage, error);
  await withState(state => {
    const job = state.jobs[id];
    if (job?.workflowToken === generation && !TERMINAL.includes(job.status)) job.diagnosticCode = `${stage}/${code}`;
  });
}
