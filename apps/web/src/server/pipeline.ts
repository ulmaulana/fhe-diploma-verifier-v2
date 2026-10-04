import { assessOcr, resolveQrCandidates, FIELD_KEYS, type OcrIssue } from '@verifikasi/domain';
import { submitComparison, resumeComparisonTransaction } from '@verifikasi/chain/server';
import { ApiError, config } from './config';
import { withState, withRelayerLock } from './store';
import { getPrivate, putPrivate } from './storage';
import { accessible, finish } from './jobs';
import { limit } from './http';
import { releaseComparison, reserveComparison } from './relayer-budget';
import { verifyRecord } from './credentials';
import { FIELD_LABELS, type Extraction, type Job, type ResultField } from './types';

function ocrReason(issues: OcrIssue[], generated: boolean) {
  return [...new Set(issues.map(issue => {
    const message = generated && issue.code === 'LOW_CONFIDENCE' ? 'Pembacaan belum cukup jelas. Coba kembali untuk memeriksa PDF ulang.' : issue.message;
    return issue.field ? `${FIELD_LABELS[issue.field]}: ${message}` : message;
  }))].join(' ');
}

export function checkLease(job: Job | undefined, lease: string): asserts job is Job {
  if (!job || !accessible(job) || job.leaseToken !== lease || !job.leaseUntil || Date.parse(job.leaseUntil) <= Date.now()) throw new ApiError(409, 'LEASE_EXPIRED', 'Pekerjaan tidak lagi tersedia untuk worker.');
}
/** Workflow step after OCR: bind the QR to a record, then submit the encrypted comparison. */
export async function completeExtraction(id: string, lease: string, extraction: Extraction) {
  if (!extraction || !Array.isArray(extraction.qrCandidates) || extraction.qrCandidates.length > 20 || !extraction.fields || typeof extraction.fields !== 'object' || !/^0x[a-f0-9]{64}$/.test(extraction.ocrConfigHash || '')) throw new ApiError(400, 'INVALID_EXTRACTION', 'Hasil worker tidak valid.');
  const job = await withState(async state => {
    const item = state.jobs[id]; checkLease(item, lease);
    await putPrivate(id, 'ocr.json', Buffer.from(JSON.stringify(extraction)));
    item.ocrConfigHash = extraction.ocrConfigHash; item.ocrConfigVersion = extraction.ocrConfigVersion; item.status = 'AWAITING_CHAIN'; item.leaseUntil = item.expiresAt;
    return { ...item };
  });
  const fields: ResultField[] = FIELD_KEYS.map(key => ({ key, label: FIELD_LABELS[key], text: extraction.fields[key]?.text?.slice(0, 500) || null, confidence: extraction.fields[key]?.confidence || 0, status: 'NOT_COMPARED' }));
  const end = (patch: Partial<Job>, resultFields = fields) => finish(id, patch, resultFields, lease);
  const conclude = (reason: string) => end({ status: 'COMPLETED', decision: 'INCONCLUSIVE', reason });
  if (extraction.errorCode) {
    const errors: Record<string, string> = { PDF_PASSWORD: 'PDF dilindungi kata sandi. Unggah PDF tanpa kata sandi.', TOO_MANY_PAGES: 'Dokumen melebihi batas lima halaman.', INVALID_DOCUMENT: 'Berkas tidak dapat dibaca sebagai PDF atau gambar yang valid.', RESOLUTION_LIMIT: 'Resolusi atau ukuran halaman terlalu besar untuk diproses dengan aman.' };
    if (errors[extraction.errorCode]) return conclude(errors[extraction.errorCode]!);
    // Technical OCR failures are retried by the workflow instead of becoming a result.
    throw new Error('OCR_UNAVAILABLE');
  }
  const qr = resolveQrCandidates(extraction.qrCandidates, config().origin, job.expectedCredentialId);
  if (!qr.ok) return conclude(qr.reason);
  await withState(state => {
    const item = state.jobs[id]; checkLease(item, lease);
    if (!item.credentialId) limit(state, `credential:${qr.credentialId}`, 20, 3600_000);
    item.credentialId = qr.credentialId; item.verifiedPage = extraction.qrPage ?? undefined;
  });
  // Let the workflow classify original error codes without logging raw exceptions.
  // Local/demo mode does real OCR but deliberately never simulates blockchain for uploads.
  if (config().mode !== 'testnet') {
    const quality = assessOcr(extraction.fields, { templateSupported: Boolean(extraction.templateId), qrPage: extraction.qrPage ?? undefined, dateFormat: extraction.dateFormat });
    if (!quality.eligible) return conclude(ocrReason(quality.issues, Boolean(job.archiveCredentialId)));
    return end({ status: 'FAILED', decision: 'ERROR', reason: 'OCR selesai. Pencocokan resmi membutuhkan konfigurasi Zama testnet. Mode demonstrasi tidak menyatakan unggahan Anda cocok.' });
  }
  const record = await verifyRecord(qr.credentialId);
  const meta: Partial<Job> = { credentialId: qr.credentialId, recordVerificationStatus: record.recordVerificationStatus, issuerName: record.issuerName || undefined, checkedBlock: record.checkedBlock ?? undefined, checkedAt: record.checkedAt, chainId: record.chainId ?? undefined, contractAddress: record.contractAddress || undefined, issuanceTxHash: record.issuanceTxHash || undefined };
  await withState(state => { const item = state.jobs[id]; checkLease(item, lease); Object.assign(item, meta); });
  // Records on a legacy (protocol v1) contract are readable via QR only; the active contract cannot compare them.
  if (record.recordVerificationStatus === 'VERIFIED_RECORD' && record.legacyContract) {
    return conclude('Rekaman ini berada pada kontrak versi 1 yang hanya didukung untuk pembacaan QR. Pencocokan dokumen dengan FHE tersedia untuk kredensial pada kontrak aktif; tidak ada transaksi yang dikirim.');
  }
  if (record.recordVerificationStatus !== 'VERIFIED_RECORD') {
    const decision = record.recordVerificationStatus === 'REVOKED' ? 'REVOKED' : record.recordVerificationStatus === 'NOT_FOUND' ? 'NOT_FOUND' : record.recordVerificationStatus === 'INVALID_PROOF' ? 'INVALID_PROOF' : record.recordVerificationStatus === 'ERROR' ? 'ERROR' : 'INCONCLUSIVE';
    return end({ ...meta, status: decision === 'ERROR' ? 'FAILED' : 'COMPLETED', decision, reason: record.reason });
  }
  if (FIELD_KEYS.every(key => !extraction.fields[key]?.text?.trim())) return conclude('Belum dapat memverifikasi isi dokumen—unggah PDF ijazah lengkap');
  const assessment = assessOcr(extraction.fields, { templateSupported: Boolean(extraction.templateId), qrPage: extraction.qrPage ?? undefined, dateFormat: extraction.dateFormat });
  if (!assessment.eligible || !assessment.canonical) return conclude(ocrReason(assessment.issues, Boolean(job.archiveCredentialId)));
  // Global relayer budget (S-08): reserve atomically before any transaction is prepared. A job that already
  // holds an outbox transaction reuses it and is never counted twice.
  try {
    await withState(state => { const item = state.jobs[id]; checkLease(item, lease); if (!item.txHash) reserveComparison(state, id); });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'COMPARISON_BUDGET_EXHAUSTED') return end({ status: 'FAILED', decision: 'ERROR', reason: error.message });
    throw error;
  }
  try { await submitWithRelayer(id, lease, job, qr.credentialId, assessment.canonical!, extraction); }
  catch (error) {
    // Nothing was prepared: return the reservation so a cancellation or failure before broadcast costs nothing.
    await withState(state => releaseComparison(state, id));
    throw error;
  }
}

