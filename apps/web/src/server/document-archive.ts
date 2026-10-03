import { hashUpload } from '@verifikasi/domain';
import { verifyRecord } from './credentials';
import { mutateDocument, readDocument } from './documents-repository';
import { getPrivate, putArchive } from './storage';
import { diagnostic } from './diagnostics';
import type { Job } from './types';

/** Called before a job becomes terminal or receives its one-hour cleanup deadline. */
export async function completeDocument(job: Job, result: Partial<Job>) {
  const id = job.archiveCredentialId!;
  const doc = await readDocument(id);
  if (!doc || doc.generationMethod === 'ISSUER_DATA' || doc.jobId !== job.id || doc.status === 'READY') return;
  const update = (patch: Partial<typeof doc>) => mutateDocument(id, undefined, current => current.jobId === job.id && current.status !== 'READY' ? { ...current, ...patch } : current);
  if (result.decision !== 'MATCH') {
    await update({ status: 'FAILED', errorCode: result.decision || 'ERROR', reason: result.reason || 'Pemeriksaan dokumen belum berhasil.' });
    return;
  }
  const record = await verifyRecord(id);
  if (record.recordVerificationStatus !== 'VERIFIED_RECORD') {
    result.decision = record.recordVerificationStatus === 'REVOKED' ? 'REVOKED' : 'ERROR';
    result.reason = record.reason; result.status = 'FAILED';
    await update({ status: 'FAILED', errorCode: record.recordVerificationStatus, reason: record.reason });
    return;
  }
  await update({ status: 'ARCHIVING', errorCode: undefined, reason: undefined });
  try {
    const bytes = await getPrivate(job.id, 'upload.bin');
    if (hashUpload(bytes) !== doc.pdfHash || job.digest !== doc.pdfHash || job.expectedCredentialId !== id || job.credentialId !== id) throw new Error('ARCHIVE_BINDING_MISMATCH');
    const objectKey = await putArchive(id, doc.pdfHash!, bytes);
    await update({ status: 'READY', objectKey, readyAt: new Date().toISOString() });
  } catch (error) {
    diagnostic('ARCHIVE', error);
    await update({ status: 'ARCHIVING', errorCode: 'ARCHIVE_UNAVAILABLE', reason: 'Pemeriksaan cocok, tetapi arsip belum tersimpan. Coba kembali untuk melanjutkan penyimpanan.' });
    throw new Error('ARCHIVE_UNAVAILABLE');
  }
}
