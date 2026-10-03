import { randomBytes } from 'node:crypto';
import { hashUpload } from '@verifikasi/domain';
import { getIssuer } from '@verifikasi/chain/server';
import { ApiError, config } from './config';
import { credentialId, inspectCredential } from './credentials';
import { readStoredCredential, readStoredCredentials } from './credentials-repository';
import { readWithRetry, diagnostic } from './diagnostics';
import { DIPLOMA_TEMPLATE_VERSION, generateDiploma, graduationDate } from './diploma-pdf';
import { readDocument, readDocuments, mutateDocument } from './documents-repository';
import { getArchive, putArchive } from './storage';
import type { Session } from './types';
import type { CredentialDocument } from './document-types';

export async function authorizeDocument(current: Session, value: string) {
  const id = credentialId(value);
  if (!current.wallet) throw new ApiError(401, 'WALLET_REQUIRED', 'Masuk dengan wallet penandatangan institusi.');
  const issuer = await readWithRetry('RPC', () => getIssuer(current.wallet!));
  if (!issuer.exists || !issuer.active || !issuer.signerActive) throw new ApiError(403, 'ISSUER_UNAUTHORIZED', 'Wallet penandatangan dan institusi harus aktif.');
  const stored = await readWithRetry('PROOF_STORAGE', () => readStoredCredential(id));
  if (!stored || stored.signed.authorization.issuerId.toLowerCase() !== issuer.issuerId.toLowerCase()) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Dokumen tidak ditemukan untuk institusi ini.');
  return { id, issuerId: issuer.issuerId.toLowerCase(), documentDate: stored.documentDate };
}
function publicDocument(doc: CredentialDocument | null, documentDate?: string) {
  // Private issuer DTO. The date never enters the public credential/QR response.
  if (!doc) return { status: 'NOT_CREATED' as const, graduationDate: documentDate, dateFrozen: Boolean(documentDate) };
  const common = { templateVersion: doc.templateVersion, graduationDate: documentDate || doc.graduationDate, dateFrozen: Boolean(documentDate) || doc.generationMethod === 'ISSUER_DATA', readyAt: doc.readyAt };
  if (doc.status !== 'READY' && !doc.generationMethod) return { ...common, status: 'FAILED' as const, errorCode: 'PDF_RECREATE_REQUIRED', reason: 'PDF belum tersedia. Buat ulang PDF dari data penerbitan.', downloadUrl: null };
  const interrupted = doc.status !== 'READY' && doc.status !== 'FAILED' && Date.now() - Date.parse(doc.createdAt) > 60_000;
  return { ...common, status: doc.status, errorCode: interrupted ? 'PDF_RETRY_REQUIRED' : doc.errorCode, reason: interrupted ? 'Pembuatan PDF belum selesai. Coba kembali untuk melanjutkan penyimpanan.' : doc.reason, downloadUrl: doc.status === 'READY' ? `/api/credentials/${doc.credentialId}/document/download` : null };
}
export async function documentStatus(current: Session, id: string) {
  const auth = await authorizeDocument(current, id);
  return publicDocument(await readDocument(auth.id), auth.documentDate);
}
interface PortalRows { issuer: { issuerId: string; exists: boolean; active: boolean; signerActive: boolean }; credentials: ({ credentialId: string; revoked: boolean } | null)[] }
/** PDF statuses for a portal page, so rows render together. The issuer was already read on chain for the
 * session wallet, replacing the per-row issuer RPC. A failure leaves rows to load their own status. */
export async function portalDocuments({ issuer, credentials }: PortalRows): Promise<Record<string, ReturnType<typeof publicDocument>>> {
  if (!issuer.exists || !issuer.active || !issuer.signerActive) return {};
  const ids = credentials.flatMap(item => item && !item.revoked ? [item.credentialId.toLowerCase()] : []);
  if (!ids.length) return {};
  try {
    const issuerId = issuer.issuerId.toLowerCase();
    const stored = await readWithRetry('PROOF_STORAGE', () => readStoredCredentials(ids));
    const owned = ids.filter(id => stored.get(id)?.signed.authorization.issuerId.toLowerCase() === issuerId);
    const documents = await readDocuments(owned);
    return Object.fromEntries(owned.map(id => [id, publicDocument(documents.get(id) ?? null, stored.get(id)?.documentDate)]));
  } catch (error) { diagnostic('ARCHIVE', error); return {}; }
}

/** Issuer PDF generation is separate from verification of uploaded documents.
 * The signed profile is checked on chain; the date is frozen private issuer input,
 * not an OCR/FHE match. Legacy issuers may declare that date once. */