async function submitWithRelayer(id: string, lease: string, job: Job, credentialId: string, attributes: NonNullable<ReturnType<typeof assessOcr>['canonical']>, extraction: Extraction) {
  await withRelayerLock(async lock => {
    // Finish the outbox before allocating another nonce. A process can die after
    // persisting a signed transaction but before the RPC accepts its broadcast.
    const outstanding = await withState(state => Object.values(state.jobs).filter(item => item.id !== id && item.txHash && !item.txBroadcasted && item.credentialId && item.commitment && accessible(item)).map(item => ({ ...item })));
    for (const pending of outstanding) {
      const signed = JSON.parse((await getPrivate(pending.id, 'transaction.json')).toString()) as { hash: string; serialized: string };
      if (signed.hash !== pending.txHash) throw new Error('Stored transaction hash mismatch');
      await resumeComparisonTransaction({ requestId: pending.id, credentialId: pending.credentialId!, uploadCommitment: pending.commitment!, transactionHash: signed.hash, serializedTransaction: signed.serialized,
        beforeBroadcast: async () => {
          await lock.assertHeld();
          await withState(state => { const item = state.jobs[pending.id]; if (!item || !accessible(item) || item.txHash !== signed.hash) throw new Error('Outbox item is no longer available'); });
        },
      });
      await withState(state => { const item = state.jobs[pending.id]; if (item?.txHash === signed.hash) item.txBroadcasted = true; });
    }
    const current = await withState(state => { const item = state.jobs[id]; checkLease(item, lease); return { ...item }; });
    // Read inside the lock: a duplicated delivery must reuse the first signed transaction.
    const prior = current.txHash ? JSON.parse((await getPrivate(id, 'transaction.json')).toString()) as { hash: string; serialized: string } : undefined;
    // Decryption and the final decision happen in later workflow steps (concludeHosted).
    return submitComparison({ requestId: id, credentialId, attributes, uploadCommitment: job.commitment!, ocrConfigHash: extraction.ocrConfigHash,
    transactionHash: prior?.hash, serializedTransaction: prior?.serialized,
    onPreparedTransaction: async tx => {
      await lock.assertHeld();
      await withState(async state => {
        const item = state.jobs[id]; checkLease(item, lease);
        await putPrivate(id, 'transaction.json', Buffer.from(JSON.stringify(tx))); item.txHash = tx.hash;
      });
    },
    beforeBroadcast: async () => { await lock.assertHeld(); await withState(state => checkLease(state.jobs[id], lease)); },
    onTransaction: async hash => { await withState(state => { const item = state.jobs[id]; checkLease(item, lease); item.txHash = hash; item.txBroadcasted = true; item.status = 'AWAITING_DECRYPTION'; }); },
    });
  });
}