export async function createDocument(request: Request, current: Session, value: string, body: unknown) {
  const auth = await authorizeDocument(current, value);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'graduationDate')) throw new ApiError(400, 'INVALID_DOCUMENT_REQUEST', 'Kirim tanggal lulus saja. PDF dibuat oleh server.');
  const supplied = (body as { graduationDate?: unknown }).graduationDate;
  const date = graduationDate(supplied ?? auth.documentDate);
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Kunci pengiriman tidak valid.');
  const { verification: record, signedCredential } = await inspectCredential(auth.id);
  if (record.recordVerificationStatus !== 'VERIFIED_RECORD' || !signedCredential) throw new ApiError(409, record.recordVerificationStatus, record.reason);
  const existing = await readDocument(auth.id);
  if (existing?.status === 'READY') return publicDocument(existing, auth.documentDate);
  if (auth.documentDate && date !== auth.documentDate) throw new ApiError(409, 'DOCUMENT_DATE_MISMATCH', 'Tanggal PDF harus sama dengan tanggal yang dibekukan saat penerbitan.');
  const initial: CredentialDocument = {
    credentialId: auth.id, issuerId: auth.issuerId, jobId: `0x${randomBytes(32).toString('hex')}`,
    ownerSessionId: current.id, idempotencyKey: key, graduationDate: date, createdAt: new Date().toISOString(),
    status: 'PREPARING', templateVersion: DIPLOMA_TEMPLATE_VERSION, generationMethod: 'ISSUER_DATA',
    dateSource: auth.documentDate ? 'ISSUANCE_DRAFT' : 'ISSUER_DECLARATION', origin: config().origin,
  };
  const doc = (await mutateDocument(auth.id, initial, previous => {
    if (previous.status === 'READY') return previous;
    // Detach from the legacy OCR job so late callbacks cannot overwrite this PDF.
    if (!previous.generationMethod) return initial;
    if (previous.graduationDate !== date) throw new ApiError(409, 'DOCUMENT_FROZEN', 'Tanggal PDF telah dibekukan. Gunakan tanggal penerbitan yang sama.');
    return previous;
  }))!;
  if (doc.status === 'READY') return publicDocument(doc, auth.documentDate);
  const update = (patch: Partial<CredentialDocument>) => mutateDocument(auth.id, undefined, previous => previous.jobId === doc.jobId && previous.status !== 'READY' ? { ...previous, ...patch } : previous);
  try {
    const bytes = await generateDiploma({ credentialId: auth.id, profile: signedCredential.profile, graduationDate: doc.graduationDate, origin: doc.origin!, createdAt: doc.createdAt });
    const pdfHash = hashUpload(bytes);
    if (doc.pdfHash && doc.pdfHash !== pdfHash) throw new ApiError(409, 'PDF_CHANGED', 'Isi PDF berubah saat penyimpanan ulang. Hubungi pengelola.');
    await update({ status: 'ARCHIVING', pdfHash, errorCode: undefined, reason: undefined });
    const objectKey = await putArchive(auth.id, pdfHash, bytes);
    const { verification } = await inspectCredential(auth.id);
    if (verification.recordVerificationStatus !== 'VERIFIED_RECORD') throw new ApiError(409, verification.recordVerificationStatus, verification.reason);
    await update({ status: 'READY', objectKey, readyAt: new Date().toISOString(), errorCode: undefined, reason: undefined });
  } catch (error) {
    diagnostic('ARCHIVE', error);
    await update({ status: 'FAILED', errorCode: error instanceof ApiError ? error.code : 'PDF_UNAVAILABLE', reason: error instanceof ApiError ? error.message : 'PDF belum berhasil disimpan. Coba kembali.' });
    throw error instanceof ApiError ? error : new ApiError(503, 'PDF_UNAVAILABLE', 'PDF belum berhasil disimpan. Coba kembali.');
  }
  return publicDocument(await readDocument(auth.id), auth.documentDate);
}

export async function downloadDocument(current: Session, value: string) {
  const { id } = await authorizeDocument(current, value);
  const doc = await readDocument(id);
  if (doc?.status !== 'READY' || !doc.pdfHash) throw new ApiError(409, 'DOCUMENT_NOT_READY', 'PDF belum selesai dibuat dan disimpan.');
  const { verification } = await inspectCredential(id);
  if (verification.recordVerificationStatus !== 'VERIFIED_RECORD') throw new ApiError(409, verification.recordVerificationStatus, verification.reason);
  const bytes = await getArchive(id, doc.pdfHash);
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="ijazah-${id.slice(2, 12)}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(bytes.length) } });
}
